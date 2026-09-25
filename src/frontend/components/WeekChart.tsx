import { Chart as ChartJS } from 'chart.js';
import { useEffect, useRef } from 'preact/hooks';
import { cssVar, ensureChartRegistered, hatchPattern } from '../charts';
import type { Settings, WeekState } from '../types';

export type Metric = 'km' | 'effortKm' | 'dminus';

interface Row {
  weekStart: string;
  isActual: boolean;
  isRace: boolean;
  value: number;
  b1: number;
  b2: number;
  b3: number;
  overlayValue: number;
  overlayCap: number;
}

// Colour-zone boundaries and the long-run/descent overlay, per metric.
// effort-km reuses the km-based C and the plain-km long run distance:
// there's no separate effort-km chronic reference, and the week's longest
// run doesn't carry its own elevation gain in the state payload, only the
// week's aggregate does.
function buildRows(weeks: WeekState[], metric: Metric, settings: Settings): Row[] {
  return weeks.map((w) => {
    const isRace = w.type === 'RACE';

    if (metric === 'dminus') {
      const dw4 = w.refs.DW4;
      return {
        weekStart: w.weekStart,
        isActual: w.isActual,
        isRace,
        value: w.dminusWeek,
        b1: 0,
        b2: dw4 > 0 ? settings.weeklyDminusCapFactor * dw4 : 0,
        b3: dw4 > 0 ? settings.weeklyDminusRedFactor * dw4 : 0,
        overlayValue: w.longestLossM,
        overlayCap: w.refs.D30 > 0 ? settings.singleRunDminusCapFactor * w.refs.D30 : 0,
      };
    }

    const c = w.refs.C;
    return {
      weekStart: w.weekStart,
      isActual: w.isActual,
      isRace,
      value: metric === 'km' ? w.kmWeek : w.effortKmWeek,
      b1: c > 0 ? settings.ratioZoneEdges.lowVolume * c : 0,
      b2: c > 0 ? settings.ratioZoneEdges.greenMax * c : 0,
      b3: c > 0 ? settings.ratioZoneEdges.red * c : 0,
      overlayValue: w.longestKm,
      overlayCap: w.refs.LR30 > 0 ? settings.longRunCapFactor * w.refs.LR30 : 0,
    };
  });
}

function fmtLabel(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function WeekChart({ weeks, metric, settings }: { weeks: WeekState[]; metric: Metric; settings: Settings }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartJS | null>(null);

  useEffect(() => {
    ensureChartRegistered();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rows = buildRows(weeks, metric, settings);
    const labels = rows.map((r) => fmtLabel(r.weekStart));

    const fg = cssVar('--fg');
    const muted = cssVar('--muted');
    const cardBg = cssVar('--card-bg');
    const barColor = cssVar('--fg');
    const raceColor = cssVar('--violet');
    const blueBg = cssVar('--blue-bg');
    const greenBg = cssVar('--green-bg');
    const yellowBg = cssVar('--yellow-bg');
    const redBg = cssVar('--red-bg');

    const topY = Math.max(10, ...rows.flatMap((r) => [r.value, r.b3, r.overlayValue, r.overlayCap])) * 1.15;

    const barBackgrounds = rows.map((r) => {
      const color = r.isRace ? raceColor : barColor;
      return r.isActual ? color : hatchPattern(color);
    });

    // Chart.js's TS types get awkward for a mixed bar+line dataset array
    // (each union member needs an exact discriminant), so this is built as
    // plain data and handed to Chart.js untyped -- the shape is verified by
    // hand below and at the browser check in the Phase 6 report.
    const bandBase = { type: 'line' as const, borderWidth: 0, pointRadius: 0, fill: '-1', order: 10, tension: 0 };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasets: any[] = [
      { type: 'line', label: 'zero', data: rows.map(() => 0), borderWidth: 0, pointRadius: 0, order: 10 },
      { ...bandBase, label: 'blue-zone', data: rows.map((r) => r.b1), backgroundColor: blueBg },
      { ...bandBase, label: 'green-zone', data: rows.map((r) => r.b2), backgroundColor: greenBg },
      { ...bandBase, label: 'yellow-zone', data: rows.map((r) => r.b3), backgroundColor: yellowBg },
      { ...bandBase, label: 'red-zone', data: rows.map(() => topY), backgroundColor: redBg },
      {
        type: 'bar',
        label: 'value',
        data: rows.map((r) => r.value),
        backgroundColor: barBackgrounds,
        borderRadius: 4,
        order: 2,
        categoryPercentage: 0.9,
        barPercentage: 0.85,
        maxBarThickness: 24,
      },
      {
        type: 'line',
        label: 'cap',
        data: rows.map((r) => r.overlayCap),
        borderColor: muted,
        borderDash: [5, 4],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        order: 1,
      },
      {
        type: 'line',
        label: 'overlay',
        data: rows.map((r) => r.overlayValue),
        showLine: false,
        pointRadius: 4.5,
        pointBackgroundColor: fg,
        pointBorderColor: cardBg,
        pointBorderWidth: 2,
        order: 0,
      },
    ];

    chartRef.current?.destroy();
    chartRef.current = new ChartJS(canvas, {
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: { ticks: { color: muted, autoSkip: true, maxRotation: 0, font: { size: 11 } }, grid: { display: false } },
          y: {
            ticks: { color: muted, maxTicksLimit: 5, font: { size: 11 } },
            grid: { color: cssVar('--border'), lineWidth: 1 },
            border: { display: false },
            beginAtZero: true,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: (item) => item.dataset.label === 'value',
            callbacks: {
              label: (item) => {
                const row = rows[item.dataIndex];
                const unit = metric === 'dminus' ? 'm' : 'km';
                const race = row.isRace ? ' (Race)' : '';
                return `${Math.round(row.value)} ${unit}${race}`;
              },
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [weeks, metric, settings]);

  return (
    <div class="chart-wrap">
      <canvas ref={canvasRef} />
    </div>
  );
}
