# Weekly Load Planner

A single-user PWA that pulls run history from intervals.icu and shows,
per week: a verdict colour, a weekly km range, the max long run, and the
max descent. See `docs/training_planner_mechanics_brief.md` for the rules
and `docs/training_planner_technical_brief.md` for the architecture. The
build plan and working agreement are in `docs/claude_code_kickoff_prompt.md`.

Status: **Phase 1 (Scaffold)** complete. Sync, logic, API and UI land in
later phases.

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
