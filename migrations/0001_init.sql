-- Initial schema. See training_planner_technical_brief.md section 4.

CREATE TABLE activities (
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

CREATE TABLE activity_overrides (
  activity_id TEXT PRIMARY KEY,
  is_race INTEGER,              -- NULL = use intervals flag
  exclude INTEGER DEFAULT 0     -- e.g. GPS garbage
);

CREATE TABLE plan_weeks (
  week_start TEXT PRIMARY KEY,  -- Monday, YYYY-MM-DD
  type TEXT NOT NULL,           -- BUILD, HOLD, DOWN, TAPER, RACE, LIMITED
  km REAL,
  long_run_km REAL,
  dplus_m REAL,
  dminus_m REAL,
  limited_days INTEGER,
  limited_km_cap REAL,
  user_edited INTEGER DEFAULT 0 -- auto-fill never touches these
);

CREATE TABLE races (
  id INTEGER PRIMARY KEY,
  name TEXT,
  date TEXT,
  km REAL,
  dplus_m REAL,
  dminus_m REAL,
  target_time_min INTEGER,
  priority TEXT                 -- A, B, C
);

CREATE TABLE checkins (
  week_start TEXT PRIMARY KEY,
  heel INTEGER,
  achilles INTEGER,
  knee INTEGER,
  hip_other INTEGER,
  reduced_training INTEGER
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT                    -- JSON, parameters from mechanics brief section 9
);

CREATE INDEX idx_activities_start_local ON activities(start_local);
