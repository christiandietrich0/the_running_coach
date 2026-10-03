-- v1.1 review A-round 2 item 4: a RACE week's row remembers which race it
-- belongs to, so the Plan screen can show the race's name on that row.
-- NULL for every other week, including a user edit.
ALTER TABLE plan_weeks ADD COLUMN race_id INTEGER;
