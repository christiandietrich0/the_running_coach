import { Chart as ChartJS, type Plugin } from 'chart.js';
import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';
import { AXIS_FONT_FAMILY, buildChartRows, cssVar, ensureChartRegistered, fmtWeekLabel, niceScale, withAlpha, type Metric } from '../charts';
import { FLAG_COLOUR_LABEL, WEEK_TYPE_LABEL } from '../labels';
import type { Settings, WeekState } from '../types';

// Top row of the two-chart split (v1.1 mobile polish, calmed down in the
// v1.1 round 8 chart redesign): the metric's weekly bars, a single soft
// green band, the "Today" divider and a small race flag. Renders two
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

    const rows = buildChartRows(weeks, metric, settings, currentWeekStart);
    const labels = rows.map((r) => fmtWeekLabel(r.weekStart));

    const muted = cssVar('--muted');
    const cardBg = cssVar('--card-bg');
    const border = withAlpha(cssVar('--border'), 0.6);
    const accent = cssVar('--accent');
    const raceColor = cssVar('--violet');
    const yellow = cssVar('--yellow');
    const red = cssVar('--red');
    const greenBg = cssVar('--green-bg');

    // Round the axis to a nice ceiling/step (v1.1 mobile polish), 3-4
    // ticks (v1.1 round 8 redesign) instead of raw max*1.2, which produced
    // non-round ticks like 117.6.
    const rawMax = Math.max(10, ...rows.map((r) => r.value));
    const { max: topY, step } = niceScale(rawMax, 4);

    // Every bar is the same muted accent colour, race weeks in the race
    // colour -- a flagged week no longer turns its bar yellow/red, it gets
    // a small coloured dot above it instead (v1.1 review round 9 item 10),
    // drawn by flagDots below. Past weeks are solid; a planned (not yet
    // actual) week is a light tint of the same colour with a thin outline,
    // not a hatch.
    function baseColor(r: (typeof rows)[number]): string {
      return r.isRace ? raceColor : accent;
    }
    const barBackgrounds = rows.map((r) => (r.isActual ? baseColor(r) : withAlpha(baseColor(r), 0.16)));
    const barBorders = rows.map((r) => baseColor(r));
    const barBorderWidths = rows.map((r) => (r.isActual ? 0 : 1.5));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasets: any[] = [
      // A hidden reference line at the green band's floor, and the actual
      // band filled up to its ceiling against that floor (fill: '-1') --
      // the only zone shading left after the redesign (v1.1 round 8).
      { type: 'line', label: 'green-floor', data: rows.map((r) => r.b1), borderWidth: 0, pointRadius: 0, fill: false, order: 10 },
      { type: 'line', label: 'green-zone', data: rows.map((r) => r.b2), borderWidth: 0, pointRadius: 0, fill: '-1', backgroundColor: greenBg, order: 10 },
      {
        type: 'bar',
        label: 'value',
        data: rows.map((r) => r.value),
        backgroundColor: barBackgrounds,
        borderColor: barBorders,
        borderWidth: barBorderWidths,
        borderRadius: 5,
        order: 2,
        categoryPercentage: 0.9,
        barPercentage: 0.85,
        maxBarThickness: 24,
      },
    ];

    // "Today": a thin divider between the last actual bar and the first
    // planned one, with a small label (v1.1 round 8 redesign).
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
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = accent;
        ctx.font = '600 9px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        // Clear of flagDots' own band (top - 9 to top - 3, see below): the
        // label sits a further row up instead of right on top of a dot
        // that happens to land next to the today-line (v1.1 review round
        // 10 item 5).
        ctx.fillText('Today', x, top - 11);
        ctx.restore();
      },
    };

    // A small flag on a race week's bar -- the name moved into the
    // tooltip (v1.1 round 8 redesign), so the chart itself stays quiet.
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
          ctx.moveTo(x, top - 1);
          ctx.lineTo(x + 7, top + 3);
          ctx.lineTo(x, top + 7);
          ctx.closePath();
          ctx.fill();
          ctx.fillRect(x - 1, top - 1, 1.5, 12);
          ctx.restore();
        });
      },
    };

    // A small dot above a flagged (yellow/red) week's bar, instead of
    // colouring the bar itself (v1.1 review round 9 item 10) -- a race
    // week keeps its own flag marker above and is skipped here.
    const flagDots: Plugin<'bar'> = {
      id: 'flagDots',
      afterDraw(chart) {
        const scale = chart.scales.x;
        const yScale = chart.scales.y;
        const { top } = chart.chartArea;
        const ctx = chart.ctx;
        rows.forEach((r, i) => {
          if (r.isRace) return;
          const dotColor = r.verdictColour === 'RED' ? red : r.verdictColour === 'YELLOW' ? yellow : null;
          if (!dotColor) return;
          const x = scale.getPixelForValue(i);
          const y = Math.min(yScale.getPixelForValue(r.value), top) - 6;
          ctx.save();
          ctx.fillStyle = dotColor;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      },
    };

    // A thin row of single-letter week-type markers (B/P/T/R/Rec/H/D/L)
    // right under the bars, in the layout's own bottom padding (v1.1
    // review round 9 item 9) -- the current week's letter picks out in
    // the accent colour, same as the axis highlighting below.
    const typeLetterRow: Plugin<'bar'> = {
      id: 'typeLetterRow',
      afterDraw(chart) {
        const scale = chart.scales.x;
        const { bottom } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '600 9px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        rows.forEach((r, i) => {
          const x = scale.getPixelForValue(i);
          ctx.fillStyle = r.weekStart === currentWeekStart ? accent : muted;
          ctx.fillText(r.typeLetter, x, bottom + 4);
        });
        ctx.restore();
      },
    };

    // Identical top/bottom padding and x-scale config on both instances,
    // so their chart areas -- and therefore the y-tick pixel rows -- match
    // (the axis canvas doesn't draw the letter row itself, but still
    // reserves the same bottom space so it doesn't need to). Only the
    // wide, scrollable plot canvas also gets left padding: it keeps the
    // very first week's x-axis label (in the overlay row below) from being
    // sliced by the scroll container's edge when there isn't 8 weeks of
    // history yet to scroll past (v1.1 polish). The narrow axis canvas
    // doesn't scroll and doesn't need it -- adding it there would just push
    // its already-tight tick numbers off its own right edge. Both plot
    // canvases (this row and the overlay row) need the *same* left value
    // to stay column-aligned with each other.
    //
    // bottom: 20 (not 14) -- the type-letter row's own text was being cut
    // off against the old, tighter padding, which then read as colliding
    // with the overlay row's title/axis tick right underneath it (v1.1
    // review round 10 item 5). top: 22 gives the "Today" label (now drawn
    // further up, see todayLine) room of its own above flagDots' band.
    // left: 22, matching WeekOverlayChart's own plotLayout below -- a 5-6
    // character date label like "Aug 3" is wide enough that half its width
    // alone exceeded the old 12px there, so the first week's label was
    // still getting sliced by the scroll container's left edge (v1.1
    // review round 10 follow-up item 4).
    const sharedLayout = { padding: { top: 22, bottom: 20 } };
    const plotLayout = { padding: { top: 22, bottom: 20, left: 22 } };
    const sharedX = { ticks: { display: false }, grid: { display: false }, border: { display: false } };

    const plotChart = new ChartJS(plotCanvas, {
      data: { labels, datasets },
      plugins: [todayLine, raceFlags, flagDots, typeLetterRow],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: plotLayout,
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
                // A week that has started already has real (if still partial)
                // numbers, not a forecast -- so it reads "done" as soon as
                // it's the current week or earlier, not just once isActual
                // (strictly before this week) flips true (v1.1 polish).
                const started = row.weekStart <= currentWeekStart;
                const lines = [`${WEEK_TYPE_LABEL[row.type]}${started ? ' (done)' : ' (planned)'}`];
                if (row.isRace && row.raceName) lines.push(row.raceName);
                lines.push(`${Math.round(row.value)} ${unit}`);
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
            ticks: { color: muted, stepSize: step, font: { size: 11, family: AXIS_FONT_FAMILY } },
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
