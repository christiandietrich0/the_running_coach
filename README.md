# Weekly Load Planner

A single-user PWA that pulls run history from intervals.icu and shows,
per week: a verdict colour, a weekly km range, the max long run, and the
max descent. See `docs/training_planner_mechanics_brief.md` for the rules
and `docs/training_planner_technical_brief.md` for the architecture. The
build plan and working agreement are in `docs/claude_code_kickoff_prompt.md`.

Status: **Phase 5 (This Week screen)** in progress. Chart, Plan, Races,
Settings and the check-in sheet land in later phases.

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

The current week's type reflects the check-in symptom lock (mechanics
brief 5.3) automatically; past and future weeks use their plan row's
type, or `BUILD` (or `RACE`, if any activity that week is race-flagged)
when there isn't one yet.

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

Not done yet. Deploying touches real Cloudflare resources (D1 database
creation, secrets, the Worker itself) and needs explicit sign-off first,
per the project's working agreement. Phase 9 will add the exact commands
here: `wrangler d1 create`, `wrangler d1 migrations apply --remote`,
`wrangler secret put ICU_API_KEY`, `wrangler secret put ICU_ATHLETE_ID`,
`wrangler deploy`.

The existing `icu-mcp` Worker on the same Cloudflare account is a
separate project and is never touched by this one.
