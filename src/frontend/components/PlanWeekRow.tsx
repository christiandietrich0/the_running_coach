import { fmtKm, fmtM } from '../format';
import { WEEK_TYPE_LABEL } from '../labels';
import type { RaceState, WeekState } from '../types';

function fmtWeekLabel(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function PlanWeekRow({ week, peakRace, onClick }: { week: WeekState; peakRace: RaceState | null; onClick: () => void }) {
  const dplusM = Math.max(0, (week.effortKmWeek - week.kmWeek) * 100);
  // suggestPlan() clamps every generated week to green, peak weeks
  // included (v1.1 review round 6) -- when that clamp actually bit, this
  // is lower than the race's own peak target, worth calling out on the
  // row itself, not just on the race card.
  const peakCapped = peakRace != null && week.kmWeek < peakRace.targets.peakWeekEffortKm - 0.5;

  return (
    <button type="button" class="plan-row" onClick={onClick}>
      <span class={`dot dot-${week.verdict.colour.toLowerCase()}`} />
      <div class="plan-row-body">
        <div class="plan-row-top">
          <span class={`pill${week.type === 'RACE' ? ' pill-race' : ''}`}>{WEEK_TYPE_LABEL[week.type]}</span>
          <span class="plan-row-date">{fmtWeekLabel(week.weekStart)}</span>
          {week.type === 'RACE' && week.raceName && <span class="plan-row-race-name">{week.raceName}</span>}
          {week.userEdited && <span class="plan-row-edited">edited</span>}
        </div>
        <div class="plan-row-numbers">
          {fmtKm(week.kmWeek)} km · LR {fmtKm(week.longestKm)} km · D+ {fmtM(dplusM)} m · D- {fmtM(week.dminusWeek)} m
        </div>
        {peakCapped && (
          <div class="plan-row-numbers muted">
            Peak week capped at {fmtKm(week.kmWeek)} km (race target {fmtKm(peakRace!.targets.peakWeekEffortKm)} km)
          </div>
        )}
      </div>
    </button>
  );
}
