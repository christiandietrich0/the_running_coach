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
}

const OPEN_KM: Pick<Corridor, 'kmMin' | 'kmMax' | 'lrMax'> = { kmMin: 0, kmMax: Infinity, lrMax: Infinity };

export function corridor(weekType: WeekType, refs: References, settings: Settings, options: CorridorOptions = {}): Corridor {
  const dminusWeekMax = refs.DW4 > 0 ? settings.weeklyDminusCapFactor * refs.DW4 : Infinity;
  const dminusRunMax = refs.D30 > 0 ? settings.singleRunDminusCapFactor * refs.D30 : Infinity;

  switch (weekType) {
    case 'BUILD': {
      if (refs.C <= 0) return { ...OPEN_KM, dminusWeekMax, dminusRunMax };
      const normalMax = settings.buildCorridor.max * refs.C;
      const kmMax = options.reentry ? Math.min(normalMax, settings.reentryCapFactor * refs.C) : normalMax;
      return {
        kmMin: settings.buildCorridor.min * refs.C,
        kmMax,
        lrMax: refs.LR30 > 0 ? settings.longRunCapFactor * refs.LR30 : Infinity,
        dminusWeekMax,
        dminusRunMax,
      };
    }

    case 'HOLD': {
      if (refs.C <= 0) return { ...OPEN_KM, dminusWeekMax, dminusRunMax };
      return {
        kmMin: settings.holdCorridor.min * refs.C,
        kmMax: settings.holdCorridor.max * refs.C,
        lrMax: refs.LR30 > 0 ? refs.LR30 : Infinity, // up to LR30, no progression
        dminusWeekMax,
        dminusRunMax,
      };
    }

    case 'DOWN': {
      const base = refs.buildMean > 0 ? refs.buildMean : refs.C;
      const dwFactor = options.symptomLocked ? settings.symptomDownDminusWeekCapFactor : settings.weeklyDminusCapFactor;
      const downDminusWeekMax = refs.DW4 > 0 ? dwFactor * refs.DW4 : Infinity;
      if (base <= 0) return { ...OPEN_KM, dminusWeekMax: downDminusWeekMax, dminusRunMax };
      return {
        kmMin: settings.downCorridorOfBuildMean.min * base,
        kmMax: settings.downCorridorOfBuildMean.max * base,
        lrMax: refs.LR30 > 0 ? settings.downLongRunCapFactor * refs.LR30 : Infinity,
        dminusWeekMax: downDminusWeekMax,
        dminusRunMax,
      };
    }

    case 'LIMITED': {
      return {
        kmMin: 0,
        kmMax: options.limitedKmCap ?? Infinity,
        lrMax: refs.LR30 > 0 ? refs.LR30 : Infinity,
        dminusWeekMax,
        dminusRunMax,
      };
    }

    case 'TAPER':
    case 'RACE':
    default:
      // Taper volume comes from raceTargets()'s schedule, not a formula on
      // C; Race weeks are "race plus shakeouts" with ratio/LR flags off
      // entirely (4). Both leave km/long-run open here.
      return { ...OPEN_KM, dminusWeekMax, dminusRunMax };
  }
}
