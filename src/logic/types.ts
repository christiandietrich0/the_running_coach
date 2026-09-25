// Shared types for the pure logic module. See training_planner_mechanics_brief.md
// for the rules and training_planner_technical_brief.md section 6 for the
// function list this module implements.
import type { Defaults } from '../worker/defaults';

export type Settings = Defaults;

export type WeekType = 'BUILD' | 'HOLD' | 'DOWN' | 'TAPER' | 'RACE' | 'LIMITED';

export type FlagColour = 'GREEN' | 'BLUE' | 'YELLOW' | 'RED';

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
  volumeMinPct: number;
  volumeMaxPct: number;
}

export interface RaceTargets {
  raceEffortKm: number;
  peakLongRunKm: number;
  peakWeekEffortKm: number;
  peakWeeklyDplusM: number;
  peakSingleRunDminusM: number;
  taper: TaperWeek[];
}

export type FeasibilityStatus = 'FEASIBLE' | 'TIGHT' | 'NOT_REACHABLE';

export interface Feasibility {
  status: FeasibilityStatus;
  weeksNeeded: number;
  weeksAvailable: number;
  slack: number;
  maxReachableLongRunKm?: number;
}
