# Weekly Load Planner: Technical Brief (v1)

Companion to `training_planner_mechanics_brief.md`. Constraints: free hosting, single user, a weekend build, iOS home-screen app.

---

## 1. Stack: all on Cloudflare free tier

| Piece | Choice | Why |
|---|---|---|
| Frontend | Static PWA on **Cloudflare Pages** | Free, HTTPS by default, "Add to Home Screen" works on iOS |
| API | One **Cloudflare Worker** | Hides the intervals.icu key and avoids browser CORS. Already familiar from the MCP worker |
| Database | **Cloudflare D1** (SQLite) | Free tier is far above what's needed. Relational fits the data, and it's SQL |
| Sync | **Worker Cron Trigger**, daily at 04:00, plus a manual refresh on app open | No server to run |
| Auth | **Cloudflare Access** (email one-time code) in front of Pages and the Worker | Free, zero auth code to write |

**Not DocumentDB, and why:**
- It's AWS, it's not free, and it's overkill.
- The data is small and tabular: a few hundred activities a year, plus weeks, races and check-ins. SQLite handles that easily.
- Fallback if Cloudflare is annoying: Supabase free tier. It's Postgres, but free projects pause after a week without use.

---

## 2. Do we need a database?

Yes, but only a small one, for two reasons:

- **My own inputs have to live somewhere.** Planned weeks, races, check-ins, race overrides and settings don't exist in intervals.icu.
- **Caching activities makes the app fast and robust.** It avoids hitting the intervals.icu API on every open. It also allows backtesting against my history.

Principle: **the DB stores raw facts and my inputs. All metrics are computed in code, never stored.** One logic module means one source of truth, and it can be tested.

---

## 3. intervals.icu findings (checked against the Bukovina activity)

| Question | Finding |
|---|---|
| Is elevation loss available? | **Yes.** `total_elevation_loss` = 4,877 m on the Bukovina activity. It's on the full activity record; the MCP list summary omits it. The raw API list endpoint needs checking at build time. Fallback: fetch the detail for each run on first sync (one-off backfill) |
| Does the Strava race tag come through? | **No.** The activity is synced from Garmin Connect (`source: GARMIN_CONNECT`, `strava_id: null`), so Strava edits never reach intervals.icu. |
| Race flag | intervals.icu has its own `race` boolean (currently `false`). Tag races there, or in the app |
| Other useful fields | `start_date_local`, `type` (Run / TrailRun / Walk / Hike), `distance` (m), `moving_time` (s), `total_elevation_gain`, `total_elevation_loss`, `name` |

**Race tagging decision:** the app reads the intervals.icu `race` flag, and I can override it in-app. The override is stored in D1 and wins.

---

## 4. Data model (D1)

```sql
activities (
  id TEXT PRIMARY KEY,          -- intervals id, e.g. i181405139
  start_local TEXT NOT NULL,    -- ISO local datetime
  type TEXT NOT NULL,           -- Run, TrailRun, Walk, Hike...
  name TEXT,
  distance_m REAL,
  moving_s INTEGER,
  gain_m REAL,
  loss_m REAL,
  race_flag INTEGER DEFAULT 0,  -- from intervals.icu
  synced_at TEXT
);

activity_overrides (
  activity_id TEXT PRIMARY KEY,
  is_race INTEGER,              -- NULL = use intervals flag
  exclude INTEGER DEFAULT 0     -- e.g. GPS garbage
);

plan_weeks (
  week_start TEXT PRIMARY KEY,  -- Monday, YYYY-MM-DD
  type TEXT NOT NULL,           -- BUILD, HOLD, DOWN, TAPER, RACE, LIMITED
  km REAL, long_run_km REAL, dplus_m REAL, dminus_m REAL,
  limited_days INTEGER, limited_km_cap REAL,
  user_edited INTEGER DEFAULT 0 -- auto-fill never touches these
);

races (
  id INTEGER PRIMARY KEY,
  name TEXT, date TEXT, km REAL, dplus_m REAL, dminus_m REAL,
  target_time_min INTEGER, priority TEXT  -- A, B, C
);

checkins (
  week_start TEXT PRIMARY KEY,
  heel INTEGER, achilles INTEGER, knee INTEGER, hip_other INTEGER,
  reduced_training INTEGER
);

settings (key TEXT PRIMARY KEY, value TEXT)  -- JSON, parameters from brief section 9
```

---

## 5. Sync

- **Backfill (once):** 24 months of activities → upsert by `id`.
- **Daily cron and "refresh" on app open:** pull the last 21 days → upsert. The overlap catches late Garmin uploads and edits.
- **Auth to intervals.icu:** Basic auth `API_KEY:<key>`, with the athlete id stored as Worker secrets.
- **Stored:** Run and TrailRun only (Walk and Hike too if the setting is on). Rides and strength are ignored.

---

## 6. Logic module (TypeScript, pure functions)

One file, no I/O, unit-tested:

```
mergeRuns(activities, gapMin=15)        -> runs
weeklyAggregates(runs)                  -> km, effort_km, mech_km, dminus, runs, longest
references(weeks, runs, weekStart)      -> C, LR30, D30, DW4, M12
flags(week, refs, checkin, settings)    -> [{flag, colour, reason}]
verdict(flags)                          -> {colour, reason}
corridor(weekType, refs, settings)      -> {kmMin, kmMax, lrMax, dminusWeekMax, dminusRunMax}
raceTargets(race, settings)             -> peaks, taper
feasibility(race, plan, refs)           -> FEASIBLE | TIGHT | NOT_REACHABLE (+ max reachable LR)
suggestPlan(plan, races, refs)          -> plan (only non-user-edited weeks)
```

- **Where it runs:** in the Worker, via `GET /api/state`, which returns everything the three screens need in one response. The browser only renders.
- **Tests:** run it against my own history. The late-August 48 km week and the May heel episode should both come out red. This is a sanity check, not validation.

---

## 7. API (Worker)

| Endpoint | Does |
|---|---|
| `GET /api/state` | Weeks (history and plan) with metrics, flags, verdicts, corridors, races and feasibility |
| `POST /api/sync` | Manual refresh from intervals.icu |
| `PUT /api/plan/:week` | Edit a planned week (sets `user_edited`) |
| `POST /api/plan/suggest` | Run auto-fill, then return the new state |
| `PUT /api/races/:id`, `DELETE /api/races/:id` | Manage races |
| `PUT /api/checkin/:week` | Save a check-in |
| `PUT /api/activities/:id/override` | Race tag or exclude |
| `PUT /api/settings` | Parameters |

---

## 8. Frontend

- **Framework:** Vite with Preact, or plain TypeScript. Small bundle, no framework debates.
- **Charts:** Chart.js, using a stacked bar chart with annotation bands. uPlot is the alternative if it's too heavy.
- **Screens:** This Week, Chart, Plan, Races, Settings, plus a check-in sheet (mechanics brief section 8).
- **PWA essentials:**
  - `manifest.json` with `display: standalone`
  - `apple-touch-icon`
  - a service worker that caches the shell and the last `/api/state`, so it opens instantly and offline
- **Styling:** mobile-first, one column, dark mode respected.

---

## 9. Weekend build order

1. Worker, D1 schema, backfill sync. Verify the Bukovina activity and elevation loss land correctly.
2. Logic module with tests against my history.
3. `/api/state`, then the This Week screen.
4. Chart screen.
5. Plan screen, races, feasibility and auto-fill.
6. Check-in sheet, settings, PWA manifest and service worker, Cloudflare Access.
7. Add to Home Screen and live with it for a week before touching v2.

---

## 10. Later (v2)
- Push planned weeks to the intervals.icu calendar as NOTE events, so they show up on the watch and in Garmin.
- Tissue EWMA, the frequency flag, and post-race auto-insertion.
- A weekly summary push or email via Worker cron.
