// raceTargets() and feasibility(). See training_planner_mechanics_brief.md
// section 6.
import { addWeeks, mondayOf } from './dates';
import type { Feasibility, FeasibilityStatus, Race, RaceTargets, Settings, TaperWeek } from './types';

export function raceEffortKm(race: Race): number {
  return race.km + race.dplusM / 100;
}

// Peaks (6.2) and taper schedule (6.3). The brief's week-2/week-1/race-week
// numbers (70% / 50-60% / 35-45%) are exactly the 3-week taper for races
// over 100km -- no invented week needed. The standard 2-week taper is the
// shorter case: week-2 is dropped, leaving just week-1 and race week.
export function raceTargets(race: Race, settings: Settings): RaceTargets {
  const effortKm = raceEffortKm(race);
  const peakLongRunKm = Math.min(settings.peakLongRunFactor * effortKm, settings.maxLongRunKm);
  const peakWeekEffortKm = Math.min(settings.peakWeekFactor * effortKm, settings.maxWeekKm);
  const peakWeeklyDplusM = settings.peakWeeklyDplusFactor * race.dplusM;
  const peakSingleRunDminusM = settings.peakSingleRunDminusFactor * race.dminusM;

  const raceWeekStart = mondayOf(race.date);
  const taper: TaperWeek[] = [];

  if (race.priority === 'A') {
    const weeksOut = effortKm > 100 ? settings.taperA.weeksOver100km : settings.taperA.weeksUnder100km;
    if (weeksOut > 2) {
      taper.push({ weekStart: addWeeks(raceWeekStart, -2), label: 'week -2', volumePct: settings.taperA.week2Pct });
    }
    taper.push({ weekStart: addWeeks(raceWeekStart, -1), label: 'week -1', volumePct: settings.taperA.week1Pct });
    taper.push({ weekStart: raceWeekStart, label: 'race week', volumePct: settings.taperA.raceWeekPct });
  } else if (race.priority === 'B') {
    const weekStart = addWeeks(raceWeekStart, -settings.taperB.weeks);
    taper.push({ weekStart, label: 'week -1', volumePct: settings.taperB.pct });
    taper.push({ weekStart: raceWeekStart, label: 'race week', volumePct: settings.taperB.pct });
  }
  // Priority C: train through, no taper weeks (6.3).

  return { raceEffortKm: effortKm, peakLongRunKm, peakWeekEffortKm, peakWeeklyDplusM, peakSingleRunDminusM, taper };
}

// Weeks needed to grow from `current` to `target` at +10%/Build-step (the
// same rate corridor()'s own Build corridor progresses at), plus 1 Down
// week per `downCadenceBuildWeeks` Build steps, plus the taper. Shared by
// both the long-run and the weekly-volume feasibility arms below (v1.1
// review round 6) -- they're the same growth shape, just projecting a
// different reference forward.
function stepsToReach(current: number, target: number, settings: Settings): number {
  if (current <= 0) return Infinity; // no baseline to project growth from
  if (target <= current) return 0;
  return Math.ceil(Math.log(target / current) / Math.log(settings.longRunCapFactor));
}

function weeksForSteps(steps: number, taperWeeksNeeded: number, settings: Settings): number {
  if (!Number.isFinite(steps)) return Infinity;
  return steps + Math.floor(steps / settings.downCadenceBuildWeeks) + taperWeeksNeeded;
}

// How far `current` could actually grow, at the same +10%/Build-step rate,
// within `budget` weeks (already net of the taper) -- how many steps fit
// once 1 Down week per `downCadenceBuildWeeks` Build steps is subtracted.
function reachableAt(current: number, budget: number, settings: Settings): number {
  if (current <= 0) return 0;
  let steps = 0;
  while (steps + Math.floor(steps / settings.downCadenceBuildWeeks) < budget) steps++;
  return current * Math.pow(settings.longRunCapFactor, steps);
}

// Long run needs currentLR30 to reach the race's peak long run (6.4).
// Weekly volume (v1.1 review round 6) needs the chronic average C to reach
// a level whose green-max ceiling (1.2x C -- the same ceiling suggestPlan()
// itself now clamps every generated week to, peak week included) covers
// the race's own peak week target: a race demanding more than the runner's
// fitness currently supports comes out as a Tight or Not-reachable race,
// not as a plan that quietly generates a yellow/red week. The race is only
// as feasible as its more demanding dimension, so weeksNeeded is the worse
// of the two arms; slack = weeksAvailable - weeksNeeded (6.4).
export function feasibility(race: Race, currentLR30: number, currentC: number, weeksAvailable: number, settings: Settings): Feasibility {
  const targets = raceTargets(race, settings);
  const taperWeeksNeeded = targets.taper.length;

  const longRunWeeksNeeded = weeksForSteps(stepsToReach(currentLR30, targets.peakLongRunKm, settings), taperWeeksNeeded, settings);
  const targetCForPeakWeek = targets.peakWeekEffortKm / settings.ratioZoneEdges.greenMax;
  const volumeWeeksNeeded = weeksForSteps(stepsToReach(currentC, targetCForPeakWeek, settings), taperWeeksNeeded, settings);

  const weeksNeeded = Math.max(longRunWeeksNeeded, volumeWeeksNeeded);
  const slack = weeksAvailable - weeksNeeded;

  let status: FeasibilityStatus;
  if (slack >= 2) status = 'FEASIBLE';
  else if (slack >= 0) status = 'TIGHT';
  else status = 'NOT_REACHABLE';

  const budget = Math.max(0, weeksAvailable - taperWeeksNeeded);

  let maxReachableLongRunKm: number | undefined;
  if (status === 'NOT_REACHABLE') {
    maxReachableLongRunKm = reachableAt(currentLR30, budget, settings);
  }

  const reachableC = reachableAt(currentC, budget, settings);
  const maxReachableWeekKm = Math.min(targets.peakWeekEffortKm, reachableC * settings.ratioZoneEdges.greenMax);

  return { status, weeksNeeded, weeksAvailable, slack, maxReachableLongRunKm, maxReachableWeekKm };
}
