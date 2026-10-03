-- v1.1 review round 10 follow-up item 2: track which deployed Worker
-- version last regenerated the plan, so GET /api/state can detect "a
-- deploy changed suggestPlan()/references() since the plan was last
-- regenerated" and re-run it automatically for non-edited future weeks,
-- without waiting for the next sync or a manual "Rebuild plan" click.
ALTER TABLE sync_meta ADD COLUMN last_regenerated_version TEXT;
