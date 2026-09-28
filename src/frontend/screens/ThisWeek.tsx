import { useEffect, useState } from 'preact/hooks';
import { CheckinPrompt } from '../components/CheckinPrompt';
import { NextRaceCard } from '../components/NextRaceCard';
import { PlanUpdatedNote } from '../components/PlanUpdatedNote';
import { PullToRefresh } from '../components/PullToRefresh';
import { RunsList } from '../components/RunsList';
import { VerdictBadge } from '../components/VerdictBadge';
import { WeekHeadline } from '../components/WeekHeadline';
import { WeekNumbers } from '../components/WeekNumbers';
import { weekChipLabel } from '../labels';
import { getLastSeenPlanUpdate, setLastSeenPlanUpdate } from '../storage';
import type { StateResponse } from '../types';

export function ThisWeek({
  state,
  onOpenCheckin,
  onRefresh,
}: {
  state: StateResponse;
  onOpenCheckin: () => void;
  onRefresh: () => Promise<void>;
}) {
  const week = state.weeks.find((w) => w.weekStart === state.currentWeekStart);

  // The note is one-time per lastPlanUpdateAt value (v1.1 review round 5
  // item 3), not tied to whether the current week itself changed -- a sync
  // can regenerate weeks further out in the plan without touching this one.
  const [showPlanUpdated, setShowPlanUpdated] = useState(false);
  useEffect(() => {
    setShowPlanUpdated(state.lastPlanUpdateAt != null && state.lastPlanUpdateAt !== getLastSeenPlanUpdate());
  }, [state.lastPlanUpdateAt]);

  function handleDismissPlanUpdated() {
    if (state.lastPlanUpdateAt) setLastSeenPlanUpdate(state.lastPlanUpdateAt);
    setShowPlanUpdated(false);
  }

  if (!week) {
    return <p class="muted">No data for this week yet.</p>;
  }

  const chip = weekChipLabel(week, state.races);

  return (
    <PullToRefresh onRefresh={onRefresh}>
      <div class="screen">
        <div class="week-chip-row">
          <span class={`week-chip${chip.isRace ? ' week-chip-race' : ''}`}>{chip.text}</span>
        </div>

        <VerdictBadge colour={week.verdict.colour} reason={week.verdict.reason} />

        {showPlanUpdated && <PlanUpdatedNote onDismiss={handleDismissPlanUpdated} />}

        <WeekHeadline week={week} />

        <div class="card">
          <WeekNumbers week={week} settings={state.settings} />
        </div>

        <NextRaceCard races={state.races} today={state.today} currentWeekType={week.type} />

        <CheckinPrompt needed={state.checkinNeeded} onClick={onOpenCheckin} />

        <div class="card">
          <div class="card-title">This week's runs</div>
          <RunsList runs={state.currentWeekRuns} />
        </div>
      </div>
    </PullToRefresh>
  );
}
