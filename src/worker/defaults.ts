// Default parameters from training_planner_mechanics_brief.md section 9.
// Every threshold the logic module uses lives here. Values are overridden
// per-key by rows in the `settings` D1 table; a missing row falls back to
// the value below. No magic numbers belong in src/logic.

export interface Defaults {
  chronicWindowWeeks: number;
  // Weekly ratio R = km_week / C. green: [greenMin, greenMax], yellow:
  // (greenMax, red] or [lowVolume, greenMin), red: > red. Below greenMin
  // on a Build/Hold week is the separate low-volume (blue) flag, not red.
  ratioZoneEdges: { lowVolume: number; greenMin: number; greenMax: number; red: number };
  detrainingCFactorOfM12: number;
  // Also the hard invariant threshold (v1.1 review A-round 2 item 1):
  // over this, red, always -- no separate yellow tier any more.
  longRunCapFactor: number;
  lr30WindowDays: number;
  runMergeGapMin: number;
  buildCorridor: { min: number; max: number }; // x * C
  holdCorridor: { min: number; max: number }; // x * C
  downCorridorOfBuildMean: { min: number; max: number };
  downLongRunCapFactor: number; // Down week long-run cap, x * LR30 (mechanics brief section 4)
  downCadenceBuildWeeks: number; // 1 Down per N Build weeks
  hardWeekOnWeekCapPct: number; // +30%
  reentryCapFactor: number; // x * C
  descentWeightW: number;
  singleRunDminusCapFactor: number; // x * D30
  singleRunDminusRedFactor: number;
  weeklyDminusCapFactor: number; // x * DW4
  weeklyDminusRedFactor: number;
  symptomHoldThreshold: number; // region score >=
  symptomDownThreshold: number; // region score >=
  // Symptom-locked Down weeks get a stricter weekly D- cap than a routine
  // cadence Down week (mechanics brief section 5.3): x * DW4.
  symptomDownDminusWeekCapFactor: number;
  peakLongRunFactor: number; // x * race_effort_km
  peakWeekFactor: number; // x * race_effort_km
  peakWeeklyDplusFactor: number; // x * race D+
  peakSingleRunDminusFactor: number; // x * race D-
  // Fixed single percentages, not ranges (mechanics brief 6.3; v1.1 review A4).
  taperA: { weeksUnder100km: number; weeksOver100km: number; week2Pct: number; week1Pct: number; raceWeekPct: number };
  taperB: { weeks: number; pct: number };
  // Post-race Recovery (v1.1 review A3, pulled forward from v2; typed as
  // its own week type per A-round 2 item 2): the week right after a race
  // is capped at this fraction of the pre-taper peak-block mean, then the
  // week after that is a routine Down week.
  postRaceRecoveryPctOfPeak: number;
  // Recovery's long run is a flat cap, not an LR30-based rule (A-round 2
  // item 2).
  recoveryLongRunCapKm: number;
  // A race week's planned km includes shakeout runs on top of the race
  // itself (A-round 2 item 4).
  raceWeekShakeouts: { count: number; kmEach: number };
  maxWeekKm: number; // life cap
  maxLongRunKm: number;
  includeHikes: boolean;
}

export const DEFAULTS: Defaults = {
  chronicWindowWeeks: 4,
  ratioZoneEdges: { lowVolume: 0.8, greenMin: 0.8, greenMax: 1.2, red: 1.5 },
  detrainingCFactorOfM12: 0.7,
  longRunCapFactor: 1.1,
  lr30WindowDays: 30,
  runMergeGapMin: 15,
  buildCorridor: { min: 1.05, max: 1.15 },
  holdCorridor: { min: 0.9, max: 1.05 },
  downCorridorOfBuildMean: { min: 0.6, max: 0.75 },
  downLongRunCapFactor: 0.7,
  downCadenceBuildWeeks: 3,
  hardWeekOnWeekCapPct: 0.3,
  reentryCapFactor: 1.15,
  descentWeightW: 1.0,
  singleRunDminusCapFactor: 1.2,
  singleRunDminusRedFactor: 1.5,
  weeklyDminusCapFactor: 1.3,
  weeklyDminusRedFactor: 1.6,
  symptomHoldThreshold: 3,
  symptomDownThreshold: 5,
  symptomDownDminusWeekCapFactor: 0.5,
  peakLongRunFactor: 0.45,
  peakWeekFactor: 0.9,
  peakWeeklyDplusFactor: 0.6,
  peakSingleRunDminusFactor: 0.45,
  taperA: {
    weeksUnder100km: 2,
    weeksOver100km: 3,
    week2Pct: 0.7,
    week1Pct: 0.55,
    raceWeekPct: 0.4,
  },
  taperB: { weeks: 1, pct: 0.65 },
  postRaceRecoveryPctOfPeak: 0.3,
  recoveryLongRunCapKm: 15,
  raceWeekShakeouts: { count: 2, kmEach: 5 },
  maxWeekKm: 80,
  maxLongRunKm: 55,
  includeHikes: false,
};
