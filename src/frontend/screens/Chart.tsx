import { useEffect, useRef, useState } from 'preact/hooks';
import { useWeekBarsChart } from '../components/WeekBarsChart';
import { useWeekOverlayChart } from '../components/WeekOverlayChart';
import { buildChartRows, measureTickWidth, niceScale, type Metric } from '../charts';
import type { StateResponse, WeekState } from '../types';

const METRICS: { id: Metric; label: string }[] = [
  { id: 'km', label: 'km' },
  { id: 'effortKm', label: 'Effort km' },
  { id: 'dminus', label: 'Descent' },
];

// Pixel pitch per week column (v1.1 mobile polish). Both charts share this
// so their categories line up, and the scroll wrapper's inner width is
// numWeeks * PX_PER_WEEK -- on a 390px phone that shows roughly 16 weeks
// (8 back, 8 ahead of today) at once, with the rest reachable by swiping.
const PX_PER_WEEK = 20;

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const barsAxisRef = useRef<HTMLCanvasElement>(null);
  const barsPlotRef = useRef<HTMLCanvasElement>(null);
  const overlayAxisRef = useRef<HTMLCanvasElement>(null);
  const overlayPlotRef = useRef<HTMLCanvasElement>(null);

  const weeks = trimTrailingEmptyFuture(state.weeks, state.currentWeekStart);
  const width = weeks.length * PX_PER_WEEK;

  // Both rows' y-axis columns are sized to fit their own widest tick label
  // (descent-metres ticks like "2,000" need more room than km ticks do),
  // then the shared column takes the larger of the two so neither clips.
  const rows = buildChartRows(weeks, metric, state.settings);
  const barsMax = niceScale(Math.max(10, ...rows.map((r) => r.value)));
  const overlayMax = niceScale(Math.max(1, ...rows.map((r) => Math.max(r.overlayValue, r.overlayCap))), 4);
  const axisWidth = Math.max(measureTickWidth(barsMax.max, barsMax.step, 11), measureTickWidth(overlayMax.max, overlayMax.step, 10));

  useWeekBarsChart({ weeks, metric, settings: state.settings, currentWeekStart: state.currentWeekStart, axisWidth, axisCanvasRef: barsAxisRef, plotCanvasRef: barsPlotRef });
  useWeekOverlayChart({ weeks, metric, settings: state.settings, axisWidth, axisCanvasRef: overlayAxisRef, plotCanvasRef: overlayPlotRef });

  // Default scroll position centres today in the viewport, so the initial
  // view is ~8 weeks back and ~8 ahead -- re-run only when the actual date
  // range changes (a sync/regeneration), not on every re-render (e.g. a
  // metric toggle), so switching metrics doesn't reset a manual scroll.
  const rangeKey = weeks.length ? `${weeks[0].weekStart}_${weeks[weeks.length - 1].weekStart}` : '';
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const todayIdx = weeks.findIndex((w) => w.weekStart === state.currentWeekStart);
    if (todayIdx === -1) return;
    const target = (todayIdx + 0.5) * PX_PER_WEEK - el.clientWidth / 2;
    el.scrollLeft = Math.max(0, target);
  }, [rangeKey, state.currentWeekStart]);

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

        <div class="chart-body">
          <div class="chart-axis-col" style={{ width: `${axisWidth}px` }}>
            <div class="chart-wrap chart-wrap-bars">
              <canvas ref={barsAxisRef} />
            </div>
            <div class="chart-wrap chart-wrap-overlay">
              <canvas ref={overlayAxisRef} />
            </div>
          </div>
          <div class="chart-scroll" ref={scrollRef}>
            <div class="chart-scroll-inner" style={{ width: `${width}px` }}>
              <div class="chart-wrap chart-wrap-bars">
                <canvas ref={barsPlotRef} />
              </div>
              <div class="chart-wrap chart-wrap-overlay">
                <canvas ref={overlayPlotRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
