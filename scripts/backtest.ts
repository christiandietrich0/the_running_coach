// Backtest driver: runs the logic module over the real history synced
// into local D1 and prints a week-by-week table. See
// training_planner_technical_brief.md section 6 ("Backtest") and the
// Phase 3 checkpoint in docs/claude_code_kickoff_prompt.md.
//
// Reads local D1 via `wrangler d1 execute --json` (this script runs under
// plain Node/tsx, not the Workers runtime, so it has no D1 binding of its
// own). Usage: npm run backtest
import { execFileSync } from 'node:child_process';
import { buildDenseTimeline, mergeRuns, weeklyAggregates } from '../src/logic/aggregate';
import { flags, verdict } from '../src/logic/flags';
import { references } from '../src/logic/references';
import { DEFAULTS } from '../src/worker/defaults';
import type { RawActivity, TimelinePoint, WeekType } from '../src/logic/types';

interface ActivityRow {
  id: string;
  start_local: string;
  type: string;
  distance_m: number | null;
  moving_s: number | null;
  gain_m: number | null;
  loss_m: number | null;
  race_flag: number;
}

interface OverrideRow {
  activity_id: string;
  is_race: number | null;
  exclude: number;
}

function d1Query<T>(sql: string): T[] {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'running-coach-db', '--local', '--json', '--command', sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(out) as { results: T[] }[];
  return parsed[0]?.results ?? [];
}

function loadActivities(): RawActivity[] {
  const activities = d1Query<ActivityRow>('SELECT id, start_local, type, distance_m, moving_s, gain_m, loss_m, race_flag FROM activities;');
  const overrides = new Map(d1Query<OverrideRow>('SELECT activity_id, is_race, exclude FROM activity_overrides;').map((o) => [o.activity_id, o]));

  const raw: RawActivity[] = [];
  for (const a of activities) {
    const override = overrides.get(a.id);
    if (override?.exclude) continue;
    const isRace = override?.is_race != null ? override.is_race === 1 : a.race_flag === 1;
    raw.push({
      id: a.id,
      startLocal: a.start_local,
      distanceM: a.distance_m ?? 0,
      movingS: a.moving_s ?? 0,
      gainM: a.gain_m ?? 0,
      lossM: a.loss_m ?? 0,
      isRace,
    });
  }
  return raw;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function fmtRatio(value: number, ref: number): string {
  return ref > 0 ? (value / ref).toFixed(2) : 'n/a';
}

function main() {
  const activities = loadActivities();
  const runs = mergeRuns(activities, DEFAULTS.runMergeGapMin);
  const aggMap = weeklyAggregates(runs, DEFAULTS);
  const dense: TimelinePoint[] = buildDenseTimeline([...aggMap.values()], []);

  console.log(`${activities.length} activities, ${runs.length} runs after merging, ${dense.length} weeks from ${dense[0]?.weekStart} to ${dense[dense.length - 1]?.weekStart}.\n`);

  const header = ['weekStart', 'km', 'longest', 'LR30', 'R', 'D-wk', 'DW4', 'D-ratio', 'verdict', 'reason'];
  console.log(header.map((h, i) => pad(h, i === header.length - 1 ? 60 : 9)).join(' '));

  let prevKm: number | null = null;

  for (const w of dense) {
    const refs = references({ weekStart: w.weekStart, denseTimeline: dense, actualRuns: runs }, DEFAULTS);
    const effectiveType: WeekType = w.isRaceWeek ? 'RACE' : 'BUILD'; // no plan history to draw a real type from; see report

    const flagList = flags(
      {
        weekType: effectiveType,
        kmWeek: w.kmWeek,
        longestKm: w.longRunKm ?? 0,
        longestLossM: w.longRunLossM ?? 0,
        dminusWeek: w.dminusWeek,
        refs,
        checkin: null,
        priorCheckinsAsc: [],
        prevWeekKm: prevKm,
      },
      DEFAULTS,
    );
    const v = verdict(flagList);

    const row = [
      w.weekStart,
      w.kmWeek.toFixed(1),
      (w.longRunKm ?? 0).toFixed(1),
      refs.LR30.toFixed(1),
      fmtRatio(w.kmWeek, refs.C),
      w.dminusWeek.toFixed(0),
      refs.DW4.toFixed(0),
      fmtRatio(w.longRunLossM ?? 0, refs.D30),
      v.colour,
      v.reason,
    ];
    console.log(row.map((c, i) => pad(String(c), i === row.length - 1 ? 60 : 9)).join(' '));

    prevKm = w.kmWeek;
  }
}

main();
