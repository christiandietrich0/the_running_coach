import { BarController, BarElement, CategoryScale, Chart, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import type { FlagColour, Settings, WeekState, WeekType } from './types';

export type Metric = 'km' | 'effortKm' | 'dminus';

// Fixed y-axis column width (v1.1 mobile polish): both the scrolling plot
// canvas and its pinned axis-only canvas force their y-scale to this same
// width via `afterFit`, so the two stay pixel-aligned regardless of how
// wide the tick label text happens to be.
export const Y_AXIS_WIDTH = 34;

export interface ChartRow {
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
export function buildChartRows(weeks: WeekState[], metric: Metric, settings: Settings): ChartRow[] {
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

export function fmtWeekLabel(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

let registered = false;

export function ensureChartRegistered(): void {
  if (registered) return;
  Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip);
  registered = true;
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Heckbert's "nice numbers" algorithm: picks a round axis max and step
// (multiples of 1/2/5 x a power of ten) instead of chart.js's default of
// slicing whatever raw max*1.2 happens to be into N ticks -- which is how
// the old chart produced labels like 117.6 (v1.1 mobile polish).
function niceNumber(value: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
}

export function niceScale(rawMax: number, targetTicks = 5): { max: number; step: number } {
  if (rawMax <= 0) return { max: targetTicks, step: 1 };
  const range = niceNumber(rawMax, false);
  const step = niceNumber(range / (targetTicks - 1), true);
  const max = Math.ceil(rawMax / step) * step;
  return { max, step };
}

// How wide the y-axis column needs to be to fit its widest tick label
// without clipping -- km values fit in Y_AXIS_WIDTH, but descent-metres
// ticks (e.g. "2,000") need more room, so the column is sized per metric
// rather than fixed.
export function measureTickWidth(maxValue: number, step: number, fontPx: number): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return Y_AXIS_WIDTH;
  ctx.font = `${fontPx}px -apple-system, sans-serif`;
  let widest = 0;
  for (let v = 0; v <= maxValue + 1e-6; v += step) {
    widest = Math.max(widest, ctx.measureText(Math.round(v).toLocaleString('en-US')).width);
  }
  return Math.max(Y_AXIS_WIDTH, Math.ceil(widest) + 10);
}

// Fades a `#rrggbb` CSS custom property down to a given alpha, for planned
// (lighter) bars that still follow "the same colour logic" as their actual
// counterpart (v1.1 UI pass) -- just not solid. Anything already using
// alpha (rgba(...)) is returned as-is rather than double-applying it.
export function withAlpha(hexColor: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hexColor.trim());
  if (!m) return hexColor;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// A diagonal-stripe canvas pattern for planned (not-yet-happened) bars, so
// they read as "hatched" against solid bars for actual weeks (mechanics
// brief 8.2). Planned bars use a thinner stroke on a wider pitch than
// before (v1.1 UI pass), reading as visibly lighter than a solid bar of
// the same colour logic, not just a different fill.
export function hatchPattern(color: string): CanvasPattern | string {
  const canvas = document.createElement('canvas');
  canvas.width = 10;
  canvas.height = 10;
  const ctx = canvas.getContext('2d');
  if (!ctx) return color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(10, 0);
  ctx.moveTo(-2.5, 2.5);
  ctx.lineTo(2.5, -2.5);
  ctx.moveTo(7.5, 12.5);
  ctx.lineTo(12.5, 7.5);
  ctx.stroke();
  return ctx.createPattern(canvas, 'repeat') ?? color;
}
