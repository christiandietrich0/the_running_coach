import { Chart as ChartJS, type Plugin } from 'chart.js';
import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';
import { buildChartRows, cssVar, ensureChartRegistered, fmtWeekLabel, hatchPattern, niceScale, withAlpha, type Metric } from '../charts';
import { FLAG_COLOUR_LABEL, WEEK_TYPE_LABEL } from '../labels';
import type { Settings, WeekState } from '../types';

// Top row of the two-chart split (v1.1 mobile polish): the metric's weekly
// bars, colour zone bands, the "Today" divider and race flags. Renders two
// Chart.js instances -- a wide scrolling `plotCanvas` (the actual bars,
// inside the horizontal scroller) and a narrow fixed `axisCanvas` (just the
// y-axis ticks, pinned outside it) -- so the axis stays on screen while the
// data scrolls under it. Both share the same y max/step/padding so their
// tick rows land on the same pixel.
export function useWeekBarsChart({
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

    const rows = buildChartRows(weeks, metric, settings);
    const labels = rows.map((r) => fmtWeekLabel(r.weekStart));

    const muted = cssVar('--muted');
    const cardBg = cssVar('--card-bg');
    const border = cssVar('--border');
    const barColor = cssVar('--fg');
    const raceColor = cssVar('--violet');
    const accent = cssVar('--accent');
    const blueBg = cssVar('--blue-bg');
    const greenBg = cssVar('--green-bg');
    const yellowBg = cssVar('--yellow-bg');
    const redBg = cssVar('--red-bg');

    // Round the axis to a nice ceiling/step (v1.1 mobile polish) instead of
    // raw max*1.2, which produced non-round ticks like 117.6.
    const rawMax = Math.max(10, ...rows.map((r) => r.value));
    const { max: topY, step } = niceScale(rawMax);

    // Planned bars use the same colour logic as actual ones (violet for a
    // race, fg otherwise) but lighter -- a faded hatch, not a different
    // hue (v1.1 UI pass).
    const barBackgrounds = rows.map((r) => {
      const color = r.isRace ? raceColor : barColor;
      return r.isActual ? color : hatchPattern(withAlpha(color, 0.55));
    });

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
    ];

    // "Today": a vertical divider between the last actual bar and the
    // first planned one (v1.1 UI pass).
    const todayIdx = rows.findIndex((r) => r.weekStart === currentWeekStart);
    const todayLine: Plugin<'bar'> = {
      id: 'todayLine',
      afterDraw(chart) {
        if (todayIdx <= 0) return;
        const scale = chart.scales.x;
        const x = (scale.getPixelForValue(todayIdx - 1) + scale.getPixelForValue(todayIdx)) / 2;
        const { top, bottom } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = accent;
        ctx.font = '600 10px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Today', x, top - 4);
        ctx.restore();
      },
    };

    // A small flag + the race's name above its bar (v1.1 UI pass).
    const raceFlags: Plugin<'bar'> = {
      id: 'raceFlags',
      afterDraw(chart) {
        const scale = chart.scales.x;
        const { top } = chart.chartArea;
        const ctx = chart.ctx;
        rows.forEach((r, i) => {
          if (!r.isRace) return;
          const x = scale.getPixelForValue(i);
          ctx.save();
          ctx.fillStyle = raceColor;
          ctx.beginPath();
          ctx.moveTo(x, top - 2);
          ctx.lineTo(x + 8, top + 3);
          ctx.lineTo(x, top + 8);
          ctx.closePath();
          ctx.fill();
          ctx.fillRect(x - 1, top - 2, 1.5, 14);
          if (r.raceName) {
            ctx.font = '600 10px -apple-system, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(r.raceName, x + 11, top + 7);
          }
          ctx.restore();
        });
      },
    };

    // Identical layout padding and x-scale config on both instances, so
    // their chart areas -- and therefore the y-tick pixel rows -- match.
    const sharedLayout = { padding: { top: 18 } };
    const sharedX = { ticks: { display: false }, grid: { display: false } };

    const plotChart = new ChartJS(plotCanvas, {
      data: { labels, datasets },
      plugins: [todayLine, raceFlags],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: sharedLayout,
        interaction: { mode: 'index', axis: 'x', intersect: false },
        scales: {
          x: sharedX,
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
            filter: (item) => item.dataset.label === 'value',
            backgroundColor: cssVar('--fg'),
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
                const lines = [`${WEEK_TYPE_LABEL[row.type]}${row.isActual ? '' : ' (planned)'}`, `${Math.round(row.value)} ${unit}`];
                if (metric !== 'dminus') lines.push(`LR ${Math.round(row.longestKm)} km`);
                lines.push(`D- ${Math.round(row.dminusWeek)} m`);
                lines.push(`Verdict: ${FLAG_COLOUR_LABEL[row.verdictColour]}`);
                return lines;
              },
            },
          },
        },
      },
    });

    const axisChart = new ChartJS(axisCanvas, {
      data: { labels: [''], datasets: [{ type: 'bar', label: 'value', data: [0] }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: sharedLayout,
        scales: {
          x: sharedX,
          y: {
            max: topY,
            ticks: { color: muted, stepSize: step, font: { size: 11 } },
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
