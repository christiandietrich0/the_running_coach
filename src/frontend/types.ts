// Mirrors src/worker/state.ts's response shape. Kept as a separate,
// standalone file (not imported from src/worker) because the frontend and
// worker tsconfigs deliberately don't share globals -- see README's Tests
// section. Only the fields the frontend actually reads are typed in full;
// `settings` is loosely typed since no screen edits it yet (Phase 8).

export type WeekType = 'BUILD' | 'HOLD' | 'DOWN' | 'TAPER' | 'RACE' | 'LIMITED' | 'RECOVERY';
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

export interface References {
  C: number;
  LR30: number;
  D30: number;
  DW4: number;
  M12: number;
  buildMean: number;
  weeksUsedForC: number;
}

export interface Corridor {
  kmMin: number;
  kmMax: number;
  lrMax: number;
  dminusWeekMax: number;
  dminusRunMax: number;
}

export interface WeekState {
  weekStart: string;
  isActual: boolean;
  kmWeek: number;
  effortKmWeek: number;
  mechKmWeek: number;
  dminusWeek: number;
  runsWeek: number;
  longestKm: number;
  longestLossM: number;
  type: WeekType;
  symptomLocked: boolean;
  userEdited: boolean;
  limitedDays: number | null;
  limitedKmCap: number | null;
  refs: References;
  corridor: Corridor;
  flags: Flag[];
  verdict: Verdict;
  raceConflictType: WeekType | null;
  raceId: number | null;
  raceName: string | null;
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

export type FeasibilityStatus = 'FEASIBLE' | 'TIGHT' | 'NOT_REACHABLE';

export interface Feasibility {
  status: FeasibilityStatus;
  weeksNeeded: number;
  weeksAvailable: number;
  slack: number;
  maxReachableLongRunKm?: number;
}

export interface RaceState {
  id: number;
  name: string;
  date: string;
  km: number;
  dplusM: number;
  dminusM: number;
  targetTimeMin: number | null;
  priority: 'A' | 'B' | 'C';
  targets: RaceTargets;
  feasibility: Feasibility | null;
}

export interface RunDTO {
  id: string;
  startLocal: string;
  distanceM: number;
  movingS: number;
  gainM: number;
  lossM: number;
  isRace: boolean;
}

// Only the fields the Chart screen's colour bands need are typed; the rest
// of the settings object still round-trips fine through the index signature.
export interface Settings {
  ratioZoneEdges: { lowVolume: number; greenMin: number; greenMax: number; red: number };
  longRunCapFactor: number;
  singleRunDminusCapFactor: number;
  weeklyDminusCapFactor: number;
  weeklyDminusRedFactor: number;
  [key: string]: unknown;
}

export interface StateResponse {
  today: string;
  currentWeekStart: string;
  settings: Settings;
  weeks: WeekState[];
  races: RaceState[];
  currentWeekRuns: RunDTO[];
  checkinNeeded: boolean;
  lastPlanUpdateAt: string | null;
}

// Bodies for the Phase 4 write endpoints (src/worker/validation.ts).

export interface PlanWeekPatch {
  type: WeekType;
  km: number | null;
  longRunKm: number | null;
  dplusM: number | null;
  dminusM: number | null;
  limitedDays: number | null;
  limitedKmCap: number | null;
}

export interface RacePatch {
  name: string;
  date: string;
  km: number;
  dplusM: number;
  dminusM: number;
  targetTimeMin: number | null;
  priority: 'A' | 'B' | 'C';
}

export interface CheckinPatch {
  heel: number;
  achilles: number;
  knee: number;
  hipOther: number;
  reducedTraining: boolean;
}

export interface ActivityOverridePatch {
  isRace: boolean | null;
  exclude: boolean;
}

export interface ActivityDTO {
  id: string;
  startLocal: string;
  type: string;
  distanceM: number;
  gainM: number;
  lossM: number;
  raceFlag: boolean;
  overrideIsRace: boolean | null;
  excluded: boolean;
  effectiveIsRace: boolean;
}

export interface SyncResult {
  mode: 'backfill' | 'incremental';
  rangeOldest: string;
  rangeNewest: string;
  includeHikes: boolean;
  activitiesFetched: number;
  activitiesStored: number;
  perMonth: Record<string, number>;
  elevationLossBackfilled: number;
  elevationLossStillMissing: number;
}
