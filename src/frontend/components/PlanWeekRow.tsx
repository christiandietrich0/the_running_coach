import { fmtKm, fmtM } from '../format';
import { weekChipLabel } from '../labels';
import type { RaceState, WeekState } from '../types';

function fmtWeekLabel(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// A small mini-bar: this week's km against its own corridor ceiling, with
// a dot marking the long run's position on the same scale, numbers on the
// right (v1.1 UI pass). Race/Taper/Recovery weeks have an open corridor
// (kmMax === Infinity, by design -- they're not a percentage-of-C rule),
// so those fall back to the account's own max-week life cap as the scale
// instead of the week's own km -- otherwise every such bar would render
// at a meaningless, constant ~95% full regardless of actual volume.
function MiniBar({ kmWeek, kmMax, longestKm, lrMax, maxWeekKm }: { kmWeek: number; kmMax: number; longestKm: number; lrMax: number; maxWeekKm: number }) {
  const referenceMax = Number.isFinite(kmMax) ? kmMax : maxWeekKm;
  const scale = Math.max(referenceMax, kmWeek, 1) * 1.05;
  const pct = (v: number) => Math.max(0, Math.min(100, (v / scale) * 100));
  const over = kmWeek > referenceMax;

  return (
    <div class="plan-row-bar-wrap">
      <div class="plan-row-bar">
        <div class={`plan-row-bar-fill${over ? ' meter-fill-over' : ''}`} style={{ width: `${pct(kmWeek)}%` }} />
        {Number.isFinite(lrMax) && <div class="plan-row-bar-lr" style={{ left: `${pct(longestKm)}%` }} title={`Long run: ${fmtKm(longestKm)} km`} />}
      </div>
      <span class="plan-row-bar-number">{fmtKm(kmWeek)} km</span>
    </div>
  );
}

export function PlanWeekRow({
  week,
  isCurrent,
  peakRace,
  races,
  maxWeekKm,
  onClick,
}: {
  week: WeekState;
  isCurrent: boolean;
  peakRace: RaceState | null;
  races: RaceState[];
  maxWeekKm: number;
  onClick: () => void;
}) {
  const dplusM = Math.max(0, (week.effortKmWeek - week.kmWeek) * 100);
  const chip = weekChipLabel(week, races);
  // suggestPlan() clamps every generated week to green, peak weeks
  // included (v1.1 review round 6) -- when that clamp actually bit, this
  // is lower than the race's own peak target, worth calling out on the
  // row itself, not just on the race card.
  const peakCapped = peakRace != null && week.kmWeek < peakRace.targets.peakWeekEffortKm - 0.5;

  return (
    <button type="button" class="plan-row" onClick={onClick}>
      <span class={`dot dot-${week.verdict.colour.toLowerCase()}`} />
      <div class="plan-row-body">
        <div class="plan-row-top">
          <span class={`pill${week.type === 'RACE' ? ' pill-race' : ''}`}>{chip.text}</span>
          <span class={`plan-row-date${isCurrent ? ' plan-row-current' : ''}`}>{fmtWeekLabel(week.weekStart)}</span>
          {week.userEdited && <span class="plan-row-edited">edited</span>}
        </div>

        <MiniBar kmWeek={week.kmWeek} kmMax={week.corridor.kmMax} longestKm={week.longestKm} lrMax={week.corridor.lrMax} maxWeekKm={maxWeekKm} />

        {isCurrent && Number.isFinite(week.corridor.kmMax) ? (
          <div class="plan-row-numbers">
            Target {fmtKm(week.corridor.kmMin)} to {fmtKm(week.corridor.kmMax)} km · LR {fmtKm(week.longestKm)} km · D+ {fmtM(dplusM)} m · D-{' '}
            {fmtM(week.dminusWeek)} m
          </div>
        ) : (
          <div class="plan-row-numbers">
            LR {fmtKm(week.longestKm)} km · D+ {fmtM(dplusM)} m · D- {fmtM(week.dminusWeek)} m
          </div>
        )}

        {peakCapped && (
          <div class="plan-row-capped">
            Peak week capped at {fmtKm(week.kmWeek)} km (race target {fmtKm(peakRace!.targets.peakWeekEffortKm)} km)
          </div>
        )}
      </div>
    </button>
  );
}
