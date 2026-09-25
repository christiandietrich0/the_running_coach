import type { ComponentChildren } from 'preact';
import { fmtKm, fmtM } from '../format';
import type { WeekState } from '../types';

// The three numbers with progress bars from mechanics brief 8.1: weekly
// km ("42 of 48 to 55"), long run ("max 33 km"), descent ("max 1,400 m
// this week, 700 m in one run"). Ceilings, not targets: when a corridor
// bound is unbounded (Infinity, e.g. Race/Taper weeks or too little
// history yet), the bar and cap text are skipped and only the done value
// shows.
function Bar({ fraction }: { fraction: number }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div class="meter-track">
      <div class={`meter-fill${fraction > 1 ? ' meter-fill-over' : ''}`} style={{ width: `${pct}%` }} />
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

export function WeekNumbers({ week }: { week: WeekState }) {
  const { kmWeek, longestKm, dminusWeek, longestLossM, corridor } = week;
  const kmCapped = Number.isFinite(corridor.kmMax);
  const lrCapped = Number.isFinite(corridor.lrMax);
  const dwCapped = Number.isFinite(corridor.dminusWeekMax);
  const drCapped = Number.isFinite(corridor.dminusRunMax);

  return (
    <div class="week-numbers">
      <Stat label="Weekly km">
        <div class="stat-value">
          {kmCapped ? `${fmtKm(kmWeek)} of ${fmtKm(corridor.kmMin)} to ${fmtKm(corridor.kmMax)}` : `${fmtKm(kmWeek)} km`}
        </div>
        {kmCapped && <Bar fraction={kmWeek / corridor.kmMax} />}
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
