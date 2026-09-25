import { fmtKm, fmtM } from '../format';
import { WEEK_TYPE_LABEL } from '../labels';
import type { WeekState } from '../types';

function fmtWeekLabel(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function PlanWeekRow({ week, onClick }: { week: WeekState; onClick: () => void }) {
  const dplusM = Math.max(0, (week.effortKmWeek - week.kmWeek) * 100);

  return (
    <button type="button" class="plan-row" onClick={onClick}>
      <span class={`dot dot-${week.verdict.colour.toLowerCase()}`} />
      <div class="plan-row-body">
        <div class="plan-row-top">
          <span class={`pill${week.type === 'RACE' ? ' pill-race' : ''}`}>{WEEK_TYPE_LABEL[week.type]}</span>
          <span class="plan-row-date">{fmtWeekLabel(week.weekStart)}</span>
          {week.userEdited && <span class="plan-row-edited">edited</span>}
        </div>
        <div class="plan-row-numbers">
          {fmtKm(week.kmWeek)} km · LR {fmtKm(week.longestKm)} km · D+ {fmtM(dplusM)} m · D- {fmtM(week.dminusWeek)} m
        </div>
      </div>
    </button>
  );
}
