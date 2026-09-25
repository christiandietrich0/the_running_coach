import { useState } from 'preact/hooks';
import { WeekChart, type Metric } from '../components/WeekChart';
import type { StateResponse } from '../types';

const METRICS: { id: Metric; label: string }[] = [
  { id: 'km', label: 'km' },
  { id: 'effortKm', label: 'Effort km' },
  { id: 'dminus', label: 'Descent' },
];

const LOOKBACK_WEEKS = 12;

export function Chart({ state }: { state: StateResponse }) {
  const [metric, setMetric] = useState<Metric>('km');

  const currentIdx = state.weeks.findIndex((w) => w.weekStart === state.currentWeekStart);
  const startIdx = currentIdx === -1 ? 0 : Math.max(0, currentIdx - LOOKBACK_WEEKS);
  const weeks = state.weeks.slice(startIdx);

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
        <WeekChart weeks={weeks} metric={metric} settings={state.settings} />
        <div class="chart-legend">
          <span>
            <span class="legend-dot" /> long run{metric === 'dminus' ? ' descent' : ''}, dashed = cap
          </span>
          <span>solid = happened, hatched = planned</span>
        </div>
      </div>
    </div>
  );
}
