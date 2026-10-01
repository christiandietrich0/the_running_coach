import { daysUntil, fmtKm, fmtShortDate } from '../format';
import { FEASIBILITY_LABEL, weekChipLabel } from '../labels';
import type { RaceState, WeekState } from '../types';

export function NextRaceCard({ races, today, currentWeek }: { races: RaceState[]; today: string; currentWeek: WeekState }) {
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
  // weekChipLabel() -- the same label the This Week chip and Plan screen
  // use -- not the plain type name: a Peak week or taper week otherwise
  // showed as plain "Build week"/"Taper week" here, disagreeing with the
  // chip right above it for the exact same week (v1.1 review round 10
  // follow-up item 2).
  const chip = weekChipLabel(currentWeek, races);

  return (
    <div class="card">
      <div class="card-title">Next race</div>
      <div class="race-name">{upcoming.name}</div>
      <div class="race-countdown">{days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} away`}</div>
      <div class="race-meta">
        {upcoming.feasibility &&
          (upcoming.feasibility.status === 'LOCKED_IN' ? (
            <span class="pill">
              Peak long run done:{' '}
              {upcoming.peakLongRunDoneKm != null ? `${fmtKm(upcoming.peakLongRunDoneKm)} km (${fmtShortDate(upcoming.peakLongRunDoneDate!)})` : '--'}
            </span>
          ) : (
            <span class={`pill pill-${upcoming.feasibility.status.toLowerCase()}`}>{FEASIBILITY_LABEL[upcoming.feasibility.status]}</span>
          ))}
        <span class="pill">{chip.text}</span>
      </div>
      {upcoming.feasibility?.status === 'LOCKED_IN' && upcoming.feasibility.lastBuildStatus != null && (
        <div class="race-meta">
          <span class="muted">
            Build ended {FEASIBILITY_LABEL[upcoming.feasibility.lastBuildStatus]} ({fmtKm(upcoming.feasibility.lastBuildMaxReachableLongRunKm ?? 0)} of{' '}
            {fmtKm(upcoming.targets.peakLongRunKm)} km)
          </span>
        </div>
      )}
    </div>
  );
}
