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
message rather than a generic error.

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

## Status

- **Phase 1 — done.** Scaffold, OpenF1 client, session picker, full session download,
  live timing table, replay clock.
- **Phase 2 — done.** Driver panel with lap chart and fitted degradation curves,
  degradation model, pit window.
- **Phase 3 — done.** Per-lap telemetry with a second-driver overlay and time delta,
  undercut/overcut simulation against the cars ahead and behind, safety car opportunity,
  and an (i) explanation on every metric.
- Phase 4 — practice/qualifying mode, polish, Vercel deploy.
