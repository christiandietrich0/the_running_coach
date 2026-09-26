import { useState } from 'preact/hooks';
import { WeekChart, type Metric } from '../components/WeekChart';
import type { StateResponse, WeekState } from '../types';

const METRICS: { id: Metric; label: string }[] = [
  { id: 'km', label: 'km' },
  { id: 'effortKm', label: 'Effort km' },
  { id: 'dminus', label: 'Descent' },
];

const LOOKBACK_WEEKS = 12;

// Cuts the trailing run of blank future weeks (no plan yet). Nothing to
// look at there yet, and a wall of empty hatched bars just reads as
// broken; the window still extends automatically once weeks are planned.
function trimTrailingEmptyFuture(weeks: WeekState[], currentWeekStart: string): WeekState[] {
  const currentIdx = weeks.findIndex((w) => w.weekStart === currentWeekStart);
  if (currentIdx === -1) return weeks;

  let lastContentIdx = currentIdx;
  for (let i = weeks.length - 1; i > currentIdx; i--) {
    const w = weeks[i];
    if (w.kmWeek > 0 || w.userEdited || w.type === 'RACE') {
      lastContentIdx = i;
      break;
    }
  }
  return weeks.slice(0, lastContentIdx + 1);
}

export function Chart({ state }: { state: StateResponse }) {
  const [metric, setMetric] = useState<Metric>('km');

  const currentIdx = state.weeks.findIndex((w) => w.weekStart === state.currentWeekStart);
  const startIdx = currentIdx === -1 ? 0 : Math.max(0, currentIdx - LOOKBACK_WEEKS);
  const weeks = trimTrailingEmptyFuture(state.weeks.slice(startIdx), state.currentWeekStart);

  return (
    <div class="screen">
      <div class="card">
        <div class="card-title">Load over time</div>
        <div class="metric-toggle">
          {METRICS.map((m) => (
            <button key={m.id} class={`toggle-button${m.id === metric ? ' toggle-button-active' : ''}`} onClick={() => setMetric(m.id)}>
              {m.label}
            </button>
          ))}
        </div>

        <div class="chart-legend">
          {metric !== 'dminus' && (
            <span class="legend-item">
              <span class="legend-swatch" style={{ background: 'var(--blue)' }} />
              Low
            </span>
          )}
          <span class="legend-item">
            <span class="legend-swatch" style={{ background: 'var(--green)' }} />
            Good
          </span>
          <span class="legend-item">
            <span class="legend-swatch" style={{ background: 'var(--yellow)' }} />
            Caution
          </span>
          <span class="legend-item">
            <span class="legend-swatch" style={{ background: 'var(--red)' }} />
            Over
          </span>
          <span class="legend-item">
            <span class="legend-swatch" style={{ background: 'var(--fg)' }} />
            {metric === 'dminus' ? 'Longest' : 'LR'}
          </span>
          <span class="legend-item">
            <span class="legend-swatch legend-swatch-line" />
            Cap
          </span>
          <span class="legend-item">
            <span class="legend-swatch legend-swatch-hatch" />
            Planned
          </span>
          <span class="legend-item">
            <span class="legend-swatch" style={{ background: 'var(--violet)' }} />
            Race
          </span>
        </div>

        <WeekChart weeks={weeks} metric={metric} settings={state.settings} currentWeekStart={state.currentWeekStart} />
      </div>
    </div>
  );
}
