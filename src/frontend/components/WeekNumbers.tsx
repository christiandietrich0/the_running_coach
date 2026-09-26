import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { fmtKm, fmtM } from '../format';
import type { Settings, WeekState } from '../types';

// The three progress bars from mechanics brief 8.1: weekly km, long run,
// descent. Ceilings, not targets: when a corridor bound is unbounded
// (Infinity, e.g. Race/Taper weeks or too little history yet), the bar and
// cap text are skipped and only the done value shows.
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

// Weekly km's own bar: the green range (0.8-1.2x C) is the acceptable
// band, same as the This Week headline; the week-type corridor's own
// ceiling is just a marker on top of it, not the bar's own 100%. Fill only
// ever turns yellow/red above the band.
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
  const [showDetails, setShowDetails] = useState(false);
  const { kmWeek, longestKm, dminusWeek, longestLossM, corridor, refs } = week;
  const lrCapped = Number.isFinite(corridor.lrMax);
  const dwCapped = Number.isFinite(corridor.dminusWeekMax);
  const drCapped = Number.isFinite(corridor.dminusRunMax);

  const hasGreenRange = refs.C > 0;
  const greenMin = settings.ratioZoneEdges.greenMin * refs.C;
  const greenMax = settings.ratioZoneEdges.greenMax * refs.C;
  const kmCapped = Number.isFinite(corridor.kmMax);

  return (
    <div class="week-numbers">
      <Stat label="Weekly km">
        <div class="stat-value">{fmtKm(kmWeek)} km</div>
        {hasGreenRange ? (
          <BandedBar doneKm={kmWeek} greenMin={greenMin} greenMax={greenMax} targetMax={kmCapped ? corridor.kmMax : null} />
        ) : (
          kmCapped && <Bar fraction={kmWeek / corridor.kmMax} />
        )}
      </Stat>

      <Stat label="Long run">
        <div class="stat-value">{fmtKm(longestKm)} km</div>
        {lrCapped && (
          <>
            <Bar fraction={longestKm / corridor.lrMax} />
            <div class="stat-cap-note">Long run: up to {fmtKm(corridor.lrMax)} km</div>
          </>
        )}
      </Stat>

      <Stat label="Descent">
        <div class="stat-value">{fmtM(dminusWeek)} m</div>
        {dwCapped && (
          <>
            <Bar fraction={dminusWeek / corridor.dminusWeekMax} />
            <div class="stat-cap-note">Up to {fmtM(corridor.dminusWeekMax)} m this week</div>
          </>
        )}
        <div class="stat-value stat-value-secondary">{fmtM(longestLossM)} m in one run</div>
        {drCapped && (
          <>
            <Bar fraction={longestLossM / corridor.dminusRunMax} />
            <div class="stat-cap-note">Up to {fmtM(corridor.dminusRunMax)} m in one run</div>
          </>
        )}
      </Stat>

      <div>
        <button type="button" class="details-toggle" onClick={() => setShowDetails((s) => !s)}>
          <span class={`details-toggle-caret${showDetails ? ' details-toggle-caret-open' : ''}`}>&rsaquo;</span>
          {showDetails ? 'Hide' : 'Show'} ratios and references
        </button>
        {showDetails && (
          <div class="details-panel">
            <div class="details-row">
              <span>Chronic average (C)</span>
              <span>{refs.C > 0 ? `${fmtKm(refs.C)} km` : '--'}</span>
            </div>
            <div class="details-row">
              <span>Weekly ratio (km / C)</span>
              <span>{refs.C > 0 ? (kmWeek / refs.C).toFixed(2) : '--'}</span>
            </div>
            <div class="details-row">
              <span>30-day longest run (LR30)</span>
              <span>{refs.LR30 > 0 ? `${fmtKm(refs.LR30)} km` : '--'}</span>
            </div>
            <div class="details-row">
              <span>30-day max descent (D30)</span>
              <span>{refs.D30 > 0 ? `${fmtM(refs.D30)} m` : '--'}</span>
            </div>
            <div class="details-row">
              <span>Recent max weekly descent (DW4)</span>
              <span>{refs.DW4 > 0 ? `${fmtM(refs.DW4)} m` : '--'}</span>
            </div>
            <div class="details-row">
              <span>12-week average (M12)</span>
              <span>{refs.M12 > 0 ? `${fmtKm(refs.M12)} km` : '--'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
