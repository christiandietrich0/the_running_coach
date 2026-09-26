// suggestPlan(): auto-fills unlocked future weeks. See
// training_planner_mechanics_brief.md section 7.
//
// This never touches weeks the user has edited or tagged Limited (7).
// Races (any priority) drive the plan directly (v1.1 review A3): each one
// contributes a peak week, its taper weeks, the race week itself, and two
// recovery weeks after it (Limited then Down). Everything else is filled
// forward at the Build/Build/Build/Down cadence. Every generated week's
// long run is clamped through corridor()'s lrMax, which already folds in
// the full A1 cap formula (type cap rule, max_long_run_km, the driving
// race's peak long run, and 0.55x the week's own km) -- so no generated
// week can ever come out above what corridor() would flag red.
import { addDays, addWeeks, mondayOf } from './dates';
import { buildDenseTimeline } from './aggregate';
import { corridor } from './corridor';
import { references } from './references';
import { raceTargets } from './races';
import type { PlanWeek, Race, RaceTargets, Run, Settings, WeeklyAggregate, WeekType } from './types';

export interface SuggestPlanInput {
  currentWeekStart: string;
  existingPlan: PlanWeek[];
  races: Race[];
  actualAggregates: WeeklyAggregate[];
  actualRuns: Run[];
  settings: Settings;
  horizonWeeks?: number; // only matters when there are no races to anchor to
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

export type RaceSlotKind = 'PEAK' | 'TAPER' | 'RACE' | 'POST_LIMITED' | 'POST_DOWN';

export interface RaceSlot {
  weekStart: string;
  kind: RaceSlotKind;
  race: Race;
  targets: RaceTargets;
  volumePct?: number; // TAPER only
}

// The week type a race slot corresponds to, for conflict detection against
// a user-edited week (v1.1 review A3: "Conflicts with race" instead of
// silently overwriting). PEAK has no distinct type of its own -- it's a
// Build week with an elevated target, not a structurally different one --
// so it never conflicts.
export function raceSlotWeekType(kind: RaceSlotKind): WeekType | null {
  switch (kind) {
    case 'RACE':
      return 'RACE';
    case 'TAPER':
      return 'TAPER';
    case 'POST_LIMITED':
      return 'LIMITED';
    case 'POST_DOWN':
      return 'DOWN';
    case 'PEAK':
      return null;
  }
}

// Every week a race drives, keyed by weekStart: the peak week (the Build
// week right before the taper starts, if there is one), the taper weeks,
// the race week itself, and the two recovery weeks after it (Limited then
// Down -- pulled forward from v2 per the review). Pure function of race
// dates and settings only, so it doubles as the source of truth for
// conflict detection. Races are processed oldest-first, so a later race's
// slots win any collision with an earlier race's trailing recovery weeks.
export function raceStructureSlots(races: Race[], settings: Settings): Map<string, RaceSlot> {
  const slots = new Map<string, RaceSlot>();
  const sorted = [...races].sort((a, b) => (a.date < b.date ? -1 : 1));

  for (const race of sorted) {
    const targets = raceTargets(race, settings);
    const raceWeekStart = mondayOf(race.date);
    const taperOnly = targets.taper.filter((t) => t.label !== 'race week');
    const earliestTaperStart = taperOnly.reduce((min, t) => (t.weekStart < min ? t.weekStart : min), raceWeekStart);

    if (taperOnly.length > 0) {
      slots.set(addDays(earliestTaperStart, -7), { weekStart: addDays(earliestTaperStart, -7), kind: 'PEAK', race, targets });
    }
    for (const t of taperOnly) {
      slots.set(t.weekStart, { weekStart: t.weekStart, kind: 'TAPER', race, targets, volumePct: t.volumePct });
    }
    slots.set(raceWeekStart, { weekStart: raceWeekStart, kind: 'RACE', race, targets });
    slots.set(addDays(raceWeekStart, 7), { weekStart: addDays(raceWeekStart, 7), kind: 'POST_LIMITED', race, targets });
    slots.set(addDays(raceWeekStart, 14), { weekStart: addDays(raceWeekStart, 14), kind: 'POST_DOWN', race, targets });
  }

  return slots;
}

// The earliest upcoming race's peak long run, for the "peak LR of the next
// race" global cap (A1) on ordinary Build/Down weeks that aren't
// themselves part of any race's structure.
function nextRaceTargets(races: Race[], weekStart: string, settings: Settings): RaceTargets | undefined {
  const upcoming = races.filter((r) => mondayOf(r.date) >= weekStart).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return upcoming ? raceTargets(upcoming, settings) : undefined;
}

export function suggestPlan(input: SuggestPlanInput): PlanWeek[] {
  const { currentWeekStart, existingPlan, races, actualAggregates, actualRuns, settings } = input;
  const horizonWeeks = input.horizonWeeks ?? 16;
  const horizonEnd = addWeeks(currentWeekStart, horizonWeeks);

  const byWeek = new Map<string, PlanWeek>(existingPlan.map((w) => [w.weekStart, w]));
  const { dplusPerKm, dminusPerKm } = recentSlopes(actualAggregates, settings.chronicWindowWeeks);
  const slots = raceStructureSlots(races, settings);
  const peakMeanByRaceId = new Map<number, number>();

  const filled: PlanWeek[] = [];
  let buildStreak = 0;

  // Real history + whatever's been filled so far, so C/LR30/DW4 roll
  // forward through the plan (3.2, 3.4).
  function refsAt(cursor: string) {
    const timeline = buildDenseTimeline(actualAggregates, filled);
    return references({ weekStart: cursor, denseTimeline: timeline, actualRuns }, settings);
  }

  // The mean km of the peak block (the last up-to-4 weeks generated right
  // before a race's taper/race week), cached per race: the post-race
  // Limited week needs the same figure its own taper did, not whatever's
  // most recently been filled by the time it's reached (which by then is
  // the race week and taper themselves).
  function peakMeanFor(race: Race): number {
    const cached = peakMeanByRaceId.get(race.id);
    if (cached != null) return cached;
    const recent = filled.slice(-4);
    const mean = recent.length > 0 ? recent.reduce((s, w) => s + (w.km ?? 0), 0) / recent.length : 0;
    peakMeanByRaceId.set(race.id, mean);
    return mean;
  }

  for (let cursor = currentWeekStart; cursor < horizonEnd; cursor = addDays(cursor, 7)) {
    const existing = byWeek.get(cursor);
    if (isLocked(existing)) {
      if (existing!.type === 'LIMITED') buildStreak = 0;
      filled.push(existing!);
      continue;
    }

    const slot = slots.get(cursor);

    if (slot?.kind === 'RACE') {
      filled.push({
        weekStart: cursor,
        type: 'RACE',
        km: slot.race.km,
        longRunKm: slot.race.km,
        dplusM: slot.race.dplusM,
        dminusM: slot.race.dminusM,
        limitedDays: null,
        limitedKmCap: null,
        userEdited: false,
      });
      buildStreak = 0;
      continue;
    }

    if (slot?.kind === 'PEAK') {
      const dplusRatioFactor = 1 + dplusPerKm / 100;
      const km = dplusRatioFactor > 0 ? slot.targets.peakWeekEffortKm / dplusRatioFactor : slot.targets.peakWeekEffortKm;
      const refs = refsAt(cursor);
      const c = corridor('BUILD', refs, settings, { kmForLongRunCap: km, peakLongRunKm: slot.targets.peakLongRunKm });
      filled.push({
        weekStart: cursor,
        type: 'BUILD',
        km,
        longRunKm: c.lrMax,
        dplusM: dplusPerKm * km,
        dminusM: Math.min(dminusPerKm * km, c.dminusWeekMax),
        limitedDays: null,
        limitedKmCap: null,
        userEdited: false,
      });
      buildStreak += 1;
      continue;
    }

    if (slot?.kind === 'TAPER') {
      const peakMean = peakMeanFor(slot.race);
      const km = (slot.volumePct ?? 0) * peakMean;
      const refs = refsAt(cursor);
      const c = corridor('TAPER', refs, settings, { kmForLongRunCap: km, peakLongRunKm: slot.targets.peakLongRunKm });
      filled.push({
        weekStart: cursor,
        type: 'TAPER',
        km,
        longRunKm: c.lrMax,
        dplusM: dplusPerKm * km,
        dminusM: Math.min(dminusPerKm * km, c.dminusWeekMax),
        limitedDays: null,
        limitedKmCap: null,
        userEdited: false,
      });
      continue;
    }

    if (slot?.kind === 'POST_LIMITED') {
      const peakMean = peakMeanFor(slot.race);
      const kmCap = settings.postRaceLimitedPctOfPeak * peakMean;
      const refs = refsAt(cursor);
      const c = corridor('LIMITED', refs, settings, { limitedKmCap: kmCap, kmForLongRunCap: kmCap });
      filled.push({
        weekStart: cursor,
        type: 'LIMITED',
        km: kmCap,
        longRunKm: c.lrMax,
        dplusM: dplusPerKm * kmCap,
        dminusM: Math.min(dminusPerKm * kmCap, c.dminusWeekMax),
        limitedDays: null,
        limitedKmCap: kmCap,
        userEdited: false,
      });
      buildStreak = 0;
      continue;
    }

    // Ordinary Build/Down cadence -- also where a race's POST_DOWN slot
    // lands, just forcing this particular week to Down.
    let type: WeekType;
    if (slot?.kind === 'POST_DOWN') {
      type = 'DOWN';
      buildStreak = 0;
    } else if (buildStreak >= settings.downCadenceBuildWeeks) {
      type = 'DOWN';
      buildStreak = 0;
    } else {
      type = 'BUILD';
      buildStreak += 1;
    }

    const refs = refsAt(cursor);
    const base = corridor(type, refs, settings);
    const km = Number.isFinite(base.kmMax) ? (base.kmMin + base.kmMax) / 2 : refs.C || 0;
    const nextTargets = nextRaceTargets(races, cursor, settings);
    const c = corridor(type, refs, settings, { kmForLongRunCap: km, peakLongRunKm: nextTargets?.peakLongRunKm });
    const projectedLongRun = refs.LR30 > 0 ? settings.longRunCapFactor * refs.LR30 : km * 0.4;
    const longRunKm = Math.min(projectedLongRun, c.lrMax);

    filled.push({
      weekStart: cursor,
      type,
      km,
      longRunKm,
      dplusM: dplusPerKm * km,
      dminusM: Math.min(dminusPerKm * km, base.dminusWeekMax),
      limitedDays: null,
      limitedKmCap: null,
      userEdited: false,
    });
  }

  return filled.sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}
