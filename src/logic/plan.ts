// suggestPlan(): auto-fills unlocked future weeks. See
// training_planner_mechanics_brief.md section 7.
//
// This never touches weeks the user has edited or tagged Limited (7).
// Numbers for filled weeks are proposed from the general Build-style
// formula (km at the corridor midpoint, long run at min(1.10 x projected
// LR30, peak LR)) and then clamped to that week's own corridor, which is
// how step 4 ("recheck every week, anything above yellow gets trimmed")
// is enforced without a separate search: each corridor bound already sits
// exactly at a flag's green/yellow boundary, so clamping to it can't leave
// a week red.
import { addDays, addWeeks, mondayOf } from './dates';
import { buildDenseTimeline } from './aggregate';
import { corridor } from './corridor';
import { references } from './references';
import { raceTargets } from './races';
import type { PlanWeek, Race, Run, Settings, WeeklyAggregate, WeekType } from './types';

export interface SuggestPlanInput {
  currentWeekStart: string;
  existingPlan: PlanWeek[];
  races: Race[];
  actualAggregates: WeeklyAggregate[];
  actualRuns: Run[];
  settings: Settings;
  horizonWeeks?: number; // only used when there's no upcoming A race to anchor to
}

function isLocked(week: PlanWeek | undefined): boolean {
  return !!week && (week.userEdited || week.type === 'LIMITED');
}

// Recent D+/km and D-/km ratios, used to scale a filled week's D+/D- from
// its planned km (7.3). No history yet -> project no descent.
function recentSlopes(actualAggregates: WeeklyAggregate[], windowWeeks: number): { dplusPerKm: number; dminusPerKm: number } {
  const recent = [...actualAggregates].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1)).slice(0, windowWeeks);
  const km = recent.reduce((s, w) => s + w.kmWeek, 0);
  if (km <= 0) return { dplusPerKm: 0, dminusPerKm: 0 };
  const dplusM = recent.reduce((s, w) => s + (w.effortKmWeek - w.kmWeek) * 100, 0); // effortKmWeek = km + D+/100
  const dminusM = recent.reduce((s, w) => s + w.dminusWeek, 0);
  return { dplusPerKm: dplusM / km, dminusPerKm: dminusM / km };
}

export function suggestPlan(input: SuggestPlanInput): PlanWeek[] {
  const { currentWeekStart, existingPlan, races, actualAggregates, actualRuns, settings } = input;
  const horizonWeeks = input.horizonWeeks ?? 16;

  const byWeek = new Map<string, PlanWeek>(existingPlan.map((w) => [w.weekStart, w]));
  const { dplusPerKm, dminusPerKm } = recentSlopes(actualAggregates, settings.chronicWindowWeeks);

  const horizonEnd = addWeeks(currentWeekStart, horizonWeeks);
  const nextA = races
    .filter((r) => r.priority === 'A' && mondayOf(r.date) >= currentWeekStart && mondayOf(r.date) <= horizonEnd)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  const anchored = new Map<string, PlanWeek>();
  let peakWeekStart: string | null = null;
  let peakLongRunKm = 0;

  // 1. Anchor backward from the next A race: race week, taper weeks, then
  // the peak week right before the taper starts (7.1).
  if (nextA) {
    const targets = raceTargets(nextA, settings);
    const raceWeekStart = mondayOf(nextA.date);
    peakLongRunKm = targets.peakLongRunKm;

    for (const t of targets.taper) {
      if (isLocked(byWeek.get(t.weekStart))) continue;
      const isRaceWeek = t.weekStart === raceWeekStart;
      anchored.set(t.weekStart, {
        weekStart: t.weekStart,
        type: isRaceWeek ? 'RACE' : 'TAPER',
        km: isRaceWeek ? nextA.km : null, // taper weeks' km filled in once the peak-week mean is known
        longRunKm: isRaceWeek ? nextA.km : null,
        dplusM: isRaceWeek ? nextA.dplusM : null,
        dminusM: isRaceWeek ? nextA.dminusM : null,
        limitedDays: null,
        limitedKmCap: null,
        userEdited: false,
      });
    }

    const earliestTaper = targets.taper.reduce((min, t) => (t.weekStart < min ? t.weekStart : min), raceWeekStart);
    peakWeekStart = addDays(earliestTaper, -7);
  }

  // 2. Fill forward from currentWeekStart: Build, Build, Build, Down,
  // stopping at the peak week (or the horizon, with no race to anchor
  // to). Limited weeks are locked (never touched) but still reset the
  // Down counter for weeks after them (7.2).
  const stopAt = peakWeekStart ?? horizonEnd;
  const filled: PlanWeek[] = [];
  let buildStreak = 0;

  for (let cursor = currentWeekStart; cursor < stopAt; cursor = addDays(cursor, 7)) {
    const existing = byWeek.get(cursor);
    if (isLocked(existing)) {
      if (existing!.type === 'LIMITED') buildStreak = 0;
      filled.push(existing!);
      continue;
    }

    let type: WeekType;
    if (buildStreak >= settings.downCadenceBuildWeeks) {
      type = 'DOWN';
      buildStreak = 0;
    } else {
      type = 'BUILD';
      buildStreak += 1;
    }

    // Real history + whatever's been filled so far, so C/LR30/DW4 roll
    // forward through the plan (3.2, 3.4).
    const timeline = buildDenseTimeline(actualAggregates, filled);
    const refs = references({ weekStart: cursor, denseTimeline: timeline, actualRuns }, settings);
    const c = corridor(type, refs, settings);

    const km = Number.isFinite(c.kmMax) ? (c.kmMin + c.kmMax) / 2 : refs.C || 0;
    const projectedLongRun = refs.LR30 > 0 ? settings.longRunCapFactor * refs.LR30 : km * 0.4;
    const longRunKm = Math.min(projectedLongRun, peakLongRunKm || projectedLongRun, c.lrMax);

    filled.push({
      weekStart: cursor,
      type,
      km,
      longRunKm,
      dplusM: dplusPerKm * km,
      dminusM: Math.min(dminusPerKm * km, c.dminusWeekMax),
      limitedDays: null,
      limitedKmCap: null,
      userEdited: false,
    });
  }

  // 3. The peak week itself: sourced straight from raceTargets (6.2), not
  // the generic Build formula, since it's a deliberate target, not a
  // rolling projection.
  if (peakWeekStart && nextA && !isLocked(byWeek.get(peakWeekStart))) {
    const targets = raceTargets(nextA, settings);
    const dplusRatioFactor = 1 + dplusPerKm / 100;
    const km = dplusRatioFactor > 0 ? targets.peakWeekEffortKm / dplusRatioFactor : targets.peakWeekEffortKm;
    filled.push({
      weekStart: peakWeekStart,
      type: 'BUILD',
      km,
      longRunKm: targets.peakLongRunKm,
      dplusM: dplusPerKm * km,
      dminusM: dminusPerKm * km,
      limitedDays: null,
      limitedKmCap: null,
      userEdited: false,
    });
  }

  // 4. Taper weeks' volume: % of the peak 4-week mean (6.3), now that the
  // peak week and the block before it are known. Taper long runs are kept
  // short: <=50% of the peak long run for the A taper (6.3's "≤50% of
  // peak LR"); B has no explicit rule, so the same ratio is used as a
  // reasonable default.
  const peak4 = filled.slice(-4);
  const peak4Mean = peak4.length > 0 ? peak4.reduce((s, w) => s + (w.km ?? 0), 0) / peak4.length : 0;

  if (nextA) {
    const targets = raceTargets(nextA, settings);
    for (const t of targets.taper) {
      const week = anchored.get(t.weekStart);
      if (!week || week.type === 'RACE') continue;
      const pctMid = (t.volumeMinPct + t.volumeMaxPct) / 2;
      const km = pctMid * peak4Mean;
      anchored.set(t.weekStart, {
        ...week,
        km,
        longRunKm: Math.min(0.5 * peakLongRunKm, km),
        dplusM: dplusPerKm * km,
        dminusM: dminusPerKm * km,
      });
    }
  }

  return [...filled, ...anchored.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}
