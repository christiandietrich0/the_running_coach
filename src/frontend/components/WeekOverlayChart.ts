import { Chart as ChartJS } from 'chart.js';
import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';
import { buildChartRows, cssVar, ensureChartRegistered, fmtWeekLabel, niceScale, type Metric } from '../charts';
import type { Settings, WeekState } from '../types';

// Bottom row of the two-chart split (v1.1 mobile polish): just the
// long-run (or, for the descent metric, longest single-run descent) dots
// and their cap line, sharing category indices with WeekBarsChart above so
// the same week lines up in both. Also carries the shared x-axis week
// labels for both charts, since the bars chart hides its own. Like
// WeekBarsChart, this renders a wide scrolling `plotCanvas` and a narrow
// fixed `axisCanvas` so the y-axis doesn't scroll away with the data.
export function useWeekOverlayChart({
  weeks,
  metric,
  settings,
  axisWidth,
  axisCanvasRef,
  plotCanvasRef,
}: {
  weeks: WeekState[];
  metric: Metric;
  settings: Settings;
  axisWidth: number;
  axisCanvasRef: RefObject<HTMLCanvasElement>;
  plotCanvasRef: RefObject<HTMLCanvasElement>;
}) {
  useEffect(() => {
    ensureChartRegistered();
    const axisCanvas = axisCanvasRef.current;
    const plotCanvas = plotCanvasRef.current;
    if (!axisCanvas || !plotCanvas) return;

    const rows = buildChartRows(weeks, metric, settings);
    const labels = rows.map((r) => fmtWeekLabel(r.weekStart));

    const fg = cssVar('--fg');
    const muted = cssVar('--muted');
    const cardBg = cssVar('--card-bg');
    const border = cssVar('--border');

    const rawMax = Math.max(1, ...rows.map((r) => Math.max(r.overlayValue, r.overlayCap)));
    const { max: topY, step } = niceScale(rawMax, 4);

    // Same layout padding on both instances so their chart areas match.
    // The axis-only instance uses an invisible (but same-size) x tick label
    // to reserve the same bottom space as the plot's real date labels.
    const sharedLayout = { padding: { top: 4 } };
    const xFont = { size: 10 };

    const plotChart = new ChartJS(plotCanvas, {
      data: {
        labels,
        datasets: [
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
            pointRadius: 4,
            pointBackgroundColor: fg,
            pointBorderColor: cardBg,
            pointBorderWidth: 2,
            order: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: sharedLayout,
        interaction: { mode: 'index', axis: 'x', intersect: false },
        scales: {
          x: { ticks: { color: muted, autoSkip: true, maxRotation: 0, font: xFont }, grid: { display: false } },
          y: {
            max: topY,
            ticks: { display: false },
            grid: { color: border, lineWidth: 1 },
            border: { display: false },
            beginAtZero: true,
            afterFit: (scale) => {
              scale.width = axisWidth;
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: (item) => item.dataset.label === 'overlay',
            backgroundColor: fg,
            titleColor: cardBg,
            bodyColor: cardBg,
            padding: 10,
            cornerRadius: 10,
            displayColors: false,
            callbacks: {
              title: (items) => fmtWeekLabel(rows[items[0].dataIndex].weekStart),
              label: (item) => {
                const row = rows[item.dataIndex];
                const unit = metric === 'dminus' ? 'm' : 'km';
                const label = metric === 'dminus' ? 'Longest descent' : 'Long run';
                return [`${label}: ${Math.round(row.overlayValue)} ${unit}`, `Cap: ${Math.round(row.overlayCap)} ${unit}`];
              },
            },
          },
        },
      },
    });

    const axisChart = new ChartJS(axisCanvas, {
      data: { labels: [' '], datasets: [{ type: 'line', label: 'overlay', data: [0], pointRadius: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: sharedLayout,
        scales: {
          x: { ticks: { color: 'transparent', maxRotation: 0, font: xFont }, grid: { display: false } },
          y: {
            max: topY,
            ticks: { color: muted, stepSize: step, font: { size: 10 } },
            grid: { display: false },
            border: { display: false },
            beginAtZero: true,
            afterFit: (scale) => {
              scale.width = axisWidth;
            },
          },
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });

    return () => {
      plotChart.destroy();
      axisChart.destroy();
    };
  }, [weeks, metric, settings, axisWidth, axisCanvasRef, plotCanvasRef]);
}
