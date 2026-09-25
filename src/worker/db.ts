// Repository layer: D1 rows <-> the logic module's plain types. No logic
// lives here, only reads/writes and the shape translation.
import type { CheckIn, PlanWeek, Race, RawActivity, WeekType } from '../logic/types';
import type { Env } from './index';

interface ActivityRow {
  id: string;
  start_local: string;
  type: string;
  distance_m: number | null;
  moving_s: number | null;
  gain_m: number | null;
  loss_m: number | null;
  race_flag: number;
}

interface OverrideRow {
  activity_id: string;
  is_race: number | null;
  exclude: number;
}

export async function loadRawActivities(env: Env): Promise<RawActivity[]> {
  const [activities, overrides] = await Promise.all([
    env.DB.prepare('SELECT id, start_local, type, distance_m, moving_s, gain_m, loss_m, race_flag FROM activities').all<ActivityRow>(),
    env.DB.prepare('SELECT activity_id, is_race, exclude FROM activity_overrides').all<OverrideRow>(),
  ]);

  const overrideById = new Map((overrides.results ?? []).map((o) => [o.activity_id, o]));

  const result: RawActivity[] = [];
  for (const a of activities.results ?? []) {
    const override = overrideById.get(a.id);
    if (override?.exclude) continue;
    const isRace = override?.is_race != null ? override.is_race === 1 : a.race_flag === 1;
    result.push({
      id: a.id,
      startLocal: a.start_local,
      distanceM: a.distance_m ?? 0,
      movingS: a.moving_s ?? 0,
      gainM: a.gain_m ?? 0,
      lossM: a.loss_m ?? 0,
      isRace,
    });
  }
  return result;
}

export interface ActivityWithOverride {
  id: string;
  startLocal: string;
  type: string;
  distanceM: number;
  gainM: number;
  lossM: number;
  raceFlag: boolean; // from intervals.icu
  overrideIsRace: boolean | null; // null = no override, defer to raceFlag
  excluded: boolean;
  effectiveIsRace: boolean;
}

// Every synced activity (including excluded ones), for the Settings
// screen's race-override list (mechanics brief 8.5). loadRawActivities
// filters excluded activities out for the logic module; this doesn't,
// since Christian needs to see and un-exclude them too.
export async function loadActivitiesWithOverrides(env: Env): Promise<ActivityWithOverride[]> {
  const [activities, overrides] = await Promise.all([
    env.DB
      .prepare('SELECT id, start_local, type, distance_m, gain_m, loss_m, race_flag FROM activities ORDER BY start_local DESC')
      .all<ActivityRow>(),
    env.DB.prepare('SELECT activity_id, is_race, exclude FROM activity_overrides').all<OverrideRow>(),
  ]);

  const overrideById = new Map((overrides.results ?? []).map((o) => [o.activity_id, o]));

  return (activities.results ?? []).map((a) => {
    const override = overrideById.get(a.id);
    const raceFlag = a.race_flag === 1;
    const overrideIsRace = override?.is_race != null ? override.is_race === 1 : null;
    const excluded = override?.exclude === 1;
    return {
      id: a.id,
      startLocal: a.start_local,
      type: a.type,
      distanceM: a.distance_m ?? 0,
      gainM: a.gain_m ?? 0,
      lossM: a.loss_m ?? 0,
      raceFlag,
      overrideIsRace,
      excluded,
      effectiveIsRace: overrideIsRace ?? raceFlag,
    };
  });
}

export async function activityExists(env: Env, id: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 FROM activities WHERE id = ?').bind(id).first();
  return row != null;
}

export async function setActivityOverride(env: Env, activityId: string, isRace: boolean | null, exclude: boolean): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO activity_overrides (activity_id, is_race, exclude) VALUES (?, ?, ?)
     ON CONFLICT(activity_id) DO UPDATE SET is_race = excluded.is_race, exclude = excluded.exclude`,
  )
    .bind(activityId, isRace == null ? null : isRace ? 1 : 0, exclude ? 1 : 0)
    .run();
}

interface PlanWeekRow {
  week_start: string;
  type: string;
  km: number | null;
  long_run_km: number | null;
  dplus_m: number | null;
  dminus_m: number | null;
  limited_days: number | null;
  limited_km_cap: number | null;
  user_edited: number;
}

function rowToPlanWeek(row: PlanWeekRow): PlanWeek {
  return {
    weekStart: row.week_start,
    type: row.type as WeekType,
    km: row.km,
    longRunKm: row.long_run_km,
    dplusM: row.dplus_m,
    dminusM: row.dminus_m,
    limitedDays: row.limited_days,
    limitedKmCap: row.limited_km_cap,
    userEdited: row.user_edited === 1,
  };
}

export async function loadPlanWeeks(env: Env): Promise<PlanWeek[]> {
  const rows = await env.DB.prepare('SELECT * FROM plan_weeks').all<PlanWeekRow>();
  return (rows.results ?? []).map(rowToPlanWeek);
}

export async function upsertPlanWeek(env: Env, week: PlanWeek): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO plan_weeks (week_start, type, km, long_run_km, dplus_m, dminus_m, limited_days, limited_km_cap, user_edited)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(week_start) DO UPDATE SET
       type = excluded.type, km = excluded.km, long_run_km = excluded.long_run_km,
       dplus_m = excluded.dplus_m, dminus_m = excluded.dminus_m,
       limited_days = excluded.limited_days, limited_km_cap = excluded.limited_km_cap,
       user_edited = excluded.user_edited`,
  )
    .bind(
      week.weekStart,
      week.type,
      week.km,
      week.longRunKm,
      week.dplusM,
      week.dminusM,
      week.limitedDays,
      week.limitedKmCap,
      week.userEdited ? 1 : 0,
    )
    .run();
}

export async function upsertPlanWeeks(env: Env, weeks: PlanWeek[]): Promise<void> {
  if (weeks.length === 0) return;
  const statements = weeks.map((week) =>
    env.DB.prepare(
      `INSERT INTO plan_weeks (week_start, type, km, long_run_km, dplus_m, dminus_m, limited_days, limited_km_cap, user_edited)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(week_start) DO UPDATE SET
         type = excluded.type, km = excluded.km, long_run_km = excluded.long_run_km,
         dplus_m = excluded.dplus_m, dminus_m = excluded.dminus_m,
         limited_days = excluded.limited_days, limited_km_cap = excluded.limited_km_cap,
         user_edited = excluded.user_edited`,
    ).bind(
      week.weekStart,
      week.type,
      week.km,
      week.longRunKm,
      week.dplusM,
      week.dminusM,
      week.limitedDays,
      week.limitedKmCap,
      week.userEdited ? 1 : 0,
    ),
  );
  await env.DB.batch(statements);
}

interface RaceRow {
  id: number;
  name: string;
  date: string;
  km: number;
  dplus_m: number;
  dminus_m: number;
  target_time_min: number | null;
  priority: string;
}

function rowToRace(row: RaceRow): Race {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    km: row.km,
    dplusM: row.dplus_m,
    dminusM: row.dminus_m,
    targetTimeMin: row.target_time_min,
    priority: row.priority as Race['priority'],
  };
}

export async function loadRaces(env: Env): Promise<Race[]> {
  const rows = await env.DB.prepare('SELECT * FROM races').all<RaceRow>();
  return (rows.results ?? []).map(rowToRace);
}

// id === null creates a new race (SQLite assigns the id); otherwise
// creates-or-replaces the race at that id.
export async function upsertRace(env: Env, id: number | null, race: Omit<Race, 'id'>): Promise<Race> {
  if (id == null) {
    const result = await env.DB.prepare(
      'INSERT INTO races (name, date, km, dplus_m, dminus_m, target_time_min, priority) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(race.name, race.date, race.km, race.dplusM, race.dminusM, race.targetTimeMin, race.priority)
      .run();
    const newId = result.meta.last_row_id as number;
    return { id: newId, ...race };
  }

  await env.DB.prepare(
    `INSERT INTO races (id, name, date, km, dplus_m, dminus_m, target_time_min, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, date = excluded.date, km = excluded.km, dplus_m = excluded.dplus_m,
       dminus_m = excluded.dminus_m, target_time_min = excluded.target_time_min, priority = excluded.priority`,
  )
    .bind(id, race.name, race.date, race.km, race.dplusM, race.dminusM, race.targetTimeMin, race.priority)
    .run();
  return { id, ...race };
}

export async function deleteRace(env: Env, id: number): Promise<void> {
  await env.DB.prepare('DELETE FROM races WHERE id = ?').bind(id).run();
}

interface CheckInRow {
  week_start: string;
  heel: number;
  achilles: number;
  knee: number;
  hip_other: number;
  reduced_training: number;
}

function rowToCheckIn(row: CheckInRow): CheckIn {
  return {
    weekStart: row.week_start,
    heel: row.heel,
    achilles: row.achilles,
    knee: row.knee,
    hipOther: row.hip_other,
    reducedTraining: row.reduced_training === 1,
  };
}

export async function loadCheckins(env: Env): Promise<CheckIn[]> {
  const rows = await env.DB.prepare('SELECT * FROM checkins').all<CheckInRow>();
  return (rows.results ?? []).map(rowToCheckIn);
}

export async function upsertCheckin(env: Env, checkin: CheckIn): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO checkins (week_start, heel, achilles, knee, hip_other, reduced_training) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(week_start) DO UPDATE SET
       heel = excluded.heel, achilles = excluded.achilles, knee = excluded.knee,
       hip_other = excluded.hip_other, reduced_training = excluded.reduced_training`,
  )
    .bind(checkin.weekStart, checkin.heel, checkin.achilles, checkin.knee, checkin.hipOther, checkin.reducedTraining ? 1 : 0)
    .run();
}
