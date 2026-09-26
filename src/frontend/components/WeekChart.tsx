import { Chart as ChartJS, type Plugin } from 'chart.js';
import { useEffect, useRef } from 'preact/hooks';
import { cssVar, ensureChartRegistered, hatchPattern, withAlpha } from '../charts';
import { FLAG_COLOUR_LABEL, WEEK_TYPE_LABEL } from '../labels';
import type { FlagColour, Settings, WeekState, WeekType } from '../types';

export type Metric = 'km' | 'effortKm' | 'dminus';

interface Row {
  weekStart: string;
  isActual: boolean;
  isRace: boolean;
  raceName: string | null;
  type: WeekType;
  verdictColour: FlagColour;
  longestKm: number;
  dminusWeek: number;
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
    const common = {
      weekStart: w.weekStart,
      isActual: w.isActual,
      isRace,
      raceName: w.raceName,
      type: w.type,
      verdictColour: w.verdict.colour,
      longestKm: w.longestKm,
      dminusWeek: w.dminusWeek,
    };

    if (metric === 'dminus') {
      const dw4 = w.refs.DW4;
      return {
        ...common,
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
      ...common,
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

export function WeekChart({ weeks, metric, settings, currentWeekStart }: { weeks: WeekState[]; metric: Metric; settings: Settings; currentWeekStart: string }) {
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
    const border = cssVar('--border');
    const barColor = cssVar('--fg');
    const raceColor = cssVar('--violet');
    const accent = cssVar('--accent');
    const blueBg = cssVar('--blue-bg');
    const greenBg = cssVar('--green-bg');
    const yellowBg = cssVar('--yellow-bg');
    const redBg = cssVar('--red-bg');

    // Clamp the y max to 1.2x the largest bar (v1.1 UI pass), not the
    // colour zones or the long-run/descent overlay -- a big outlier
    // reference no longer stretches the whole axis; Chart.js clips
    // anything above it instead.
    const maxBar = Math.max(10, ...rows.map((r) => r.value));
    const topY = maxBar * 1.2;

    // Planned bars use the same colour logic as actual ones (violet for a
    // race, fg otherwise) but lighter -- a faded hatch, not a different
    // hue (v1.1 UI pass).
    const barBackgrounds = rows.map((r) => {
      const color = r.isRace ? raceColor : barColor;
      return r.isActual ? color : hatchPattern(withAlpha(color, 0.55));
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

    // "Today": a vertical divider between the last actual bar and the
    // first planned one, so the plan side of the chart reads distinctly
    // from history at a glance (v1.1 UI pass).
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

    // A small flag + the race's name above its bar (v1.1 UI pass) -- the
    // bar colour alone (violet) already marks a race, but naming it
    // doesn't need a tooltip tap.
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

    chartRef.current?.destroy();
    chartRef.current = new ChartJS(canvas, {
      data: { labels, datasets },
      plugins: [todayLine, raceFlags],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 18 } },
        scales: {
          x: { ticks: { color: muted, autoSkip: true, maxRotation: 0, font: { size: 11 } }, grid: { display: false } },
          y: {
            max: topY,
            ticks: { color: muted, maxTicksLimit: 5, font: { size: 11 } },
            grid: { color: border, lineWidth: 1 },
            border: { display: false },
            beginAtZero: true,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: (item) => item.dataset.label === 'value',
            backgroundColor: fg,
            titleColor: cardBg,
            bodyColor: cardBg,
            padding: 10,
            cornerRadius: 10,
            displayColors: false,
            callbacks: {
              title: (items) => fmtLabel(rows[items[0].dataIndex].weekStart),
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

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [weeks, metric, settings, currentWeekStart]);

  return (
    <div class="chart-wrap">
      <canvas ref={canvasRef} />
    </div>
  );
}
