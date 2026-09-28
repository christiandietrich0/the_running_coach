import { BarController, BarElement, CategoryScale, Chart, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import type { FlagColour, Settings, WeekState, WeekType } from './types';

export type Metric = 'km' | 'effortKm' | 'dminus';

// Fixed y-axis column width (v1.1 mobile polish): both the scrolling plot
// canvas and its pinned axis-only canvas force their y-scale to this same
// width via `afterFit`, so the two stay pixel-aligned regardless of how
// wide the tick label text happens to be.
//
// The floor is 60, not just "wide enough for the widest tick label": a
// canvas narrower than ~50-60 CSS px reliably mis-composites its
// right-aligned text in Chromium (confirmed in isolation with a bare
// Chart.js instance, no app code involved -- the canvas's own pixel
// buffer is correct via toDataURL, but the on-screen paint clips the
// leading characters regardless of how much room the text actually
// needs), which is what made every axis tick read as "0" for round
// numbers like 0/50/100/150 (v1.1 round 9 item 2 -- round 8 misdiagnosed
// the same symptom as a font-measurement mismatch and, separately, as a
// screenshot-only artifact; neither was the real cause).
export const Y_AXIS_WIDTH = 60;

// Charts always set this explicitly on every tick font (both the real
// axis-only canvas and the offscreen measurement in measureTickWidth
// below) -- Chart.js's own default tick font family doesn't match, so
// leaving it unset measured one width and rendered another, wide enough
// to clip the leading digit of "150"-style labels off the narrow axis
// column (v1.1 round 8 chart redesign).
export const AXIS_FONT_FAMILY = '-apple-system, sans-serif';

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
  overlayValue: number | null;
  overlayCap: number;
  // True when this week's own long run / single-run descent was flagged
  // red and so didn't raise LR30/D30 for later weeks (v1.1 review round 9
  // item 8) -- exactly the same red flag flags() independently computed
  // for this week, since both use the same reference and the same red
  // threshold.
  notCountedAsReference: boolean;
  // Single-letter week-type marker for the thin row under the bars chart
  // (v1.1 review round 9 item 9).
  typeLetter: string;
}

// A race's own Build-typed peak week reads "P", not "B" -- same
// distinction weekChipLabel() in labels.ts draws for the chip text, just
// condensed to a single letter here.
const WEEK_TYPE_LETTER: Record<WeekType, string> = {
  BUILD: 'B',
  HOLD: 'H',
  DOWN: 'D',
  TAPER: 'T',
  RACE: 'R',
  LIMITED: 'L',
  RECOVERY: 'Rec',
};

function weekTypeLetter(w: WeekState): string {
  if (w.peakForRaceId != null) return 'P';
  return WEEK_TYPE_LETTER[w.type];
}

// Colour-zone boundaries and the long-run/descent overlay, per metric.
// effort-km reuses the km-based C and the plain-km long run distance:
// there's no separate effort-km chronic reference, and the week's longest
// run doesn't carry its own elevation gain in the state payload, only the
// week's aggregate does.
export function buildChartRows(weeks: WeekState[], metric: Metric, settings: Settings, currentWeekStart: string): ChartRow[] {
  return weeks.map((w) => {
    const isRace = w.type === 'RACE';
    const isCurrent = w.weekStart === currentWeekStart;
    // The in-progress week's own kmWeek/effortKmWeek/dminusWeek/longestKm
    // are blended up to the plan's target for reference purposes
    // (references()/flags()/corridor() -- see blendCurrentWeekReference in
    // src/worker/state.ts); the chart shows real progress instead, so it
    // never draws this week's bar or long-run/descent dot as if the
    // plan's target already happened (v1.1 review round 9 item 1).
    const displayKmWeek = isCurrent ? w.doneKmWeek : w.kmWeek;
    const displayEffortKmWeek = isCurrent ? w.doneEffortKmWeek : w.effortKmWeek;
    const displayDminusWeek = isCurrent ? w.doneDminusWeek : w.dminusWeek;
    const displayLongestKm = isCurrent ? w.doneLongestKm : w.longestKm;
    const displayLongestLossM = isCurrent ? w.doneLongestLossM : w.longestLossM;
    // No run logged yet this week: there's nothing to plot as a long run
    // or single-run descent yet, so the overlay chart gets a gap here
    // instead of a misleading dot at 0 (v1.1 review round 9 item 5).
    const noRunYet = isCurrent && w.doneLongestKm <= 0;
    // The same red flag flags() computed for this week's own long run or
    // single-run descent is exactly "this didn't raise the reference"
    // (v1.1 review round 9 item 8) -- no separate bookkeeping needed.
    const notCountedAsReference =
      metric === 'dminus'
        ? w.flags.some((f) => f.kind === 'DESCENT_SINGLE' && f.colour === 'RED')
        : w.flags.some((f) => f.kind === 'LONG_RUN' && f.colour === 'RED');

    const common = {
      weekStart: w.weekStart,
      isActual: w.isActual,
      isRace,
      raceName: w.raceName,
      type: w.type,
      verdictColour: w.verdict.colour,
      longestKm: displayLongestKm,
      dminusWeek: displayDminusWeek,
      notCountedAsReference,
      typeLetter: weekTypeLetter(w),
    };

    if (metric === 'dminus') {
      const dw4 = w.refs.DW4;
      return {
        ...common,
        value: displayDminusWeek,
        b1: 0,
        b2: dw4 > 0 ? settings.weeklyDminusCapFactor * dw4 : 0,
        b3: dw4 > 0 ? settings.weeklyDminusRedFactor * dw4 : 0,
        overlayValue: noRunYet ? null : displayLongestLossM,
        overlayCap: w.refs.D30 > 0 ? settings.singleRunDminusCapFactor * w.refs.D30 : 0,
      };
    }

    const c = w.refs.C;
    return {
      ...common,
      value: metric === 'km' ? displayKmWeek : displayEffortKmWeek,
      b1: c > 0 ? settings.ratioZoneEdges.lowVolume * c : 0,
      b2: c > 0 ? settings.ratioZoneEdges.greenMax * c : 0,
      b3: c > 0 ? settings.ratioZoneEdges.red * c : 0,
      overlayValue: noRunYet ? null : displayLongestKm,
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
  ctx.font = `${fontPx}px ${AXIS_FONT_FAMILY}`;
  let widest = 0;
  for (let v = 0; v <= maxValue + 1e-6; v += step) {
    widest = Math.max(widest, ctx.measureText(Math.round(v).toLocaleString('en-US')).width);
  }
  return Math.max(Y_AXIS_WIDTH, Math.ceil(widest) + 14);
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
