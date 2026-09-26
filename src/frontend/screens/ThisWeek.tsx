import { CheckinPrompt } from '../components/CheckinPrompt';
import { NextRaceCard } from '../components/NextRaceCard';
import { RunsList } from '../components/RunsList';
import { VerdictBadge } from '../components/VerdictBadge';
import { WeekNumbers } from '../components/WeekNumbers';
import type { StateResponse } from '../types';

export function ThisWeek({ state, onOpenCheckin }: { state: StateResponse; onOpenCheckin: () => void }) {
  const week = state.weeks.find((w) => w.weekStart === state.currentWeekStart);
  if (!week) {
    return <p class="muted">No data for this week yet.</p>;
  }

  return (
    <div class="screen">
      <VerdictBadge colour={week.verdict.colour} reason={week.verdict.reason} />

      <div class="card">
        <WeekNumbers week={week} settings={state.settings} />
      </div>

      <div class="card">
        <div class="card-title">This week's runs</div>
        <RunsList runs={state.currentWeekRuns} />
      </div>

      <CheckinPrompt needed={state.checkinNeeded} onClick={onOpenCheckin} />

      <NextRaceCard races={state.races} today={state.today} currentWeekType={week.type} />
    </div>
  );
}
