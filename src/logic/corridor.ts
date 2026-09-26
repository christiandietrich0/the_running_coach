// corridor(): the km/long-run/descent ceilings for a given week type. See
// training_planner_mechanics_brief.md section 4.
import type { Corridor, References, Settings, WeekType } from './types';

export interface CorridorOptions {
  limitedKmCap?: number | null;
  // Distinguishes a routine cadence Down week from one the symptom lock
  // (5.3) forced, which gets a stricter weekly D- cap.
  symptomLocked?: boolean;
  // True when this Build week is the first one after a blue (low-volume/
  // detraining) or locked (Hold/Down) period: caps it at
  // settings.reentryCapFactor x C rather than the normal Build max, so
  // progression resumes from here, not from wherever it left off (5.3
  // "It is not the old level").
  reentry?: boolean;
  // This week's own planned/actual km, for the "at most 0.55 x planned
  // week km" global long-run cap (v1.1 review A1).
  kmForLongRunCap?: number | null;
  // The driving race's peak long run target, for the "at most the peak LR
  // of the next race" global cap and for Taper's own 0.50x-peak-LR rule
  // (A1).
  peakLongRunKm?: number | null;
}

const OPEN_KM: Pick<Corridor, 'kmMin' | 'kmMax' | 'lrMax'> = { kmMin: 0, kmMax: Infinity, lrMax: Infinity };

// The long run's global ceiling (A1): never more than max_long_run_km,
// never more than the driving race's peak long run, and never more than
// 0.55x this week's own km -- on top of whatever type-specific "cap rule"
// the caller already worked out. Race weeks are exempt: their long run is
// the race itself, set directly elsewhere, never through this function.
function capLongRun(typeCapRule: number, settings: Settings, options: CorridorOptions): number {
  let cap = Math.min(typeCapRule, settings.maxLongRunKm);
  if (options.peakLongRunKm != null) cap = Math.min(cap, options.peakLongRunKm);
  if (options.kmForLongRunCap != null) cap = Math.min(cap, 0.55 * options.kmForLongRunCap);
  return cap;
}

export function corridor(weekType: WeekType, refs: References, settings: Settings, options: CorridorOptions = {}): Corridor {
  const dminusWeekMax = refs.DW4 > 0 ? settings.weeklyDminusCapFactor * refs.DW4 : Infinity;
  const dminusRunMax = refs.D30 > 0 ? settings.singleRunDminusCapFactor * refs.D30 : Infinity;

  switch (weekType) {
    case 'BUILD': {
      if (refs.C <= 0) return { ...OPEN_KM, lrMax: capLongRun(Infinity, settings, options), dminusWeekMax, dminusRunMax };
      const normalMax = settings.buildCorridor.max * refs.C;
      const kmMax = options.reentry ? Math.min(normalMax, settings.reentryCapFactor * refs.C) : normalMax;
      const capRule = refs.LR30 > 0 ? settings.longRunCapFactor * refs.LR30 : Infinity;
      return {
        kmMin: settings.buildCorridor.min * refs.C,
        kmMax,
        lrMax: capLongRun(capRule, settings, options),
        dminusWeekMax,
        dminusRunMax,
      };
    }

    case 'HOLD': {
      if (refs.C <= 0) return { ...OPEN_KM, lrMax: capLongRun(Infinity, settings, options), dminusWeekMax, dminusRunMax };
      const capRule = refs.LR30 > 0 ? refs.LR30 : Infinity; // up to LR30, no progression
      return {
        kmMin: settings.holdCorridor.min * refs.C,
        kmMax: settings.holdCorridor.max * refs.C,
        lrMax: capLongRun(capRule, settings, options),
        dminusWeekMax,
        dminusRunMax,
      };
    }

    case 'DOWN': {
      const base = refs.buildMean > 0 ? refs.buildMean : refs.C;
      const dwFactor = options.symptomLocked ? settings.symptomDownDminusWeekCapFactor : settings.weeklyDminusCapFactor;
      const downDminusWeekMax = refs.DW4 > 0 ? dwFactor * refs.DW4 : Infinity;
      const capRule = refs.LR30 > 0 ? settings.downLongRunCapFactor * refs.LR30 : Infinity;
      if (base <= 0) return { ...OPEN_KM, lrMax: capLongRun(capRule, settings, options), dminusWeekMax: downDminusWeekMax, dminusRunMax };
      return {
        kmMin: settings.downCorridorOfBuildMean.min * base,
        kmMax: settings.downCorridorOfBuildMean.max * base,
        lrMax: capLongRun(capRule, settings, options),
        dminusWeekMax: downDminusWeekMax,
        dminusRunMax,
      };
    }

    case 'LIMITED': {
      const capRule = refs.LR30 > 0 ? refs.LR30 : Infinity;
      const limitedHalfCap = options.limitedKmCap != null ? 0.5 * options.limitedKmCap : Infinity;
      return {
        kmMin: 0,
        kmMax: options.limitedKmCap ?? Infinity,
        lrMax: capLongRun(Math.min(capRule, limitedHalfCap), settings, options),
        dminusWeekMax,
        dminusRunMax,
      };
    }

    case 'TAPER': {
      // Taper's long run comes straight from the 0.50x-peak-LR rule (A1),
      // not a LR30 cap rule -- there is no "cap rule" term to feed in here.
      const capRule = options.peakLongRunKm != null ? 0.5 * options.peakLongRunKm : Infinity;
      return { ...OPEN_KM, lrMax: capLongRun(capRule, settings, options), dminusWeekMax, dminusRunMax };
    }

    case 'RACE':
    default:
      // Race weeks are "race plus shakeouts" (4): the long run is the race
      // itself, set directly elsewhere, so it's exempt from every cap here.
      return { ...OPEN_KM, dminusWeekMax, dminusRunMax };
  }
}
