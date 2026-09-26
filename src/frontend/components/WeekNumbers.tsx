import type { ComponentChildren } from 'preact';
import { fmtKm, fmtM } from '../format';
import type { Settings, WeekState } from '../types';

// The three numbers with progress bars from mechanics brief 8.1: weekly
// km ("42 of 48 to 55"), long run ("max 33 km"), descent ("max 1,400 m
// this week, 700 m in one run"). Ceilings, not targets: when a corridor
// bound is unbounded (Infinity, e.g. Race/Taper weeks or too little
// history yet), the bar and cap text are skipped and only the done value
// shows.
function Bar({ fraction }: { fraction: number }) {
  // A 0-km cap (e.g. a Recovery week whose cap worked out to 0) divided
  // into a 0-km done total is a valid state, not an error -- render it as
  // empty rather than a NaN-width bar (v1.1 review round 3 item 5).
  const safeFraction = Number.isFinite(fraction) ? fraction : 0;
  const pct = Math.max(0, Math.min(1, safeFraction)) * 100;
  return (
    <div class="meter-track">
      <div class={`meter-fill${fraction > 1 ? ' meter-fill-over' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Weekly km's own bar (v1.1 review round 4 item 2): the green range
// (0.8-1.2x C) is the acceptable band, same as the This Week banner text;
// the week-type corridor's own ceiling is just a marker on top of it, not
// the bar's own 100%.
function BandedBar({ doneKm, greenMin, greenMax, targetMax }: { doneKm: number; greenMin: number; greenMax: number; targetMax: number | null }) {
  const scaleMax = Math.max(greenMax, targetMax ?? 0, doneKm, 1) * 1.05;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / scaleMax) * 100));
  const bandLeft = pct(greenMin);
  const bandRight = pct(greenMax);
  const over = doneKm > greenMax;

  return (
    <div class="meter-track meter-track-banded">
      <div class="meter-band" style={{ left: `${bandLeft}%`, width: `${Math.max(0, bandRight - bandLeft)}%` }} />
      <div class={`meter-fill-banded${over ? ' meter-fill-over' : ''}`} style={{ width: `${pct(doneKm)}%` }} />
      {targetMax != null && <div class="meter-marker" style={{ left: `${pct(targetMax)}%` }} />}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="stat">
      <div class="stat-label">{label}</div>
      {children}
    </div>
  );
}

export function WeekNumbers({ week, settings }: { week: WeekState; settings: Settings }) {
  const { kmWeek, longestKm, dminusWeek, longestLossM, corridor, refs } = week;
  const kmCapped = Number.isFinite(corridor.kmMax);
  const lrCapped = Number.isFinite(corridor.lrMax);
  const dwCapped = Number.isFinite(corridor.dminusWeekMax);
  const drCapped = Number.isFinite(corridor.dminusRunMax);

  const hasGreenRange = refs.C > 0;
  const greenMin = settings.ratioZoneEdges.greenMin * refs.C;
  const greenMax = settings.ratioZoneEdges.greenMax * refs.C;

  return (
    <div class="week-numbers">
      <Stat label="Weekly km">
        <div class="stat-value">
          {kmCapped ? `${fmtKm(kmWeek)} of ${fmtKm(corridor.kmMin)} to ${fmtKm(corridor.kmMax)}` : `${fmtKm(kmWeek)} km`}
        </div>
        {hasGreenRange ? (
          <BandedBar doneKm={kmWeek} greenMin={greenMin} greenMax={greenMax} targetMax={kmCapped ? corridor.kmMax : null} />
        ) : (
          kmCapped && <Bar fraction={kmWeek / corridor.kmMax} />
        )}
      </Stat>

      <Stat label="Long run">
        <div class="stat-value">{lrCapped ? `${fmtKm(longestKm)} of max ${fmtKm(corridor.lrMax)} km` : `${fmtKm(longestKm)} km`}</div>
        {lrCapped && <Bar fraction={longestKm / corridor.lrMax} />}
      </Stat>

      <Stat label="Descent">
        <div class="stat-value">
          {dwCapped ? `${fmtM(dminusWeek)} of max ${fmtM(corridor.dminusWeekMax)} m this week` : `${fmtM(dminusWeek)} m this week`}
        </div>
        {dwCapped && <Bar fraction={dminusWeek / corridor.dminusWeekMax} />}
        <div class="stat-value stat-value-secondary">
          {drCapped ? `${fmtM(longestLossM)} of max ${fmtM(corridor.dminusRunMax)} m in one run` : `${fmtM(longestLossM)} m in one run`}
        </div>
        {drCapped && <Bar fraction={longestLossM / corridor.dminusRunMax} />}
      </Stat>
    </div>
  );
}
