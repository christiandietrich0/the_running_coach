// Field descriptors for every tunable threshold in src/worker/defaults.ts
// (mechanics brief section 9). Grouped to match the brief's own sections
// so the Settings screen reads like the spec, not an alphabetical dump.

export interface SettingsFieldDescriptor {
  label: string;
  path: string[];
  step: number;
}

export interface SettingsGroup {
  title: string;
  fields: SettingsFieldDescriptor[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: 'Chronic reference and ratio',
    fields: [
      { label: 'Chronic window (weeks)', path: ['chronicWindowWeeks'], step: 1 },
      { label: 'Low volume threshold (x C)', path: ['ratioZoneEdges', 'lowVolume'], step: 0.05 },
      { label: 'Green min (x C)', path: ['ratioZoneEdges', 'greenMin'], step: 0.05 },
      { label: 'Green max (x C)', path: ['ratioZoneEdges', 'greenMax'], step: 0.05 },
      { label: 'Red threshold (x C)', path: ['ratioZoneEdges', 'red'], step: 0.05 },
      { label: 'Detraining threshold (x M12)', path: ['detrainingCFactorOfM12'], step: 0.05 },
    ],
  },
  {
    title: 'Long run',
    fields: [
      { label: 'Long run cap (x LR30) - also the hard invariant, over this is red', path: ['longRunCapFactor'], step: 0.05 },
      { label: 'LR30 window (days)', path: ['lr30WindowDays'], step: 1 },
      { label: 'Max long run (km)', path: ['maxLongRunKm'], step: 1 },
      { label: 'Long run share cap: runs/week threshold, at or under this counts as few', path: ['longRunShareCap', 'runsThreshold'], step: 1 },
      { label: 'Long run share cap: few-runs fraction (x week km)', path: ['longRunShareCap', 'fewRunsFactor'], step: 0.05 },
      { label: 'Long run share cap: many-runs fraction (x week km)', path: ['longRunShareCap', 'manyRunsFactor'], step: 0.05 },
    ],
  },
  {
    title: 'Descent',
    fields: [
      { label: 'Descent weight (w)', path: ['descentWeightW'], step: 0.1 },
      { label: 'Single-run D- cap (x D30)', path: ['singleRunDminusCapFactor'], step: 0.05 },
      { label: 'Single-run D- red (x D30)', path: ['singleRunDminusRedFactor'], step: 0.05 },
      { label: 'Weekly D- cap (x DW4)', path: ['weeklyDminusCapFactor'], step: 0.05 },
      { label: 'Weekly D- red (x DW4)', path: ['weeklyDminusRedFactor'], step: 0.05 },
    ],
  },
  {
    title: 'Week corridors',
    fields: [
      { label: 'Build min (x C)', path: ['buildCorridor', 'min'], step: 0.01 },
      { label: 'Build max (x C)', path: ['buildCorridor', 'max'], step: 0.01 },
      { label: 'Hold min (x C)', path: ['holdCorridor', 'min'], step: 0.01 },
      { label: 'Hold max (x C)', path: ['holdCorridor', 'max'], step: 0.01 },
      { label: 'Down min (x Build mean)', path: ['downCorridorOfBuildMean', 'min'], step: 0.05 },
      { label: 'Down max (x Build mean)', path: ['downCorridorOfBuildMean', 'max'], step: 0.05 },
      { label: 'Down long run cap (x LR30)', path: ['downLongRunCapFactor'], step: 0.05 },
      { label: 'Down cadence (Build weeks)', path: ['downCadenceBuildWeeks'], step: 1 },
      { label: 'Hard week-on-week cap (fraction, e.g. 0.30 = 30%)', path: ['hardWeekOnWeekCapPct'], step: 0.05 },
      { label: 'Re-entry cap (x C)', path: ['reentryCapFactor'], step: 0.05 },
    ],
  },
  {
    title: 'Symptoms',
    fields: [
      { label: 'Hold threshold (region score, 0-10)', path: ['symptomHoldThreshold'], step: 1 },
      { label: 'Down threshold (region score, 0-10)', path: ['symptomDownThreshold'], step: 1 },
      { label: 'Symptom-locked Down D- cap (x DW4)', path: ['symptomDownDminusWeekCapFactor'], step: 0.05 },
    ],
  },
  {
    title: 'Race targets',
    fields: [
      { label: 'Peak long run (x race effort-km)', path: ['peakLongRunFactor'], step: 0.01 },
      { label: 'Peak week (x race effort-km)', path: ['peakWeekFactor'], step: 0.01 },
      { label: 'Peak weekly D+ (x race D+)', path: ['peakWeeklyDplusFactor'], step: 0.05 },
      { label: 'Peak single-run D- (x race D-)', path: ['peakSingleRunDminusFactor'], step: 0.05 },
    ],
  },
  {
    title: 'Taper',
    fields: [
      { label: 'A taper length, races <=100km (weeks)', path: ['taperA', 'weeksUnder100km'], step: 1 },
      { label: 'A taper length, races >100km (weeks)', path: ['taperA', 'weeksOver100km'], step: 1 },
      { label: 'A taper week -2 volume (fraction)', path: ['taperA', 'week2Pct'], step: 0.05 },
      { label: 'A taper week -1 volume (fraction)', path: ['taperA', 'week1Pct'], step: 0.05 },
      { label: 'A taper race week volume (fraction)', path: ['taperA', 'raceWeekPct'], step: 0.05 },
      { label: 'B taper length (weeks)', path: ['taperB', 'weeks'], step: 1 },
      { label: 'B taper volume (fraction)', path: ['taperB', 'pct'], step: 0.05 },
      { label: 'Post-race recovery volume (fraction of peak)', path: ['postRaceRecoveryPctOfPeak'], step: 0.05 },
      { label: 'Post-race recovery long run cap (km)', path: ['recoveryLongRunCapKm'], step: 1 },
      { label: 'Race week shakeouts (count)', path: ['raceWeekShakeouts', 'count'], step: 1 },
      { label: 'Race week shakeout length (km each)', path: ['raceWeekShakeouts', 'kmEach'], step: 1 },
    ],
  },
  {
    title: 'Life caps',
    fields: [
      { label: 'Max week (km)', path: ['maxWeekKm'], step: 1 },
      { label: 'Run merge gap (minutes)', path: ['runMergeGapMin'], step: 1 },
    ],
  },
];

export function getPath(obj: Record<string, unknown>, path: string[]): number {
  let cur: unknown = obj;
  for (const key of path) {
    cur = (cur as Record<string, unknown> | undefined)?.[key];
  }
  return cur as number;
}

export function setPath(obj: Record<string, unknown>, path: string[], value: number): Record<string, unknown> {
  const [head, ...rest] = path;
  if (rest.length === 0) return { ...obj, [head]: value };
  return { ...obj, [head]: setPath((obj[head] as Record<string, unknown>) ?? {}, rest, value) };
}
