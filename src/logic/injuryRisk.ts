// computeInjuryRisk(): a load-based early-warning indicator for This Week
// (v1.1 review round 10 Part 2), explicitly NOT a medical prediction --
// just a weighted read of the same flags() output and check-in data the
// rest of the app already has, surfaced together in one place.
//
// Score = the weighted sum of:
//   - each of the last 4 weeks' (this week, last week, 2/3 weeks ago) own
//     long-run / descent (single-run or weekly, whichever is worse) /
//     weekly-ratio flags, each yellow=settings.injuryRisk.flagPoints.yellow
//     or red=...red points, multiplied by that week's own recency weight
//     (settings.injuryRisk.weekWeights, this week weighted highest);
//   - a rising 4-week-vs-10-week mean km trend (References.mean4Week /
//     mean10Week), independent of any single week's own flags, since a
//     steadily climbing average is itself a signal even before any one
//     week trips a ratio flag;
//   - the latest check-in's worst symptom region, moderate (3-4) adding
//     points the same as a flag would.
// A region scored settings.injuryRisk.symptom.highMin or above, or
// "reduced training" checked, forces High outright regardless of the
// weighted sum -- self-reported pain at that level isn't something a load
// trend should be allowed to talk itself out of.
import type { CheckIn, Flag, FlagColour, InjuryRisk, InjuryRiskContributor, InjuryRiskLevel, InjuryRiskSource, Settings } from './types';

export interface InjuryRiskWeekInput {
  weekStart: string;
  // This week's own flags, exactly as flags() already computed them --
  // computeInjuryRisk() doesn't recompute anything, just re-reads them.
  flags: Flag[];
}

export interface InjuryRiskInput {
  // Ordered most-recent-first: [this week, last week, 2 weeks ago, 3 weeks
  // ago]. Fewer than 4 entries is fine early in an account's history --
  // whatever weeks exist are scored, the rest simply contribute nothing.
  weeks: InjuryRiskWeekInput[];
  // References.mean4Week / mean10Week, as of the current week.
  mean4Week: number;
  mean10Week: number;
  // The most recently submitted check-in, regardless of which week it was
  // for -- null if none has ever been submitted.
  latestCheckin: CheckIn | null;
}

function symptomMax(c: CheckIn): number {
  return Math.max(c.heel, c.achilles, c.knee, c.hipOther);
}

function colourRank(colour: FlagColour | undefined): number {
  if (colour === 'RED') return 2;
  if (colour === 'YELLOW') return 1;
  return 0;
}

// The worse (by colour) of two same-family flags, e.g. DESCENT_SINGLE vs
// DESCENT_WEEKLY -- "descent flag (single-run OR weekly)" is one combined
// point source, not two stacked ones.
function worseFlag(a: Flag | undefined, b: Flag | undefined): Flag | undefined {
  return colourRank(b?.colour) > colourRank(a?.colour) ? b : a;
}

function pointsFor(flag: Flag | undefined, settings: Settings): number {
  if (flag?.colour === 'RED') return settings.injuryRisk.flagPoints.red;
  if (flag?.colour === 'YELLOW') return settings.injuryRisk.flagPoints.yellow;
  return 0;
}

function flagContributor(source: InjuryRiskSource, label: string, weekStart: string, flag: Flag | undefined, weight: number, settings: Settings): InjuryRiskContributor | null {
  const rawPoints = pointsFor(flag, settings);
  if (rawPoints === 0 || !flag) return null;
  return { source, label, weekStart, reason: flag.reason, weight, rawPoints, weightedPoints: rawPoints * weight };
}

const SOURCE_LABEL: Record<Exclude<InjuryRiskSource, 'TREND' | 'SYMPTOMS'>, string> = {
  LONG_RUN: 'Long run spike',
  DESCENT: 'Descent jump',
  RATIO: 'Volume jump',
};

export function computeInjuryRisk(input: InjuryRiskInput, settings: Settings): InjuryRisk {
  const { weeks, mean4Week, mean10Week, latestCheckin } = input;
  const cfg = settings.injuryRisk;

  const weekly: InjuryRiskContributor[] = [];
  weeks.slice(0, 4).forEach((week, i) => {
    const weight = cfg.weekWeights[i] ?? 0;
    const longRun = week.flags.find((f) => f.kind === 'LONG_RUN');
    const descent = worseFlag(
      week.flags.find((f) => f.kind === 'DESCENT_SINGLE'),
      week.flags.find((f) => f.kind === 'DESCENT_WEEKLY'),
    );
    const ratio = week.flags.find((f) => f.kind === 'RATIO');

    const long = flagContributor('LONG_RUN', SOURCE_LABEL.LONG_RUN, week.weekStart, longRun, weight, settings);
    const desc = flagContributor('DESCENT', SOURCE_LABEL.DESCENT, week.weekStart, descent, weight, settings);
    const rat = flagContributor('RATIO', SOURCE_LABEL.RATIO, week.weekStart, ratio, weight, settings);
    if (long) weekly.push(long);
    if (desc) weekly.push(desc);
    if (rat) weekly.push(rat);
  });

  // Rising 4-week-vs-10-week load trend: its own signal, on top of
  // whatever flags() already flagged on the weeks it's built from.
  const trend: InjuryRiskContributor[] = [];
  if (mean10Week > 0) {
    const ratioValue = mean4Week / mean10Week;
    const { moderate, moderatePoints, high, highPoints } = cfg.trendRatio;
    const rawPoints = ratioValue > high ? highPoints : ratioValue > moderate ? moderatePoints : 0;
    if (rawPoints > 0) {
      trend.push({
        source: 'TREND',
        label: 'Rising training load',
        weekStart: null,
        reason: `4-week average (${mean4Week.toFixed(1)} km) is ${Math.round((ratioValue - 1) * 100)}% above the 10-week average (${mean10Week.toFixed(1)} km).`,
        weight: 1,
        rawPoints,
        weightedPoints: rawPoints,
      });
    }
  }

  // The latest check-in's worst symptom region: moderate (3-4) adds
  // points like any other contributor; highMin or above (or reduced
  // training checked) overrides straight to High, shown as its own
  // contributor but kept out of weightedSum -- the override doesn't need
  // the sum's help, and folding a symbolic "size" into the sum would
  // misrepresent what the load signal alone is saying.
  let overrideHigh = false;
  const symptomContributors: InjuryRiskContributor[] = [];
  if (latestCheckin) {
    const max = symptomMax(latestCheckin);
    const { moderateMin, moderatePoints, highMin } = cfg.symptom;
    if (max >= highMin || latestCheckin.reducedTraining) {
      overrideHigh = true;
      symptomContributors.push({
        source: 'SYMPTOMS',
        label: 'Symptom check-in',
        weekStart: latestCheckin.weekStart,
        reason: latestCheckin.reducedTraining
          ? 'Reduced training was checked on the latest check-in.'
          : `A symptom region scored ${max}/5 on the latest check-in.`,
        weight: 1,
        rawPoints: moderatePoints,
        // A sentinel comfortably above cfg.highMax, whatever it's set to,
        // so this always sorts first among contributors when it fires --
        // it's the reason for High, so it belongs at the top of the list.
        weightedPoints: cfg.highMax + moderatePoints,
      });
    } else if (max >= moderateMin) {
      symptomContributors.push({
        source: 'SYMPTOMS',
        label: 'Symptom check-in',
        weekStart: latestCheckin.weekStart,
        reason: `A symptom region scored ${max}/5 on the latest check-in.`,
        weight: 1,
        rawPoints: moderatePoints,
        weightedPoints: moderatePoints,
      });
    }
  }

  const summed = [...weekly, ...trend, ...symptomContributors.filter(() => !overrideHigh)];
  const weightedSum = summed.reduce((s, c) => s + c.weightedPoints, 0);

  let level: InjuryRiskLevel;
  if (overrideHigh) level = 'HIGH';
  else if (weightedSum < cfg.lowMax) level = 'LOW';
  else if (weightedSum <= cfg.highMax) level = 'MEDIUM';
  else level = 'HIGH';

  const contributors = [...weekly, ...trend, ...symptomContributors].sort((a, b) => b.weightedPoints - a.weightedPoints);

  return { level, weightedSum, overrideHigh, contributors };
}
