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
  // The long-run global cap's "x this week's own km" share (A1) isn't one
  // fixed fraction: a week built around 3 or fewer runs necessarily puts a
  // bigger share of its total into the long run than one spread over 4+
  // (v1.1 review round 5 item 2).
  longRunShareCap: { runsThreshold: number; fewRunsFactor: number; manyRunsFactor: number };
  // A race week's planned km includes shakeout runs on top of the race
  // itself (A-round 2 item 4).
  raceWeekShakeouts: { count: number; kmEach: number };
  maxWeekKm: number; // life cap
  maxLongRunKm: number;
  includeHikes: boolean;
  // feasibility()'s NOT_REACHABLE -> TIGHT downgrade (6.4, v1.1 review
  // round 9 item 3): a race whose long-run shortfall is within this share
  // of the peak long run target reads as Tight rather than Not-reachable.
  // Was a fixed 85%; made a setting and defaulted to 80% (v1.1 review
  // round 10 follow-up item 3) after a 39.6 vs 47 km case (84.3%) stayed
  // Not-reachable under the old fixed threshold.
  feasibilityTightReachableFactor: number;
  // injuryRisk.ts (v1.1 review round 10 Part 2): a load-based early-warning
  // signal, not a medical prediction -- see injuryRisk.ts's own header
  // comment for the full scoring shape.
  injuryRisk: {
    // Per-week weight by recency: [this week, last week, 2 weeks ago, 3
    // weeks ago]. This week counts most since it's the most current signal.
    weekWeights: [number, number, number, number];
    // Points per flag (long-run / descent / weekly-ratio), before the
    // per-week weight above is applied.
    flagPoints: { yellow: number; red: number };
    // mean4Week / mean10Week ratio (References): a rising short-term
    // average against the longer one is its own signal, on top of
    // whatever flags() already flagged on the weeks it's built from.
    trendRatio: { moderate: number; moderatePoints: number; high: number; highPoints: number };
    // Latest check-in's worst symptom region (0-5 scale, same as
    // symptomHoldThreshold/symptomDownThreshold above).
    symptom: {
      moderateMin: number; // a region scored in [moderateMin, highMin) adds moderatePoints
      moderatePoints: number;
      highMin: number; // a region scored >= highMin, or reducedTraining checked, forces High outright
    };
    // Final weighted-sum bands: Low < lowMax, Medium [lowMax, highMax],
    // High > highMax.
    lowMax: number;
    highMax: number;
  };
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
  longRunShareCap: { runsThreshold: 3, fewRunsFactor: 0.65, manyRunsFactor: 0.55 },
  raceWeekShakeouts: { count: 2, kmEach: 5 },
  maxWeekKm: 80,
  maxLongRunKm: 55,
  includeHikes: false,
  feasibilityTightReachableFactor: 0.8,
  injuryRisk: {
    weekWeights: [1.0, 0.6, 0.4, 0.2],
    flagPoints: { yellow: 1, red: 3 },
    trendRatio: { moderate: 1.3, moderatePoints: 1, high: 1.5, highPoints: 2 },
    symptom: { moderateMin: 3, moderatePoints: 2, highMin: 5 },
    lowMax: 1.5,
    highMax: 3.5,
  },
};
