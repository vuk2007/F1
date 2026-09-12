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
