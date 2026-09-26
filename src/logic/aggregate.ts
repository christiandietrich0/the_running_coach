// mergeRuns, weeklyAggregates, and the dense weekly timeline references()
// walks. See training_planner_mechanics_brief.md sections 2, 3.1 and 3.4.
import { addDays, mondayOf } from './dates';
import type { PlanWeek, RawActivity, Run, Settings, TimelinePoint, WeeklyAggregate } from './types';

const MS_PER_MIN = 60 * 1000;

// start_local has no timezone offset (intervals.icu's local wall-clock
// time). Appending Z anchors every timestamp to the same fake-UTC
// reference frame, so subtracting them yields the right elapsed seconds
// without the host machine's timezone leaking into the merge decision.
function parseLocal(iso: string): number {
  return Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : `${iso}Z`);
}

function toLocalIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

// Runs with less than `gapMin` minutes between them are merged into one,
// so a café stop doesn't split a long run in two (mechanics brief 2).
export function mergeRuns(activities: RawActivity[], gapMin = 15): Run[] {
  const sorted = [...activities].sort((a, b) => a.startLocal.localeCompare(b.startLocal));
  const runs: Run[] = [];

  for (const activity of sorted) {
    const startMs = parseLocal(activity.startLocal);
    const endMs = startMs + activity.movingS * 1000;
    const last = runs[runs.length - 1];

    if (last) {
      const gapMs = startMs - parseLocal(last.endLocal);
      if (gapMs <= gapMin * MS_PER_MIN) {
        last.activityIds.push(activity.id);
        last.distanceM += activity.distanceM;
        last.movingS += activity.movingS;
        last.gainM += activity.gainM;
        last.lossM += activity.lossM;
        last.isRace = last.isRace || activity.isRace;
        last.endLocal = toLocalIso(Math.max(endMs, parseLocal(last.endLocal)));
        continue;
      }
    }

    runs.push({
      id: activity.id,
      activityIds: [activity.id],
      startLocal: activity.startLocal,
      endLocal: toLocalIso(endMs),
      distanceM: activity.distanceM,
      movingS: activity.movingS,
      gainM: activity.gainM,
      lossM: activity.lossM,
      isRace: activity.isRace,
    });
  }

  return runs;
}

// km_week, effort_km_week, mech_km_week, dminus_week, runs_week and the
// week's longest run (mechanics brief 3.1). Race weeks null out their own
// longest-run figures downstream in buildDenseTimeline, not here: this
// function only reports facts, it doesn't decide reference eligibility.
export function weeklyAggregates(runs: Run[], settings: Settings): Map<string, WeeklyAggregate> {
  const byWeek = new Map<string, WeeklyAggregate>();

  for (const run of runs) {
    const weekStart = mondayOf(run.startLocal);
    const km = run.distanceM / 1000;

    let agg = byWeek.get(weekStart);
    if (!agg) {
      agg = {
        weekStart,
        kmWeek: 0,
        effortKmWeek: 0,
        mechKmWeek: 0,
        dminusWeek: 0,
        runsWeek: 0,
        longestKm: 0,
        longestLossM: 0,
        longestDate: null,
        hasRace: false,
      };
      byWeek.set(weekStart, agg);
    }

    agg.kmWeek += km;
    agg.effortKmWeek += km + run.gainM / 100;
    agg.mechKmWeek += km + (settings.descentWeightW * run.lossM) / 100;
    agg.dminusWeek += run.lossM;
    agg.runsWeek += 1;
    if (km > agg.longestKm) {
      agg.longestKm = km;
      agg.longestLossM = run.lossM;
      agg.longestDate = run.startLocal.slice(0, 10);
    }
    if (run.isRace) agg.hasRace = true;
  }

  return byWeek;
}

// A dense (gap-free) week-by-week timeline combining actual aggregates
// with any planned weeks, sorted ascending from the earliest known week
// through the latest planned one. Missing weeks (no activity, no plan
// row) become explicit zero weeks, so "the previous 4 weeks" always means
// 4 calendar weeks rather than 4 weeks-that-happened-to-have-a-run.
//
// A race is excluded from the LR30/D30 *reference* pool (3.4's "race-
// tagged runs excluded"), but that happens via actualRuns in
// references.ts's longRunPoints(), which only ever reads an actual week's
// long-run fields here for weekType == null anyway. So an actual race
// week's own longRunKm/longRunLossM/longRunDate stay populated with the
// race itself: the display (This Week/Plan/Chart) should show the race
// distance as that week's long run, not null it out (v1.1 review round 4
// item 1). A planned RACE week already sets these directly from the race
// (plan.ts), independent of this file.
// Planned weeks only carry a weekly D- total (plan_weeks.dminus_m), not a
// per-run figure; since this athlete's descent load sits almost entirely
// on the long run of a 3-run week, the planned long run's D- is
// approximated as the full planned weekly D- (suggestPlan uses the same
// convention when deriving D+/D- for weeks it fills, mechanics brief 7.3).
export function buildDenseTimeline(
  actual: WeeklyAggregate[],
  planned: PlanWeek[],
  rangeFrom?: string,
  rangeTo?: string,
): TimelinePoint[] {
  const byWeek = new Map<string, TimelinePoint>();

  for (const a of actual) {
    byWeek.set(a.weekStart, {
      weekStart: a.weekStart,
      kmWeek: a.kmWeek,
      dminusWeek: a.dminusWeek,
      longRunKm: a.longestKm <= 0 ? null : a.longestKm,
      longRunLossM: a.longestKm <= 0 ? null : a.longestLossM,
      longRunDate: a.longestKm <= 0 ? null : a.longestDate,
      isRaceWeek: a.hasRace,
      weekType: null,
    });
  }

  for (const p of planned) {
    // A week already in progress (the current week, most often) has both
    // real activity data AND a plan row once a plan exists for it. The
    // real numbers are what actually happened and must win; only the
    // plan's type is recorded, so corridor/buildMean still see it as
    // e.g. a Down week even while it's mid-week.
    const existing = byWeek.get(p.weekStart);
    if (existing) {
      existing.weekType = p.type;
      continue;
    }

    const isRaceWeek = p.type === 'RACE';
    // A planned RACE week's own longRunKm is the race distance itself
    // (plan.ts), not something to null back out here -- it's excluded from
    // the LR30/D30 reference pool via isRaceWeek in longRunPoints(), not by
    // being absent (v1.1 review round 4 item 1).
    const longRunKm = p.longRunKm ?? null;
    byWeek.set(p.weekStart, {
      weekStart: p.weekStart,
      kmWeek: p.km ?? 0,
      dminusWeek: p.dminusM ?? 0,
      longRunKm,
      longRunLossM: longRunKm == null ? null : p.dminusM ?? null,
      longRunDate: longRunKm == null ? null : p.weekStart,
      isRaceWeek,
      weekType: p.type,
    });
  }

  // rangeFrom/rangeTo extend the span beyond what actual/planned data
  // covers (e.g. so "this week" always has an entry even with no runs and
  // no plan row yet). They only ever widen the range: actual/planned data
  // outside them still wins.
  const weeks = [...byWeek.keys()];
  if (rangeFrom) weeks.push(rangeFrom);
  if (rangeTo) weeks.push(rangeTo);
  weeks.sort();
  if (weeks.length === 0) return [];

  const dense: TimelinePoint[] = [];
  let cursor = weeks[0];
  const last = weeks[weeks.length - 1];
  while (cursor <= last) {
    dense.push(
      byWeek.get(cursor) ?? {
        weekStart: cursor,
        kmWeek: 0,
        dminusWeek: 0,
        longRunKm: null,
        longRunLossM: null,
        longRunDate: null,
        isRaceWeek: false,
        weekType: null,
      },
    );
    cursor = addDays(cursor, 7);
  }

  return dense;
}
