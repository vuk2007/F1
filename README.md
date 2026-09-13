# Pit Wall

Replay any Formula 1 session from 2023 onwards as if it were live, and understand what the
data is telling you: live timing with an explanation of every metric, per-driver telemetry,
and strategy predictions.

Data comes from the [OpenF1 API](https://openf1.org/docs/). Historical data is free and needs
no authentication.

## Running it

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

| Script           | What it does                                                     |
| ---------------- | ---------------------------------------------------------------- |
| `pnpm dev`       | Dev server                                                       |
| `pnpm build`     | Production build                                                 |
| `pnpm test`      | Unit tests (offline, fast)                                       |
| `pnpm smoke`     | End-to-end test against the real 2025 Monza race (needs network) |
| `pnpm typecheck` | `tsc --noEmit`                                                   |
| `pnpm lint`      | ESLint                                                           |
| `pnpm format`    | Prettier                                                         |
| `pnpm bridge`    | Live timing bridge (see `bridge/`)                               |
| `pnpm calibrate` | Refit the overtake and Q3 cut-off coefficients (needs network)   |
| `pnpm hit-rates` | Score every prediction card on held-out 2025 races               |

`node scripts/verify-schema.ts [session_key]` diffs the declared OpenF1 types against real API
responses and reports missing, extra, nullable and union-typed fields.

## Architecture

The boundaries below are deliberate: the UI never touches the network or raw API rows, and the
models never touch React.

```
lib/openf1/    API client: rate-limited queue, IndexedDB cache, typed endpoints
lib/replay/    Replay clock + pure selectors over an immutable SessionDataset
lib/models/    Pure, unit-tested strategy maths (degradation, pit window, undercut)
lib/explain/   Metric dictionary powering the (i) icons
lib/i18n/      Every user-facing string, in one file
lib/store/     One Zustand store: dataset + clock + selection
```

**Why it is shaped this way.** `SessionDataset` is the only contract between data and UI, and
every derived value comes from a pure `selector(dataset, timeMs)`. Plugging in OpenF1's paid
live feed later means appending to a `SessionDataset` — no UI or model changes.

### Rate limits

Unauthenticated OpenF1 allows **3 requests/second and 30/minute**. `lib/openf1/queue.ts`
enforces both with sliding windows and runs requests strictly sequentially; responses are
cached permanently in IndexedDB, so a session costs nine requests once and zero thereafter.

`car_data` (~3.7 Hz per car) and `location` are never fetched for a whole session — only for
one driver over one lap, using `date>=` / `date<=`.

### A note on OpenF1 availability

While a live F1 session is running, OpenF1 returns `401` to **all** unauthenticated requests,
including historical data, until the session ends. The app detects this and shows a specific
message rather than a generic error, and `pnpm smoke` fails with an explicit
`SmokeUnavailableError` saying the outage is upstream. The offline suite (`pnpm test`) covers
the same models and always runs.

`pnpm smoke` also runs its files one at a time: the rate-limited queue is per module instance,
so parallel Vitest workers would each claim the full 3 req/s budget and collectively earn a 429.

## Live mode

OpenF1's live feed is a paid subscription, so live timing comes straight from the source F1's
own timing clients use — for free. That needs a long-lived outbound WebSocket, which a
serverless deployment cannot hold, so it runs as a separate local process:

```bash
pnpm bridge            # connect to the feed, serve ws://localhost:8765, record the session
pnpm bridge:capture 60 # save 60s of raw frames to bridge/fixtures/ for tests to read
```

Everything it sees is written to `recordings/<session>.jsonl`, so a session that happens once
can be replayed offline as many times as the analysis needs.

With the bridge running, open **/live** (the "Live timing" link on the session picker). It is
the same screen as a replay, fed from the bridge instead of OpenF1: it follows the live edge,
stops following the moment you scrub back, and "Jump to live" resumes. The status bar shows
whether the bridge and the feed are each up, and how many seconds since anything arrived —
between sessions the feed sends nothing at all, so that number is what tells a quiet feed
from a broken one. "Open a recording" loads a `.jsonl` file into the same screen, and pauses
the live connection until "Back to live" so a bridge starting up cannot overwrite it.

Two things a snapshot cannot give, and the screen does not pretend to:

- **Lap history.** The feed carries current state plus each driver's best laps, so a page
  opened mid-session shows those laps and builds the rest as they happen. Sector times are
  only attached to a lap when they add up to that lap's time — the feed updates the three
  sectors independently, and trusting them put a 1:55 best lap on screen for a driver whose
  best was 1:32.
- **Pit stop durations.** The feed does not publish them, so pit loss reads as unknown for a
  live session rather than as a wrong number.

See [bridge/README.md](bridge/README.md) for the handshake, which open-source clients it was
based on, and the two things most write-ups about this feed get wrong. It is for personal,
non-commercial use only. OpenF1 remains the source for all historical and replay data.

## Verified API details

These were confirmed against the 2025 Italian GP (`session_key=9912`), not assumed:

- `pit.pit_duration` is **identical** to `lane_duration` (total pit-lane time). The stationary
  time is `stop_duration` (~2–3.5s). Pit-loss maths must use the lane figure.
- `intervals.gap_to_leader` returns the **string** `"+1 LAP"` for lapped cars (416 rows in that
  race), so gaps are `number | string | null` and are narrowed once in `parseGap`.
- `laps.i1_speed` / `st_speed`, and most `race_control` fields, can be `null`.
- **Range filters must not be URL-encoded.** OpenF1 expects `?date>=...` literally; encoding
  the operator to `date%3E%3D` returns `404 No results found`. The trailing `=` of the
  operator is also the key/value separator, so no second `=` is added. `buildQueryString()`
  handles both, with a unit test, because the only symptom is a silently empty chart.
- `car_data` is ~4.2Hz (240ms between samples); `brake` is binary 0/100, not a pressure.

## Modelling notes

These are the non-obvious decisions behind the strategy numbers. Each was forced by real
data, not chosen on theory:

- **Race degradation is corrected for fuel burn (~0.055 s/lap).** Uncorrected, every single
  driver at Monza 2025 fits a _negative_ slope — tyres apparently getting faster. Fuel burn
  outweighs the degradation at a low-wear circuit, so the raw slope has the wrong sign.
  Practice and qualifying are left uncorrected. A consequence worth knowing: the fitted line
  on the lap chart often slopes gently downward while the quoted degradation is positive.
- **A slope is never shown without its clean-lap count and confidence.** Fits with more than
  1.5s of residual scatter are graded unusable and `usableSlope()` returns null, so they can
  never reach a strategy call.
- **Laps excluded from a fit:** pit in-laps and out-laps, laps under a safety car / VSC /
  red flag, laps spent within 1.0s of the car ahead (median, not minimum), and lap 1 — a
  standing start is never a representative flying lap. If that leaves too few laps, the
  traffic filter is relaxed and the UI says so.
- **Pit loss is total pit-lane time, not stationary time.** See the verified API notes above.
- **Cars are compared on current pace, never on fit intercepts.** The intercept is a
  fuel-corrected lap time at tyre age zero, and the correction is anchored to tyre age
  rather than race lap — so two cars in different stints sit on different baselines.
  `currentPaceBase()` re-anchors them. Skipping this made a car 6.5s behind project as 16s
  ahead.
- **Safety car pit-loss reductions (SC 0.45x, VSC 0.6x) are rules of thumb**, not measured
  from the session, and are labelled as such in the UI.
- **Telemetry is plotted against distance, integrated from speed.** Accurate to about 1%
  (5731m measured against Monza's real 5793m), which is fine for lining two laps up but is
  an estimate, not a track position.
- **Outside a race, laps slower than 107% of the session best are discarded.** A practice
  stint routinely contains several hundred seconds of garage time and 130s cool-down laps;
  fitting those produced a "degradation" of -11.5 s/lap. The threshold is measured against
  the session best (as F1's own 107% rule is), not the driver's own, so a driver who never
  set a representative lap does not become their own benchmark.
- **A slope graded unusable is never displayed as a number.** `usableSlope()` returns null and
  the UI shows "not enough clean laps" instead — the raw value stays available for debugging
  but cannot be misread as a finding.

## Predictions

The Simple view has eight prediction cards in the spirit of broadcast "insight" graphics,
built only from the session's own data. Every model is a pure function in
`lib/models/predict/`; `buildPredictions()` assembles them for one moment and the cards only
render the result. Each card says **Estimate**, carries a Low / Medium / High confidence
label (from clean-lap count and fit scatter), and has an (i) saying how it was computed and
how often it was right. Engineer mode is unchanged.

**No prediction sees the future.** Every one is built from `snapshotAt(dataset, t)`, which
keeps only laps completed, stops made and stints started by `t` — with each stint's
`lap_end` cut to the current lap. OpenF1 gives a finished stint its real end from the start,
so without this a pit window on lap 20 would already know the stop on lap 31.

**Data hygiene** (`clean-laps.ts`), for every fit: in- and out-laps, laps under SC / VSC /
red flag, laps starting within 1.0 s of the car ahead, and the first two laps of a stint are
excluded. Fewer than 4 clean laps shows "Not enough data yet" instead of a number.

| Card                  | How                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tyre performance      | Median stint slope per compound; pace gap paired within the same car at 5 laps old; a "cliff" when a quadratic across the compound's laps curves up by ≥ 2 standard errors          |
| Tyre life             | Laps until staying out costs more than a stop: pit loss ÷ (wear × tyre age)                                                                                                         |
| Pit window            | Equal-length stints for the stop count that loses least; window = laps within 1 s of the best. Pit loss from this race's own green-flag stops once 2 are seen, circuit table before |
| Battle forecast       | Average of the 3-lap gap trend and both cars' predicted lap times with wear, stepped forward to 1.0 s                                                                               |
| Overtake chance       | Logistic regression on gap, pace delta, tyre-age delta and compound delta, fitted by `pnpm calibrate`                                                                               |
| Pit strategy battle   | Both drivers projected lap by lap for 1 and 2 stops in total; one stop each goes through the undercut simulation                                                                    |
| Safety car cheap stop | Rejoin position at 45% (SC) / 60% (VSC) of the pit loss against a green-flag stop                                                                                                   |
| Practice / qualifying | Long-run wear with fuel burn added back; Q3 cut-off = FP3 tenth-best minus the calibrated FP3→Q2 improvement; theoretical best from best sectors                                    |

### Calibration

`pnpm calibrate` downloads every 2024–2025 race and qualifying weekend (about 700 requests,
cached under `node_modules/.cache/`) and writes `lib/models/predict/calibration.json`:

- **Overtake.** Every pair of cars adjacent on track within 3 s at a lap start becomes a
  sample, labelled 1 if the chaser is ahead at any of the next five lap starts. Samples with a
  pit stop or caution in the window are dropped — those change the order without an
  overtake. Wet races are skipped. Features are standardised and fitted by Newton's method
  with a small L2 penalty. Latest run: 11,126 fights and 1,438 passes from 37 races, log loss
  0.265 against 0.385 for always guessing the 12.9% base rate. Pace delta and gap carry the
  weight; compound delta came out near zero once tyre age is known.
- **Q3 cut-off.** The FP3 tenth-best lap minus the Q2 tenth-best lap, per weekend; the
  median over 25 weekends is 0.688 s, typical miss 0.18 s — with outliers above 1.2 s where
  FP3 runs in the heat of the day and qualifying at night (Sakhir, Las Vegas) or on a
  rapidly evolving track (Barcelona 2024).

The three races the tests score (Monza, Bahrain and Zandvoort 2025) are held out, so the
hit rates below are measured on races the models never saw.

### Hit rates

`pnpm hit-rates` replays each finished race, predicts at a moment using only the snapshot,
and scores against what happened next (`--details` lists every call):

| Card                  | A hit is                                                 | Hits    | Rate |
| --------------------- | -------------------------------------------------------- | ------- | ---- |
| Tyre performance      | a car's lap 5 laps ahead within 0.5 s                    | 112/148 | 76%  |
| Tyre life             | the real stop within 5 laps of the estimated end of life | 15/56   | 27%  |
| Pit window            | the real stop inside the window predicted 5 laps earlier | 11/21   | 52%  |
| Pit window: rejoin    | rejoin position within 1 place                           | 29/53   | 55%  |
| Battle forecast       | laps to DRS range within 2, or both "not within 10 laps" | 91/168  | 54%  |
| Overtake chance       | right side of 50% — Brier 0.066 vs 0.093 (29% better)    | 890/969 | 92%  |
| Pit strategy battle   | finishing order under the strategies really used         | 12/16   | 75%  |
| Safety car cheap stop | rejoin position within 2 places                          | 27/38   | 71%  |
| Practice: race wear   | within 0.05 s/lap per compound (Bahrain only)            | 0/3     | 0%   |
| Q3 cut-off            | within 0.3 s (Bahrain only)                              | 0/1     | 0%   |

Read the low ones for what they are. **Tyre life** says when a stop starts to pay, not when a
team stops — teams stop for track position, and an earlier version of the test that scored
56/56 could not fail at all. **Overtake** accuracy flatters any model when passes are rare
("nobody passes" is right 87% of the time), which is why the test requires beating the base
rate's Brier score instead. **Practice wear** came out 0.08–0.15 s/lap too high at Bahrain:
long runs are short and pushed, race stints are managed. **The Q3 cut-off** predicted 1:32.423
against a real 1:31.228 — Bahrain's FP3-to-Q2 gain was 1.88 s, the biggest in the data, for
the day-versus-night reason above. Both cards say so in their (i).

`evaluate.test.ts` keeps each rate above a floor a little under these figures.

## Status

- **Phase 1 — done.** Scaffold, OpenF1 client, session picker, full session download,
  live timing table, replay clock.
- **Phase 2 — done.** Driver panel with lap chart and fitted degradation curves,
  degradation model, pit window.
- **Phase 3 — done.** Per-lap telemetry with a second-driver overlay and time delta,
  undercut/overcut simulation against the cars ahead and behind, safety car opportunity,
  and an (i) explanation on every metric.
- **Phase 4 — done.** Practice/qualifying mode with long-run vs short-run classification and
  theoretical best lap, plus deploy configuration.
- **Phase 5 — built, awaiting a live session.** Local bridge to F1's live timing feed, JSONL
  recordings, normalizers into the OpenF1 shapes, and a /live page that can also replay a
  recording. Everything is verified against a real captured snapshot; what only exists while
  cars are on track is listed in [bridge/README.md](bridge/README.md#status).
- **Phase 6 — done.** Simple / Engineer toggle with a plain-language view for newcomers
  (right-now banner, race story, driver cards, key battles, onboarding), and eight prediction
  cards with calibrated coefficients and measured hit rates — see [Predictions](#predictions).

## 2026 regulations

2026 replaced DRS with Overtake Mode, Boost Mode and Active Aero. Replays of 2023-2025 still
say DRS, because those cars had it; a 2026 session never does (`lib/season.ts` decides the era
from the session year).

**What the 2026 data actually contains**, checked against real OpenF1 responses before any
code was written (Melbourne 11234 and Monza 11361 races, Monza qualifying 11357):

- `car_data` has the same fields as 2025, including `drs`, which is `null` in every 2026 row
  sampled (about 14,700). Nothing replaced it: there is no field for Overtake Mode, Boost or
  Active Aero. `laps` and `stints` are unchanged.
- Race control sends `OVERTAKE ENABLED` / `OVERTAKE DISABLED`, the successor of
  `DRS ENABLED`. That is the only first-hand record of the mode and is used as such.
- The wording of cautions changed: `VSC DEPLOYED` / `VSC ENDING` instead of
  `VIRTUAL SAFETY CAR ...`, and red flags can arrive as a plain `RED FLAG - RACE SUSPENDED`.
  Matched on the old wording, Monza 2026's lap-3 safety car "lasted" 26 laps and every
  prediction lost its clean laps. `controlSignal()` now reads both.
- `/overtakes` exists, but counts every position exchange including starts, restarts and pit
  stops, so it only ever confirms a pass that the positions already show.
- The live feed's `CarData.z` could not be checked from a snapshot, since an idle feed does not
  send it. It is checked from the first 2026 race recorded by the bridge.

**Energy use is estimated, never shown as fact.** With no mode field, `lib/models/energy.ts`
guesses from speed, throttle and brake at ~3.7 Hz: likely lift and coast (throttle off near top
speed before braking, at least two samples), likely Boost or Overtake Mode (100 m+ clearly
faster than the driver's fastest lap on no more throttle) and likely Straight mode (speed still
rising where the reference had levelled off). On the same Monza laps, a 2026 car lifted 8 times
in 5 laps where 2025 cars did once. Telemetry shows them as grey, labelled "likely" markers;
card 9, Energy story, reads a driver as Conserving, Balanced or Attacking, always at low
confidence.

**Coefficients are per era.** `pnpm calibrate --season 2026` fits the overtake model on 2026
races only (2,153 fights, 321 passes from 10 dry races; Monza and Miami held out), adding
whether the chaser was in Overtake Mode range last lap and for how many laps in a row. On the
held-out Monza 2026 race its Brier score was 17.9% better than the base rate, and better than
the 2024-2025 model on the same race (0.234 against 0.251). The 2026 Q3 cut-off median is
0.93 s over 7 weekends. `pnpm pit-loss-table` measures pit loss per circuit from each era's
races; it also fixed six circuits whose hand-written keys ("Spa", "Monaco", "Yas Marina"...)
never matched OpenF1's names. A 2026 session only ever loads 2026 figures.

## Beyond the brief

Two additions that fell out of having the data already typed and verified:

- **Circuit map**, traced from the `location` feed for the selected telemetry lap and
  coloured by speed, with the braking zones marked. It makes the traces spatial — the brake
  chart says something happened at 3200m, the map says it was the second chicane.
- **Pace comparison** for up to five drivers, plotting their representative laps together
  with each driver's median. Gaps in a line are the excluded laps, so nobody is made to look
  slow for pitting.

### A performance note

With every panel open the replay dropped from 60fps to **9.8fps**. The cause was not the
volume of work: the clock writes a new time every frame, so the whole subtree re-rendered,
and Recharts redraws on any parent render even when its props are identical. Memoising the
panels whose props depend only on the dataset restored 60fps with the same six charts on
screen. Worth knowing before adding another chart to that page.

## Deploying

`vercel.json` pins the framework, pnpm commands and a few security headers; `package.json`
declares Node >= 20.9. Import the repository on Vercel and it builds with no further setup —
there are no environment variables and no server-side secrets, because the browser talks to
OpenF1 directly.

If OpenF1 ever blocks browser origins or the shared rate limit becomes a problem, the fix is a
thin Next.js route handler proxying `/api/openf1/*` with a cache; nothing outside
`lib/openf1/client.ts` would need to change. That is not needed today — CORS works and the
per-tab queue stays inside the limit.
