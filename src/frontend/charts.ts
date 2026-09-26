import { BarController, BarElement, CategoryScale, Chart, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';

let registered = false;

export function ensureChartRegistered(): void {
  if (registered) return;
  Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Filler, Tooltip);
  registered = true;
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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
