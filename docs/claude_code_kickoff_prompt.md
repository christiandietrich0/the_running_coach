# Claude Code Kickoff: Weekly Load Planner

You are building a personal web app with me (Christian) this weekend. Read this file first, then the two attached briefs:

- `training_planner_mechanics_brief.md`: **what** the app does. Rules, week types, flags, screens, parameters. This is the spec for behaviour.
- `training_planner_technical_brief.md`: **how** it's built. Data model, API, sync, logic module. This is the spec for structure, with the changes listed in section 3 below.

Where this file and the technical brief disagree, this file wins.

---

## 1. Where we are

- I'm an ultra trail runner, typically 3 runs per week at 50 to 70 km. My overuse episodes came from long-run spikes, not from weekly totals.
- I used myTF.run (training forecast) for injury-risk monitoring and cancelled it. It is day-based, km-only and confusing.
- We researched the science and wrote the two briefs. The rules are decided. Don't redesign them. If something in the spec looks wrong or ambiguous, ask me instead of guessing.
- My data lives in **intervals.icu** (synced from Garmin Connect, not Strava).
  - Athlete id: `i695091`.
  - I'll give you the API key when needed. It goes in as a Wrangler secret, never in code or git.
- I already have a **Cloudflare account**. It hosts an existing Worker: my intervals.icu MCP server (`icu-mcp`). **Do not modify, redeploy or delete that Worker.** The new app is a separate Worker.

## 2. What we're building

A single-user PWA I add to my iPhone home screen. It pulls my runs from intervals.icu and shows, per week:

- the verdict colour, with one reason line
- the km range for the week
- the max long run
- the max descent

It also shows a chart with coloured bands, a plan of upcoming weeks, races with feasibility, and a weekly symptom check-in. Lightweight and fast. v1 only, as defined in the mechanics brief. v2 items stay out.

## 3. Architecture decisions (final)

- **One Cloudflare Worker with static assets** serves everything:
  - the frontend
  - the `/api/*` routes
  - the daily cron sync

  That means one domain, one Access policy and no CORS. This replaces "Pages plus Worker" in the technical brief.
- **Cloudflare D1** (SQLite) is the live store, using the schema in the technical brief section 4. Migrations go through `wrangler d1 migrations`.
- **Cloudflare Access** (email one-time code, only my email allowed, 30-day session) sits in front of the whole Worker domain. I set this up in the dashboard; you give me exact click-by-click steps.
- **Logic is a pure TypeScript module** with no I/O, unit-tested with Vitest. The Worker calls it; the browser only renders.
- **Frontend:** Vite, Preact and TypeScript, with Chart.js for charts. Mobile-first, one column, dark mode aware.
- **DuckDB is not part of the app.** Optional later: a script that exports D1 tables to Parquet so I can backtest locally with DuckDB and dbt.
- **Hosting cost must stay at zero** (free tiers only).

## 4. Known facts about the intervals.icu data

These were verified on my Bukovina race, activity `i181405139`, 24 July 2026:

- **Values:** `distance` 84161.85 m, `total_elevation_gain` 5120.4 m, `total_elevation_loss` 4876.6 m, `type` TrailRun, `race` false, `source` GARMIN_CONNECT.
- **Elevation loss** is present on the full activity record. **Check first** whether the list endpoint (`GET /api/v1/athlete/{id}/activities?oldest=&newest=`) also returns `total_elevation_loss`. If it doesn't, backfill it via per-activity detail calls once, then fetch detail only for new activities.
- **Race tags:** Strava tags never reach intervals.icu. Race detection = intervals `race` flag OR the in-app override in `activity_overrides`. The override wins.
- **Auth:** Basic auth, username `API_KEY`, password = the key.

## 5. How to work with me

- **Work phase by phase** (section 6). At the end of each phase:
  - stop and show me what you did and how to check it
  - make a git commit with a clear message
  - wait for my go.
- **Before anything destructive or anything touching Cloudflare resources** (creating the D1 database, deploying, setting secrets), tell me the exact command and wait for OK.
- **Keep it small.** Few dependencies. No auth code (Access handles it). No state-management libraries.
- **Parameters:** every threshold from the mechanics brief section 9 lives in one `defaults.ts` and is overridable via the `settings` table. No magic numbers in the logic.
- **UI copy:** short and plain, and **never use em dashes**.
- **Keep a `README.md`** updated with setup, deploy and how to run the tests.

## 6. Build phases

### Phase 0: Orientation
Read all three documents. Reply with:
- your understanding in 10 lines max
- anything ambiguous in the specs
- the repo structure you propose.

No code yet.

### Phase 1: Scaffold
- Create the repo with `wrangler.toml` (Worker with assets binding, D1 binding, cron trigger at 04:00 Europe/Berlin, which is 02:00 or 03:00 UTC depending on DST; pick 02:00 UTC).
- Create the D1 schema migration.
- Set up the Vite frontend skeleton and the Vitest setup.

**Checkpoint:** `wrangler dev` runs locally and serves a placeholder page and `GET /api/health`.

### Phase 2: Sync
- Build the intervals.icu client, backfill (24 months) and incremental sync (last 21 days, upsert by id).
- Add `POST /api/sync` and the cron handler.
- Store only Run and TrailRun, plus Walk and Hike if the setting is on.

**Checkpoint:** after the backfill against local D1, activity `i181405139` matches the values in section 4, including elevation loss. Print the activity count per month for me to eyeball.

### Phase 3: Logic module
Implement the functions listed in the technical brief section 6, exactly per the mechanics brief:

- run merging (15-min gap)
- weekly aggregates
- references: C, LR30, D30, DW4 and M12, with race exclusions
- flags, verdict priority, corridors
- race targets, taper, feasibility
- suggestPlan

Write unit tests for every rule, including edge cases:
- the first weeks with little history
- race weeks skipped in C
- planned long runs feeding the forward LR30
- symptom locks
- the re-entry cap.

**Backtest:** run the logic over my real history and output a week-by-week table (km, longest run, LR30 ratio, R, D− ratios, verdict).

**Checkpoint:** I review the table. Expectations:
- The week containing the 48.1 km long run (late August 2026, inside a 102 km six-day block) must come out red.
- May 2026 (heel episode) should show a long-run or ratio flag. We'll look at it together.

### Phase 4: API
- Build `GET /api/state` (one payload for all screens) and the write endpoints from the technical brief section 7.
- Validate inputs.

**Checkpoint:** a curl walkthrough.

### Phase 5: This Week screen
- verdict colour and reason line
- three progress bars: km range, max long run, max descent (weekly and single run)
- this week's runs
- check-in prompt
- next race card.

### Phase 6: Chart screen
- 12 weeks back as solid bars, 8 to 12 ahead as hatched bars
- colour bands from C
- long-run dots with the cap line
- toggle between km, effort-km and D−.

### Phase 7: Plan and Races
- the week list with type chips and verdict dots
- the edit sheet (sets `user_edited`)
- the "Suggest plan" button
- Limited weeks
- race add/edit, with targets, taper and feasibility shown.

### Phase 8: Check-in, Settings, PWA
- Check-in: a sheet on first open each Monday. Four regions scored 0 to 10, plus "reduced training?"
- Settings: all parameters, the include-hikes toggle, and race overrides for past activities.
- PWA:
  - `manifest.json` (standalone, icons, `apple-touch-icon`)
  - a service worker caching the shell and the last `/api/state`, for an instant, offline-capable open.

### Phase 9: Deploy
- Give me the commands to:
  - create the remote D1 database
  - apply the migrations
  - set the secrets `ICU_API_KEY` and `ICU_ATHLETE_ID`
  - deploy the Worker
  - run the first remote backfill.
- Then give me click-by-click Cloudflare Access steps.
- Then give me iOS steps: open in Safari, Share, Add to Home Screen, then log in once from inside the installed app.

**Checkpoint:** it works on my phone.

## 7. Definition of done (v1)
- Opens from the iPhone home screen, behind Access, in under 2 seconds with a warm cache.
- The history is correct against intervals.icu, and the backtest table has been reviewed.
- All mechanics brief v1 rules are implemented and tested.
- I can plan the weeks to my next race and see the feasibility status.
- Zero hosting cost, and the existing `icu-mcp` Worker is untouched.
