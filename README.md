# Weekly Load Planner

A single-user PWA that pulls run history from intervals.icu and shows,
per week: a verdict colour, a weekly km range, the max long run, and the
max descent. See `docs/training_planner_mechanics_brief.md` for the rules
and `docs/training_planner_technical_brief.md` for the architecture. The
build plan and working agreement are in `docs/claude_code_kickoff_prompt.md`.

Status: **Phase 8 (Check-in, Settings, PWA)** done. Phase 9 (deploy) is
next.

## Architecture

One Cloudflare Worker serves the static frontend, `/api/*` routes, and a
daily cron sync, backed by Cloudflare D1. No separate Pages project, no
CORS. See `wrangler.toml`.

```
src/
  worker/     Worker entry, API routes, defaults.ts (all tunable thresholds)
  logic/      Pure TypeScript logic module (no I/O), Phase 3+
  frontend/   Vite + Preact + TypeScript PWA
test/         Vitest tests, mirrors src/logic
migrations/   D1 schema migrations (wrangler d1 migrations)
```

## Setup

```bash
npm install
```

## Local development

```bash
npm run dev
```

This builds the frontend and starts `wrangler dev`, serving the app and
the API from one local server (default http://localhost:8787).

- `GET /api/health` returns `{ "status": "ok", "time": "..." }`.
- Local D1 uses a SQLite file under `.wrangler/state`, keyed by the
  binding in `wrangler.toml` — no real Cloudflare D1 database is needed
  for local dev.

Apply schema migrations locally:

```bash
npm run db:migrate:local
```

## Sync

Copy `.dev.vars.example` to `.dev.vars` and fill in `ICU_API_KEY` (from
intervals.icu Settings → Developer Settings) and `ICU_ATHLETE_ID`.
`.dev.vars` is gitignored and only used for local dev; it is never read
from anywhere else and never committed.

- `POST /api/sync` runs an incremental sync (last 21 days, upsert by
  id). This is also what the daily cron trigger calls.
- `POST /api/sync?mode=backfill` runs a one-time 24-month backfill.
  Run it once after the schema is applied locally, then rely on
  incremental sync (manual or cron) from there.
- Only `Run` and `TrailRun` activities are stored, plus `Walk` and
  `Hike` if the `includeHikes` setting is on (off by default).
- Elevation loss (`total_elevation_loss`) is reused from D1 if already
  known; otherwise it's backfilled via per-activity detail calls, capped
  per sync call to stay under the Workers Free plan's 50-subrequest
  limit. A backfill with many missing values converges over a few
  repeated `mode=backfill` calls rather than one.
- Both endpoints return a JSON summary: activities fetched/stored per
  request, a per-month breakdown, and elevation-loss backfill counts.

## Logic module

`src/logic/` is the pure TypeScript rules engine (no I/O), split by
concern: `aggregate.ts` (mergeRuns, weeklyAggregates, the dense weekly
timeline), `references.ts` (C, LR30, D30, DW4, M12), `flags.ts` (the 5.1
flags, verdict, symptom check-in locks), `corridor.ts` (per-week-type
ceilings), `races.ts` (raceTargets, feasibility) and `plan.ts`
(suggestPlan). Every threshold comes from `src/worker/defaults.ts`
(`Settings`/`Defaults`), never hardcoded here.

Run the logic over the real history synced into local D1 and print a
week-by-week table:

```bash
npm run backtest
```

It shells out to `wrangler d1 execute --local`, so it needs the local D1
schema applied and at least one backfill run first (see Sync above).

## API

See `training_planner_technical_brief.md` section 7 for the full spec.
Every write endpoint validates its body (`src/worker/validation.ts`) and
returns the fresh `GET /api/state` payload, so the frontend never needs a
separate refetch after a write.

| Endpoint | Does |
|---|---|
| `GET /api/state` | Weeks (history + up to 12 weeks planned/blank ahead) with metrics, refs, corridor, flags and verdict; races with targets and feasibility; current settings |
| `POST /api/sync?mode=backfill\|incremental` | Manual refresh from intervals.icu |
| `PUT /api/plan/:week` | Edit a planned week (`:week` a Monday date). Always sets `user_edited` |
| `POST /api/plan/suggest` | Run auto-fill (never touches edited/Limited weeks), persist the result |
| `PUT /api/races/new` or `PUT /api/races/:id` | Create (`new`) or replace a race |
| `DELETE /api/races/:id` | Remove a race |
| `PUT /api/checkin/:week` | Save a symptom check-in for that week |
| `PUT /api/activities/:id/override` | Set `isRace`/`exclude` for one activity; 404 on an unknown id |
| `PUT /api/settings` | Patch one or more `defaults.ts` parameters; rejects unknown keys or a value with the wrong shape |
| `GET /api/activities` | Every synced activity (including excluded ones) with its effective race status, for the Settings screen's race-override list. Not part of `GET /api/state`, which stays screen-sized |

The current week's type reflects the check-in symptom lock (mechanics
brief 5.3) automatically; past and future weeks use their plan row's
type, or `BUILD` (or `RACE`, if any activity that week is race-flagged)
when there isn't one yet.

## Frontend screens

- **This Week** (`screens/ThisWeek.tsx`): verdict, the three progress
  stats, this week's runs, check-in prompt, next race card.
- **Chart** (`screens/Chart.tsx` + `components/WeekChart.tsx`, Chart.js):
  12 weeks back (solid bars) through the plan's lookahead (hatched),
  colour bands, a long-run/descent dot with its cap line, a km / effort-km
  / descent toggle. Two spec gaps filled by interpretation, flagged for
  Christian:
  - Colour bands: km and effort-km both use the km-based chronic
    reference C (mechanics brief 3.3 says effort-km uses "the same
    ratio" but doesn't define a separate effort-km chronic reference);
    descent uses DW4 with the weekly D- cap factors (green/yellow/red,
    no blue -- there's no low-descent flag).
  - The long-run dot switches to single-run descent (with the D30 x 1.20
    cap line) when the descent toggle is active, rather than staying on
    a km scale that wouldn't fit the metres axis.

  Known rough edge: the real history includes one very large race
  descent, which stretches the descent toggle's y-axis so smaller weeks
  flatten out. Worth a decision (log scale, or clip the axis and let
  outliers overflow) once there's more race history to judge it against.
- **Plan** (`screens/Plan.tsx`): the upcoming-weeks list (type chip, km /
  long run / D+ / D-, verdict dot), tap a row to edit it inline (sets
  `user_edited`, with Limited's days/km-cap fields appearing only for
  that type), and a "Suggest plan" button that runs the auto-fill.
- **Races** (`screens/Races.tsx`): add/edit/delete, each race showing its
  targets, taper schedule and feasibility.

Every write on Plan/Races hands the fresh `GET /api/state` response
(already returned by the write endpoint itself) straight to `App.tsx`'s
state, so there's never a second round-trip after a save.

**Bug found and fixed while testing Suggest plan**: `buildDenseTimeline`
let a plan row fully replace an already-actual week's numbers, so
running Suggest plan mid-week silently overwrote the current week's real
progress (e.g. 38km actually run) with the suggested target (e.g. 74km)
everywhere that week was displayed. Fixed in `src/logic/aggregate.ts` --
a plan row now only annotates the week's type when real data already
exists for it; the real numbers always win. Covered by a new test in
`test/logic/aggregate.test.ts`.
- **Check-in sheet** (`components/CheckinSheet.tsx`): four 0-10 sliders
  plus the reduced-training toggle. Opens automatically once per week when
  a check-in is due (`state.checkinNeeded`) and hasn't already been
  skipped this week (tracked client-side in `localStorage`, since
  "skipped" isn't a concept the backend needs to know about); also
  reachable any time by tapping the This Week check-in banner.
- **Settings** (`screens/Settings.tsx`): a sync-now button, the
  include-hikes toggle, every `defaults.ts` parameter grouped to match
  mechanics brief section 9 (`src/frontend/settingsFields.ts` is the
  single source of field labels/grouping), and the race-override list
  (mechanics brief 8.5's "race overrides for past activities") backed by
  the new `GET /api/activities` endpoint. Saving diffs the edited object
  against what was loaded and only sends the top-level keys that changed.

## PWA

`src/frontend/public/` holds everything Vite copies through unmodified:
`manifest.json` (standalone display, two icon sizes), placeholder icons
(a plain mountain glyph -- swap for real branding whenever), and
`sw.js`, a hand-written service worker (no build plugin, to keep the
dependency list as it is):

- `GET /api/state` is network-first, caching the latest successful
  response and falling back to it when offline -- last-known state
  beats a blank screen.
- Every other `/api/*` call bypasses the cache entirely (caching a write
  response would be actively wrong).
- Everything else (the shell: HTML/JS/CSS) is stale-while-revalidate:
  instant from cache, refreshed in the background. This avoids needing
  to know Vite's hashed asset filenames ahead of time, since it caches
  whatever the browser actually requests rather than a fixed precache
  list.

Registered from `main.tsx` after first paint; a failed registration
never blocks the app itself.

## Tests

```bash
npm test          # run once
npm run test:watch
npm run typecheck  # tsc --noEmit for both the worker and the frontend
```

The worker and frontend use separate `tsconfig` files
(`tsconfig.worker.json`, `tsconfig.frontend.json`) because
`@cloudflare/workers-types` and the browser DOM lib define conflicting
globals (`Request`, `Response`, `fetch`, ...).

## Deploy

Deploying touches real Cloudflare resources and needs explicit sign-off
per command, per the project's working agreement -- run these yourself
from a machine with `wrangler` logged in, not from an unattended session.

The remote D1 database is created (`database_id` in `wrangler.toml` is
the real one). What's left:

```bash
npm run db:migrate:remote
npx wrangler secret put ICU_API_KEY
npx wrangler secret put ICU_ATHLETE_ID
npm run deploy
curl -X POST "https://<your-worker-url>/api/sync?mode=backfill"
```

Then Cloudflare Access (email one-time code, your email only, 30-day
session) in front of the whole domain, and on iOS: open the Worker's URL
in Safari, log in once, Share -> Add to Home Screen.

The existing `icu-mcp` Worker on the same Cloudflare account is a
separate project and is never touched by this one.
