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
  // Not actually shown: LOCKED_IN renders its own "Peak long run done: Xkm"
  // pill instead (RaceCard.tsx/NextRaceCard.tsx), since this static label
  // can't carry that number. Kept here only so this stays an exhaustive map.
  LOCKED_IN: 'Peak long run done',
};

export const WEEK_TYPES: WeekType[] = ['BUILD', 'HOLD', 'DOWN', 'TAPER', 'RACE', 'LIMITED', 'RECOVERY'];

// The taper weeks proper, in schedule order -- excluding the race week
// itself, which raceTargets() includes in the same array under its own
// label. Matches plan.ts's own raceStructureSlots() filter exactly, so the
// numbering here always lines up with what suggestPlan() actually built.
function taperOnly(race: RaceState) {
  return race.targets.taper.filter((t) => t.label !== 'race week');
}

// "Sat Oct 24" -- no comma, unlike toLocaleDateString's own weekday+month+
// day formatting, which reads oddly stacked next to a race name on a Plan
// row ("Race week · Puglia UTMB (Sat, Oct 24)").
function fmtRaceWeekDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${weekday} ${monthDay}`;
}

// The chip shown at the top of a week: "Build week", "Taper week 1 of 2",
// "Recovery week", "Peak week" for a race's own Build-typed peak block, and
// (for the race week itself) "Race day" -- the short, in-the-moment label
// This Week's own chip and NextRaceCard want -- or, with
// `withDate: true`, "Race week · <name> (<date>)" -- the Plan screen's own
// row label (v1.1 review round 10 follow-up, final pre-1.0 pass item 4):
// a list of weeks benefits from the date, where "today is race day" reads
// oddly for a week further down the list. Needs the full races list to
// resolve a Taper week's position/count and a Peak/Race week's name/date.
export function weekChipLabel(week: WeekState, races: RaceState[], opts?: { withDate?: boolean }): { text: string; isRace: boolean } {
  if (week.type === 'RACE') {
    if (!opts?.withDate) return { text: week.raceName ? `Race day · ${week.raceName}` : 'Race day', isRace: true };
    const race = week.raceId != null ? races.find((r) => r.id === week.raceId) : undefined;
    const suffix = race ? ` (${fmtRaceWeekDate(race.date)})` : '';
    return { text: week.raceName ? `Race week · ${week.raceName}${suffix}` : `Race week${suffix}`, isRace: true };
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
