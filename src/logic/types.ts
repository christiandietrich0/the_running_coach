// Shared types for the pure logic module. See training_planner_mechanics_brief.md
// for the rules and training_planner_technical_brief.md section 6 for the
// function list this module implements.
import type { Defaults } from '../worker/defaults';

export type Settings = Defaults;

export type WeekType = 'BUILD' | 'HOLD' | 'DOWN' | 'TAPER' | 'RACE' | 'LIMITED' | 'RECOVERY';

// RACE is a distinct, neutral colour verdict() never itself produces (its
// input is always an empty flag list for a Race week) -- the caller
// assigns it directly for a Race week, since a race isn't "on track" or
// "overloaded" against training references at all (v1.1 review round 4
// item 1).
export type FlagColour = 'GREEN' | 'BLUE' | 'YELLOW' | 'RED' | 'RACE';

export type FlagKind = 'SYMPTOMS' | 'LONG_RUN' | 'DESCENT_SINGLE' | 'DESCENT_WEEKLY' | 'RATIO' | 'LOW_VOLUME';

export interface Flag {
  kind: FlagKind;
  colour: FlagColour;
  reason: string;
  value?: number;
  ref?: number;
}

export interface Verdict {
  colour: FlagColour;
  reason: string;
  flags: Flag[];
}

// One activity as stored in D1 (activity_overrides already resolved into isRace).
export interface RawActivity {
  id: string;
  startLocal: string; // ISO local datetime, no offset, e.g. "2026-07-24T22:59:29"
  distanceM: number;
  movingS: number;
  gainM: number;
  lossM: number;
  isRace: boolean;
}

// A run after mergeRuns has merged same-session activities (mechanics brief 2).
export interface Run {
  id: string; // first merged activity's id
  activityIds: string[];
  startLocal: string;
  endLocal: string;
  distanceM: number;
  movingS: number;
  gainM: number;
  lossM: number;
  isRace: boolean;
}

export interface WeeklyAggregate {
  weekStart: string; // Monday, YYYY-MM-DD
  kmWeek: number;
  effortKmWeek: number;
  mechKmWeek: number;
  dminusWeek: number;
  runsWeek: number;
  longestKm: number;
  longestLossM: number;
  longestDate: string | null; // calendar date of the week's longest run
  hasRace: boolean;
}

// One week on the unified timeline references() walks: either an actual
// completed week (weekType null) or a planned/future week treated as if
// done, per mechanics brief 3.4 ("planned long runs count as if done").
// Built dense (no gaps) so "previous N weeks" always means N calendar
// weeks, including weeks with zero training.
export interface TimelinePoint {
  weekStart: string;
  kmWeek: number;
  dminusWeek: number;
  longRunKm: number | null;
  longRunLossM: number | null;
  longRunDate: string | null;
  isRaceWeek: boolean;
  weekType: WeekType | null; // null = actual historical week, no assigned plan type
}

export interface References {
  C: number;
  LR30: number;
  D30: number;
  DW4: number;
  M12: number;
  // Trailing 4-week and 10-week mean km_week, same trailing-window shape
  // as M12 -- used by injuryRisk.ts's load-trend check (mean4Week /
  // mean10Week > 1.3 or 1.5), not by anything else (v1.1 review round 10
  // follow-up, Part 2).
  mean4Week: number;
  mean10Week: number;
  buildMean: number; // mean km_week of the current Build block, for Down corridors
  weeksUsedForC: number; // how many qualifying weeks were actually found (<= chronicWindowWeeks)
}

export interface Corridor {
  kmMin: number;
  kmMax: number;
  lrMax: number;
  dminusWeekMax: number;
  dminusRunMax: number;
}

export interface CheckIn {
  weekStart: string;
  heel: number;
  achilles: number;
  knee: number;
  hipOther: number;
  reducedTraining: boolean;
}

// injuryRisk.ts's scoring breakdown. See that file's header for the full
// shape (v1.1 review round 10 Part 2).
export type InjuryRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type InjuryRiskSource = 'LONG_RUN' | 'DESCENT' | 'RATIO' | 'TREND' | 'SYMPTOMS';

export interface InjuryRiskContributor {
  source: InjuryRiskSource;
  label: string; // short, e.g. "Descent flag" -- for the details list
  weekStart: string | null; // the week this contributor's flag came from; null for TREND/SYMPTOMS
  reason: string; // the full flag reason, or a trend/symptom sentence, for the details view
  weight: number; // the per-week weight applied, or 1 for TREND/SYMPTOMS (unweighted)
  rawPoints: number;
  weightedPoints: number;
}

export interface InjuryRisk {
  level: InjuryRiskLevel;
  weightedSum: number;
  // True when the symptom override (a region >= symptom.highMin, or
  // reducedTraining checked) forced High regardless of weightedSum.
  overrideHigh: boolean;
  // Every nonzero contributor, sorted by weightedPoints descending -- the
  // UI shows the top 2 inline and the rest in the details view.
  contributors: InjuryRiskContributor[];
}

export interface PlanWeek {
  weekStart: string;
  type: WeekType;
  km: number | null;
  longRunKm: number | null;
  dplusM: number | null;
  dminusM: number | null;
  limitedDays: number | null;
  limitedKmCap: number | null;
  userEdited: boolean;
  // Set only on a RACE week suggestPlan() generated for this race; null
  // for every other week, including a user edit (v1.1 review A-round 2
  // item 4: lets the row show the race's name).
  raceId: number | null;
}

export interface Race {
  id: number;
  name: string;
  date: string; // YYYY-MM-DD
  km: number;
  dplusM: number;
  dminusM: number;
  targetTimeMin: number | null;
  priority: 'A' | 'B' | 'C';
}

export interface TaperWeek {
  weekStart: string;
  label: string;
  volumePct: number;
}

export interface RaceTargets {
  raceEffortKm: number;
  peakLongRunKm: number;
  peakWeekEffortKm: number;
  peakWeeklyDplusM: number;
  peakSingleRunDminusM: number;
  taper: TaperWeek[];
}

// LOCKED_IN: inside the race's own final weeks (feasibilityLockedInWeeks),
// where there's no more building left to project -- see feasibility()'s
// own comment (v1.1 review round 10 follow-up item 4).
export type FeasibilityStatus = 'FEASIBLE' | 'TIGHT' | 'NOT_REACHABLE' | 'LOCKED_IN';

export interface Feasibility {
  status: FeasibilityStatus;
  weeksNeeded: number;
  weeksAvailable: number;
  slack: number;
  // The long run actually reachable by race day, given how many Build
  // steps fit in the weeks available (v1.1 review round 8 item 2). Always
  // set, like maxReachableWeekKm below, so the "Long run reachable" reason
  // line can always show it, not just when status is NOT_REACHABLE.
  maxReachableLongRunKm: number;
  // The highest peak-week km actually reachable by race day, given how
  // many Build steps fit in the weeks available (v1.1 review round 6):
  // suggestPlan() clamps every generated week -- including the peak -- to
  // green-max x C, so the race's own peak week target (raceTargets()'s
  // peakWeekEffortKm) is only reachable if C itself can grow enough for
  // that ceiling to cover it. Always set (never above the race's own
  // target), not just when status is NOT_REACHABLE -- a race can be a
  // stretch on weekly volume alone while comfortably Tight or even
  // Feasible on long run.
  maxReachableWeekKm: number;
}
