// flags(), verdict(), and the symptom check-in rules that decide whether a
// week locks to Hold or Down. See training_planner_mechanics_brief.md
// sections 5.1 to 5.3.
import type { CheckIn, Flag, FlagColour, FlagKind, References, Settings, Verdict, WeekType } from './types';

function ratioOrNull(value: number, ref: number): number | null {
  return ref > 0 ? value / ref : null;
}

function symptomMax(c: CheckIn): number {
  return Math.max(c.heel, c.achilles, c.knee, c.hipOther);
}

// True when the max symptom score has risen for 2 check-ins running:
// current > last week > the week before that (5.1, 5.3).
export function isRisingTwoWeeks(current: CheckIn, priorCheckinsAsc: CheckIn[]): boolean {
  if (priorCheckinsAsc.length < 2) return false;
  const last = priorCheckinsAsc[priorCheckinsAsc.length - 1];
  const secondLast = priorCheckinsAsc[priorCheckinsAsc.length - 2];
  return symptomMax(current) > symptomMax(last) && symptomMax(last) > symptomMax(secondLast);
}

export interface SymptomAssessment {
  colour: FlagColour;
  reason: string;
  locksTo: 'HOLD' | 'DOWN' | null;
}

// The symptoms flag itself (5.1) doubles as the lock decision (5.3): the
// Red conditions are exactly the Down-lock conditions, and Yellow is
// exactly the Hold-lock condition.
export function assessSymptoms(current: CheckIn | null, priorCheckinsAsc: CheckIn[], settings: Settings): SymptomAssessment {
  if (!current) {
    return { colour: 'GREEN', reason: 'No check-in yet this week.', locksTo: null };
  }

  const max = symptomMax(current);
  const rising = isRisingTwoWeeks(current, priorCheckinsAsc);

  if (max >= settings.symptomDownThreshold || rising || current.reducedTraining) {
    const reason = current.reducedTraining
      ? 'You reduced training last week for pain. This week locks to Down.'
      : rising
        ? 'Symptoms have risen two weeks running. This week locks to Down.'
        : `A region scored ${max}/10. This week locks to Down.`;
    return { colour: 'RED', reason, locksTo: 'DOWN' };
  }

  if (max >= settings.symptomHoldThreshold) {
    return {
      colour: 'YELLOW',
      reason: `A region scored ${max}/10. This week locks to Hold, long run capped at your 30-day longest.`,
      locksTo: 'HOLD',
    };
  }

  return { colour: 'GREEN', reason: 'No symptoms of note.', locksTo: null };
}

// Applies the 5.3 lock to a planned week's type. Race and Taper weeks are
// already deliberate choices, so symptoms still show as a flag but never
// override them.
export function applySymptomLock(
  plannedType: WeekType,
  current: CheckIn | null,
  priorCheckinsAsc: CheckIn[],
  settings: Settings,
): { type: WeekType; symptomLocked: boolean; assessment: SymptomAssessment } {
  const assessment = assessSymptoms(current, priorCheckinsAsc, settings);
  if (plannedType === 'RACE' || plannedType === 'TAPER') {
    return { type: plannedType, symptomLocked: false, assessment };
  }
  if (assessment.locksTo === 'DOWN') return { type: 'DOWN', symptomLocked: true, assessment };
  if (assessment.locksTo === 'HOLD') return { type: 'HOLD', symptomLocked: true, assessment };
  return { type: plannedType, symptomLocked: false, assessment };
}

// The A1 cap invariants, applied as hard flags on every week -- including
// user-edited ones (v1.1 review, A-round 2 item 1): a stored long run that
// outgrew its own week's km, the life cap, or the 10% growth cap is unsafe
// outright, whatever the ratio to LR30 alone would otherwise read as (a
// locked week's LR30 can itself be stale/inflated, which used to let a
// genuinely-too-big long run read as green). Any violation is red; there
// is no separate yellow tier for this flag any more.
function longRunFlag(longestKm: number, kmWeek: number, LR30: number, settings: Settings): Flag | null {
  const ratio = ratioOrNull(longestKm, LR30);

  const exceedsWeekKm = longestKm > kmWeek + 1e-9;
  const exceedsLifeCap = longestKm > settings.maxLongRunKm + 1e-9;
  const exceedsGrowthCap = ratio != null && ratio > settings.longRunCapFactor;

  if (exceedsWeekKm || exceedsLifeCap || exceedsGrowthCap) {
    const reason = exceedsWeekKm
      ? `Long run ${longestKm.toFixed(1)} km is more than this week's own ${kmWeek.toFixed(1)} km.`
      : exceedsLifeCap
        ? `Long run ${longestKm.toFixed(1)} km is over your ${settings.maxLongRunKm} km life cap.`
        : `Long run ${longestKm.toFixed(1)} km is ${Math.round(((ratio as number) - 1) * 100)}% over your 30-day longest (${LR30.toFixed(1)} km).`;
    return { kind: 'LONG_RUN', colour: 'RED', reason, value: ratio ?? undefined, ref: settings.longRunCapFactor };
  }

  if (ratio == null) return null;
  return {
    kind: 'LONG_RUN',
    colour: 'GREEN',
    reason: `Long run ${longestKm.toFixed(1)} km is within your 30-day longest (${LR30.toFixed(1)} km).`,
    value: ratio,
    ref: settings.longRunCapFactor,
  };
}

function descentSingleFlag(longestLossM: number, D30: number, settings: Settings): Flag | null {
  const ratio = ratioOrNull(longestLossM, D30);
  if (ratio == null) return null;
  let colour: FlagColour = 'GREEN';
  if (ratio > settings.singleRunDminusRedFactor) colour = 'RED';
  else if (ratio > settings.singleRunDminusCapFactor) colour = 'YELLOW';
  const reason =
    colour === 'GREEN'
      ? `Single-run descent ${Math.round(longestLossM)} m is within your 30-day max (${Math.round(D30)} m).`
      : `Single-run descent ${Math.round(longestLossM)} m is ${Math.round((ratio - 1) * 100)}% over your 30-day max (${Math.round(D30)} m).`;
  return { kind: 'DESCENT_SINGLE', colour, reason, value: ratio, ref: settings.singleRunDminusCapFactor };
}

function descentWeeklyFlag(dminusWeek: number, DW4: number, settings: Settings): Flag | null {
  const ratio = ratioOrNull(dminusWeek, DW4);
  if (ratio == null) return null;
  let colour: FlagColour = 'GREEN';
  if (ratio > settings.weeklyDminusRedFactor) colour = 'RED';
  else if (ratio > settings.weeklyDminusCapFactor) colour = 'YELLOW';
  const reason =
    colour === 'GREEN'
      ? `Weekly descent ${Math.round(dminusWeek)} m is within your recent max (${Math.round(DW4)} m).`
      : `Weekly descent ${Math.round(dminusWeek)} m is ${Math.round((ratio - 1) * 100)}% over your recent max (${Math.round(DW4)} m).`;
  return { kind: 'DESCENT_WEEKLY', colour, reason, value: ratio, ref: settings.weeklyDminusCapFactor };
}

function ratioFlag(kmWeek: number, C: number, settings: Settings): Flag | null {
  const ratio = ratioOrNull(kmWeek, C);
  if (ratio == null) return null;
  let colour: FlagColour = 'GREEN';
  if (ratio > settings.ratioZoneEdges.red) colour = 'RED';
  else if (ratio > settings.ratioZoneEdges.greenMax) colour = 'YELLOW';
  const reason =
    colour === 'GREEN'
      ? `Weekly volume ${kmWeek.toFixed(0)} km is on track (chronic average ${C.toFixed(0)} km).`
      : `Weekly volume ${kmWeek.toFixed(0)} km is ${Math.round((ratio - 1) * 100)}% over your chronic average (${C.toFixed(0)} km).`;
  return { kind: 'RATIO', colour, reason, value: ratio, ref: settings.ratioZoneEdges.greenMax };
}

export interface FlagsInput {
  weekType: WeekType; // effective type, after any symptom lock has been applied
  kmWeek: number;
  longestKm: number;
  longestLossM: number;
  dminusWeek: number;
  refs: References;
  checkin: CheckIn | null;
  priorCheckinsAsc: CheckIn[];
  prevWeekKm: number | null;
  // True for the current, still-in-progress week: kmWeek so far is a
  // partial total, not the week's final volume, so the low-volume floor
  // (which compares kmWeek/C against a ratio floor) would false-positive
  // all week until the week is nearly over. Skipped for this week only;
  // every other flag here is a genuine "so far" upside signal (long run,
  // descent, ratio ceiling) that stays valid mid-week (v1.1 review A5).
  weekInProgress?: boolean;
  // True within the 3-week window right after a Recovery week: a
  // deliberately low chronic average during this re-entry ramp shouldn't
  // read as a problem (v1.1 review round 3 item 4). The re-entry km cap
  // itself (settings.reentryCapFactor x C) is applied by corridor(), not
  // here -- this only gates the blue flags.
  reentry?: boolean;
}

// One flag per rule in 5.1, plus the hard week-on-week cap and the
// low-volume/detraining blue flags. Ratio and long-run flags are skipped
// entirely on Race weeks ("Ratio and LR flags off").
export function flags(input: FlagsInput, settings: Settings): Flag[] {
  const { weekType, refs } = input;
  const out: Flag[] = [];

  const symptoms = assessSymptoms(input.checkin, input.priorCheckinsAsc, settings);
  out.push({ kind: 'SYMPTOMS', colour: symptoms.colour, reason: symptoms.reason });

  if (weekType !== 'RACE') {
    const lr = longRunFlag(input.longestKm, input.kmWeek, refs.LR30, settings);
    if (lr) out.push(lr);
  }

  const ds = descentSingleFlag(input.longestLossM, refs.D30, settings);
  if (ds) out.push(ds);

  const dw = descentWeeklyFlag(input.dminusWeek, refs.DW4, settings);
  if (dw) out.push(dw);

  if (weekType !== 'RACE') {
    const r = ratioFlag(input.kmWeek, refs.C, settings);
    if (r) out.push(r);

    // Hard cap: a week-on-week jump of more than 30% is at least yellow,
    // regardless of week type or corridor (5.1). Not evaluated for
    // Recovery/Limited: a percentage jump between two deliberately small
    // numbers is noise, not a real overload signal (v1.1 review round 3
    // item 5).
    if (weekType !== 'RECOVERY' && weekType !== 'LIMITED' && input.prevWeekKm != null && input.prevWeekKm > 0) {
      const wow = input.kmWeek / input.prevWeekKm;
      if (wow > 1 + settings.hardWeekOnWeekCapPct) {
        out.push({
          kind: 'RATIO',
          colour: 'YELLOW',
          reason: `Week ${input.kmWeek.toFixed(0)} km is ${Math.round((wow - 1) * 100)}% up on last week's ${input.prevWeekKm.toFixed(0)} km (hard cap +30%).`,
          value: wow,
          ref: 1 + settings.hardWeekOnWeekCapPct,
        });
      }
    }
  }

  // Low volume (blue): R < 0.8 on a Build or Hold week only (5.1). Not
  // evaluated for the current in-progress week (weekInProgress) or during
  // the post-Recovery re-entry window (reentry).
  if (!input.weekInProgress && !input.reentry && (weekType === 'BUILD' || weekType === 'HOLD') && refs.C > 0) {
    const R = input.kmWeek / refs.C;
    if (R < settings.ratioZoneEdges.lowVolume) {
      out.push({
        kind: 'LOW_VOLUME',
        colour: 'BLUE',
        reason: `Volume is low: ${input.kmWeek.toFixed(0)} km is ${Math.round(R * 100)}% of your chronic average (${refs.C.toFixed(0)} km).`,
        value: R,
        ref: settings.ratioZoneEdges.lowVolume,
      });
    }
  }

  // Detraining (blue): C < 0.7 x M12 (5.1). Also suppressed during re-entry
  // -- C is expected to be temporarily low right after a Recovery week.
  if (!input.reentry && refs.M12 > 0 && refs.C < settings.detrainingCFactorOfM12 * refs.M12) {
    out.push({
      kind: 'LOW_VOLUME',
      colour: 'BLUE',
      reason: `Chronic load (${refs.C.toFixed(0)} km) has dropped below ${Math.round(settings.detrainingCFactorOfM12 * 100)}% of your 12-week average (${refs.M12.toFixed(0)} km).`,
      value: refs.C,
      ref: settings.detrainingCFactorOfM12 * refs.M12,
    });
  }

  return out;
}

const SEVERITY: Record<FlagColour, number> = { GREEN: 0, BLUE: 1, YELLOW: 2, RED: 3 };

// symptoms > long run > descent > weekly ratio (5.2); low-volume is blue
// only and never competes at yellow/red.
const KIND_PRIORITY: Record<FlagKind, number> = {
  SYMPTOMS: 0,
  LONG_RUN: 1,
  DESCENT_SINGLE: 2,
  DESCENT_WEEKLY: 2,
  RATIO: 3,
  LOW_VOLUME: 4,
};

// The week colour is the worst flag; ties broken by the 5.2 priority
// order. Blue only shows when nothing is yellow or red.
export function verdict(flagList: Flag[]): Verdict {
  if (flagList.length === 0) return { colour: 'GREEN', reason: 'On track.', flags: flagList };

  const maxSeverity = Math.max(...flagList.map((f) => SEVERITY[f.colour]));

  if (maxSeverity <= SEVERITY.BLUE) {
    const blue = flagList.find((f) => f.colour === 'BLUE');
    if (blue) return { colour: 'BLUE', reason: blue.reason, flags: flagList };
    return { colour: 'GREEN', reason: 'On track.', flags: flagList };
  }

  const atMax = flagList.filter((f) => SEVERITY[f.colour] === maxSeverity);
  atMax.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);
  const winner = atMax[0];
  return { colour: winner.colour, reason: winner.reason, flags: flagList };
}
