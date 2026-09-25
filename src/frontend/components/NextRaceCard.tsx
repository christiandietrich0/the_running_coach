import { daysUntil } from '../format';
import type { FeasibilityStatus, RaceState, WeekType } from '../types';

const FEASIBILITY_LABEL: Record<FeasibilityStatus, string> = {
  FEASIBLE: 'Feasible',
  TIGHT: 'Tight',
  NOT_REACHABLE: 'Not safely reachable',
};

const WEEK_TYPE_LABEL: Record<WeekType, string> = {
  BUILD: 'Build week',
  HOLD: 'Hold week',
  DOWN: 'Down week',
  TAPER: 'Taper week',
  RACE: 'Race week',
  LIMITED: 'Limited week',
};

export function NextRaceCard({ races, today, currentWeekType }: { races: RaceState[]; today: string; currentWeekType: WeekType }) {
  const upcoming = [...races].filter((r) => daysUntil(r.date, today) >= 0).sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  if (!upcoming) {
    return (
      <div class="card">
        <div class="card-title">Next race</div>
        <p class="muted">No upcoming races yet.</p>
      </div>
    );
  }

  const days = daysUntil(upcoming.date, today);

  return (
    <div class="card">
      <div class="card-title">Next race</div>
      <div class="race-name">{upcoming.name}</div>
      <div class="race-countdown">{days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} away`}</div>
      <div class="race-meta">
        {upcoming.feasibility && (
          <span class={`pill pill-${upcoming.feasibility.status.toLowerCase()}`}>{FEASIBILITY_LABEL[upcoming.feasibility.status]}</span>
        )}
        <span class="pill">{WEEK_TYPE_LABEL[currentWeekType]}</span>
      </div>
    </div>
  );
}
