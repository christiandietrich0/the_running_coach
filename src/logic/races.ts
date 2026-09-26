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

// Steps needed to grow from currentLR30 to the race's peak long run at
// +10%/Build-week, plus 1 Down week per `downCadenceBuildWeeks` Build
// weeks, plus the taper. Slack = weeksAvailable - weeksNeeded (6.4).
export function feasibility(race: Race, currentLR30: number, weeksAvailable: number, settings: Settings): Feasibility {
  const targets = raceTargets(race, settings);
  const peakLR = targets.peakLongRunKm;
  const taperWeeksNeeded = targets.taper.length;

  let buildStepsNeeded = 0;
  if (currentLR30 <= 0) {
    buildStepsNeeded = Infinity; // no baseline to project growth from
  } else if (peakLR > currentLR30) {
    buildStepsNeeded = Math.ceil(Math.log(peakLR / currentLR30) / Math.log(settings.longRunCapFactor));
  }

  const downWeeksNeeded = Number.isFinite(buildStepsNeeded) ? Math.floor(buildStepsNeeded / settings.downCadenceBuildWeeks) : 0;
  const weeksNeeded = Number.isFinite(buildStepsNeeded) ? buildStepsNeeded + downWeeksNeeded + taperWeeksNeeded : Infinity;
  const slack = weeksAvailable - weeksNeeded;

  let status: FeasibilityStatus;
  if (slack >= 2) status = 'FEASIBLE';
  else if (slack >= 0) status = 'TIGHT';
  else status = 'NOT_REACHABLE';

  let maxReachableLongRunKm: number | undefined;
  if (status === 'NOT_REACHABLE') {
    const budget = Math.max(0, weeksAvailable - taperWeeksNeeded);
    let steps = 0;
    while (steps + Math.floor(steps / settings.downCadenceBuildWeeks) < budget) steps++;
    maxReachableLongRunKm = currentLR30 > 0 ? currentLR30 * Math.pow(settings.longRunCapFactor, steps) : 0;
  }

  return { status, weeksNeeded, weeksAvailable, slack, maxReachableLongRunKm };
}
