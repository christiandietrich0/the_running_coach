import { Chart as ChartJS } from 'chart.js';
import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';
import { AXIS_FONT_FAMILY, buildChartRows, cssVar, ensureChartRegistered, fmtWeekLabel, niceScale, withAlpha, type Metric } from '../charts';
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
  currentWeekStart,
  axisWidth,
  axisCanvasRef,
  plotCanvasRef,
}: {
  weeks: WeekState[];
  metric: Metric;
  settings: Settings;
  currentWeekStart: string;
  axisWidth: number;
  axisCanvasRef: RefObject<HTMLCanvasElement>;
  plotCanvasRef: RefObject<HTMLCanvasElement>;
}) {
  useEffect(() => {
    ensureChartRegistered();
    const axisCanvas = axisCanvasRef.current;
    const plotCanvas = plotCanvasRef.current;
    if (!axisCanvas || !plotCanvas) return;

    const rows = buildChartRows(weeks, metric, settings, currentWeekStart);
    const labels = rows.map((r) => fmtWeekLabel(r.weekStart));
    // The stride counts from the current week's own index (not just from
    // 0), so its forced-visible label always lands on the pattern instead
    // of occasionally sitting right next to an already-shown neighbour.
    const currentIdx = rows.findIndex((r) => r.weekStart === currentWeekStart);

    const fg = cssVar('--fg');
    const muted = cssVar('--muted');
    const bg = cssVar('--bg');
    const cardBg = cssVar('--card-bg');
    const accent = cssVar('--accent');
    const border = cssVar('--border');

    const rawMax = Math.max(1, ...rows.map((r) => Math.max(r.overlayValue ?? 0, r.overlayCap)));
    const { max: topY, step } = niceScale(rawMax, 4);

    // Same top padding on both instances so their chart areas match. The
    // axis-only instance uses an invisible (but same-size) x tick label to
    // reserve the same bottom space as the plot's real date labels. Only
    // the wide, scrollable plot canvas gets left padding too (see
    // WeekBarsChart for why) -- both plot canvases need the same value.
    //
    // bottom: 20 is not cosmetic spacing -- the same narrow-region
    // Chromium compositing bug documented on Y_AXIS_WIDTH in charts.ts
    // also clips content sitting too close to a canvas's bottom edge (the
    // canvas's own pixel buffer has the tick labels, confirmed via
    // toDataURL, but the on-screen paint showed nothing there at all).
    // This padding keeps the label band far enough from the true edge to
    // avoid it (v1.1 review round 9 item 9).
    //
    // top: 14 (not 4) -- the old, tighter value put this chart's own top
    // gridline right under the "Long run vs cap" title pill (chart-row-title
    // in style.css), which itself sits right under the bars row's
    // type-letter row with almost no gap: all three read as one collided
    // mess. This gives the title -- and the bars row's letters above it --
    // room to breathe (v1.1 review round 10 item 5).
    const sharedLayout = { padding: { top: 14, bottom: 20 } };
    const plotLayout = { padding: { top: 14, bottom: 20, left: 12 } };
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
            borderDash: [3, 3],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            order: 1,
          },
          {
            type: 'line',
            label: 'overlay',
            data: rows.map((r) => r.overlayValue),
            showLine: false,
            pointRadius: 3,
            pointBackgroundColor: accent,
            pointBorderColor: bg,
            pointBorderWidth: 1.5,
            order: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: plotLayout,
        interaction: { mode: 'index', axis: 'x', intersect: false },
        scales: {
          x: {
            ticks: {
              // Every 2nd week's date, always including the current week
              // regardless of its own parity, coloured to stand out from
              // the rest (v1.1 review round 9 item 9) -- autoSkip's
              // opportunistic thinning is replaced with this explicit
              // stride so the pattern is stable while scrolling.
              autoSkip: false,
              maxRotation: 0,
              font: xFont,
              color: (ctx) => (rows[ctx.index]?.weekStart === currentWeekStart ? accent : muted),
              callback: (_value, index) => {
                const row = rows[index];
                if (!row) return '';
                const onStride = currentIdx === -1 ? index % 2 === 0 : (index - currentIdx) % 2 === 0;
                if (row.weekStart === currentWeekStart || onStride) return fmtWeekLabel(row.weekStart);
                return '';
              },
            },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            max: topY,
            ticks: { display: false },
            grid: { color: withAlpha(border, 0.6), lineWidth: 1 },
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
            // No point is drawn for a not-yet-run current week (overlayValue
            // is null, a gap -- v1.1 review round 9 item 5), so there's
            // nothing to show a tooltip for either.
            filter: (item) => item.dataset.label === 'overlay' && item.raw != null,
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
                const lines = [`${label}: ${Math.round(row.overlayValue ?? 0)} ${unit}`, `Cap: ${Math.round(row.overlayCap)} ${unit}`];
                // This week's own value was flagged red, so it didn't raise
                // next week's cap (v1.1 review round 9 item 8).
                if (row.notCountedAsReference) lines.push('Not counted as reference (flagged)');
                return lines;
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
          x: { ticks: { color: 'transparent', maxRotation: 0, font: xFont }, grid: { display: false }, border: { display: false } },
          y: {
            max: topY,
            ticks: { color: muted, stepSize: step, font: { size: 10, family: AXIS_FONT_FAMILY } },
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
  }, [weeks, metric, settings, currentWeekStart, axisWidth, axisCanvasRef, plotCanvasRef]);
}
