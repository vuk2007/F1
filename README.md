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

## Status

- **Phase 1 — done.** Scaffold, OpenF1 client, session picker, full session download,
  live timing table, replay clock.
- Phase 2 — driver panel, degradation model, pit window.
- Phase 3 — telemetry, undercut simulation, safety car opportunity, full explanations.
- Phase 4 — practice/qualifying mode, polish, Vercel deploy.
