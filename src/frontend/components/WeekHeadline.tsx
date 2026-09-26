import { fmtKm } from '../format';
import type { WeekState } from '../types';

// The big "X to Y km left" / "Z km done" headline (v1.1 UI pass): the
// primary figure on This Week, replacing the old verdict-reason sentence.
// Sourced from state.weeks[currentWeek].guidance, computed server-side by
// the same remainingWeekGuidance() call as before -- this only changes how
// it's laid out, not what it says.
export function WeekHeadline({ week }: { week: WeekState }) {
  const g = week.guidance;
  const doneKm = fmtKm(week.kmWeek);

  if (g?.targetMet) {
    return (
      <div class="card">
        <div class="big-number">Weekly target met</div>
        <div class="big-number-sub">{doneKm} km done</div>
      </div>
    );
  }

  if (g && !g.rebuilding && g.floorReachable && g.kmLeftMin != null && g.kmLeftMax != null) {
    return (
      <div class="card">
        <div class="big-number">
          {fmtKm(g.kmLeftMin)} to {fmtKm(g.kmLeftMax)}
          <span class="big-number-unit">km left</span>
        </div>
        <div class="big-number-sub">{doneKm} km done</div>
      </div>
    );
  }

  const sub = g?.rebuilding ? 'Rebuilding -- not enough history yet' : g && !g.floorReachable ? "Floor not reachable this week, that's fine" : 'done this week';
  return (
    <div class="card">
      <div class="big-number">
        {doneKm}
        <span class="big-number-unit">km</span>
      </div>
      <div class="big-number-sub">{sub}</div>
    </div>
  );
}
