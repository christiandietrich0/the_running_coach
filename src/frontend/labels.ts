import type { FeasibilityStatus, FlagColour, RaceState, WeekState, WeekType } from './types';

export const FLAG_COLOUR_LABEL: Record<FlagColour, string> = {
  GREEN: 'On track',
  BLUE: 'Low volume',
  YELLOW: 'Caution',
  RED: 'Overloaded',
  RACE: 'Race day',
};

export const WEEK_TYPE_LABEL: Record<WeekType, string> = {
  BUILD: 'Build',
  HOLD: 'Hold',
  DOWN: 'Down',
  TAPER: 'Taper',
  RACE: 'Race',
  LIMITED: 'Limited',
  RECOVERY: 'Recovery',
};

export const FEASIBILITY_LABEL: Record<FeasibilityStatus, string> = {
  FEASIBLE: 'Feasible',
  TIGHT: 'Tight',
  NOT_REACHABLE: 'Not safely reachable',
};

export const WEEK_TYPES: WeekType[] = ['BUILD', 'HOLD', 'DOWN', 'TAPER', 'RACE', 'LIMITED', 'RECOVERY'];

// The taper weeks proper, in schedule order -- excluding the race week
// itself, which raceTargets() includes in the same array under its own
// label. Matches plan.ts's own raceStructureSlots() filter exactly, so the
// numbering here always lines up with what suggestPlan() actually built.
function taperOnly(race: RaceState) {
  return race.targets.taper.filter((t) => t.label !== 'race week');
}

// The chip shown at the top of a week: "Build week", "Taper week 1 of 2",
// "Recovery week", "Peak week" for a race's own Build-typed peak block, and
// "Race day" (with the race's name) for the race week itself. Needs the
// full races list to resolve a Taper week's position/count and a Peak
// week's/Race week's name.
export function weekChipLabel(week: WeekState, races: RaceState[]): { text: string; isRace: boolean } {
  if (week.type === 'RACE') {
    return { text: week.raceName ? `Race day -- ${week.raceName}` : 'Race day', isRace: true };
  }
  if (week.taperForRaceId != null) {
    const race = races.find((r) => r.id === week.taperForRaceId);
    const weeks = race ? taperOnly(race) : [];
    const idx = weeks.findIndex((t) => t.weekStart === week.weekStart);
    if (race && idx !== -1) return { text: `Taper week ${idx + 1} of ${weeks.length}`, isRace: false };
    return { text: 'Taper week', isRace: false };
  }
  if (week.peakForRaceId != null) {
    return { text: 'Peak week', isRace: false };
  }
  return { text: `${WEEK_TYPE_LABEL[week.type]} week`, isRace: false };
}
