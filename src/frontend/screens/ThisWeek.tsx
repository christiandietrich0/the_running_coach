import { useEffect, useState } from 'preact/hooks';
import { CheckinPrompt } from '../components/CheckinPrompt';
import { NextRaceCard } from '../components/NextRaceCard';
import { PlanUpdatedNote } from '../components/PlanUpdatedNote';
import { RunsList } from '../components/RunsList';
import { VerdictBadge } from '../components/VerdictBadge';
import { WeekHeadline } from '../components/WeekHeadline';
import { WeekNumbers } from '../components/WeekNumbers';
import { weekChipLabel } from '../labels';
import { getLastSeenPlanUpdate, setLastSeenPlanUpdate } from '../storage';
import type { StateResponse } from '../types';

export function ThisWeek({ state, onOpenCheckin }: { state: StateResponse; onOpenCheckin: () => void }) {
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

      <div class="card">
        <div class="card-title">This week's runs</div>
        <RunsList runs={state.currentWeekRuns} />
      </div>

      <CheckinPrompt needed={state.checkinNeeded} onClick={onOpenCheckin} />

      <NextRaceCard races={state.races} today={state.today} currentWeekType={week.type} />
    </div>
  );
}
