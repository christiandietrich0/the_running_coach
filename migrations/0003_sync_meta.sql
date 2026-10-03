-- v1.1 review round 5 item 3: track when a sync (manual or cron) last
-- triggered an automatic plan regeneration, so the frontend can show a
-- one-time "Plan updated from your latest runs" note. Single fixed row.
CREATE TABLE sync_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_plan_update_at TEXT
);
