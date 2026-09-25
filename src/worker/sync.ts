import type { Env } from './index';
import { getActivityDetail, listActivities, type IntervalsActivity, type IntervalsClientConfig } from './intervals-client';
import { monthChunks, monthsBefore, daysBefore } from './date-utils';
import { getIncludeHikes } from './settings-store';

const BACKFILL_MONTHS = 24;
const INCREMENTAL_DAYS = 21;

// Workers Free plan caps fetch() subrequests at 50 per invocation. Month-chunk
// list calls use most of that budget on a 24-month backfill, so elevation-loss
// detail calls are capped and spread across repeated syncs if needed.
const MAX_SUBREQUESTS = 45;

export type SyncMode = 'backfill' | 'incremental';

export interface SyncResult {
  mode: SyncMode;
  rangeOldest: string;
  rangeNewest: string;
  includeHikes: boolean;
  activitiesFetched: number;
  activitiesStored: number;
  perMonth: Record<string, number>;
  elevationLossBackfilled: number;
  elevationLossStillMissing: number;
}

function storedTypes(includeHikes: boolean): string[] {
  return includeHikes ? ['Run', 'TrailRun', 'Walk', 'Hike'] : ['Run', 'TrailRun'];
}

function requireConfig(env: Env): IntervalsClientConfig {
  if (!env.ICU_API_KEY || !env.ICU_ATHLETE_ID) {
    throw new Error('ICU_API_KEY and ICU_ATHLETE_ID must be set (see .dev.vars locally, Wrangler secrets remotely).');
  }
  return { athleteId: env.ICU_ATHLETE_ID, apiKey: env.ICU_API_KEY };
}

// D1's underlying SQLite caps bound parameters per statement well below the
// hundreds of activity ids a 24-month backfill can produce, so this looks
// them up in chunks rather than one IN (...) with an id per bind param.
const ID_LOOKUP_CHUNK_SIZE = 90;

async function existingLossById(env: Env, ids: string[]): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  if (ids.length === 0) return result;

  for (let i = 0; i < ids.length; i += ID_LOOKUP_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + ID_LOOKUP_CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await env.DB.prepare(`SELECT id, loss_m FROM activities WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .all<{ id: string; loss_m: number | null }>();
    for (const row of rows.results ?? []) {
      result.set(row.id, row.loss_m);
    }
  }

  return result;
}

async function upsertActivities(env: Env, activities: IntervalsActivity[], syncedAt: string): Promise<void> {
  if (activities.length === 0) return;

  const stmt = env.DB.prepare(`
    INSERT INTO activities (id, start_local, type, name, distance_m, moving_s, gain_m, loss_m, race_flag, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      start_local = excluded.start_local,
      type = excluded.type,
      name = excluded.name,
      distance_m = excluded.distance_m,
      moving_s = excluded.moving_s,
      gain_m = excluded.gain_m,
      loss_m = excluded.loss_m,
      race_flag = excluded.race_flag,
      synced_at = excluded.synced_at
  `);

  const statements = activities.map((a) =>
    stmt.bind(
      a.id,
      a.start_date_local,
      a.type,
      a.name ?? null,
      a.distance ?? null,
      a.moving_time ?? null,
      a.total_elevation_gain ?? null,
      a.total_elevation_loss ?? null,
      a.race ? 1 : 0,
      syncedAt,
    ),
  );

  // D1 batch, not fetch(), so it doesn't count against the subrequest cap.
  const BATCH_SIZE = 50;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    await env.DB.batch(statements.slice(i, i + BATCH_SIZE));
  }
}

export async function runSync(env: Env, mode: SyncMode): Promise<SyncResult> {
  const config = requireConfig(env);
  const includeHikes = await getIncludeHikes(env);
  const types = storedTypes(includeHikes);

  const now = new Date();
  const oldest = mode === 'backfill' ? monthsBefore(now, BACKFILL_MONTHS) : daysBefore(now, INCREMENTAL_DAYS);
  const chunks = monthChunks(oldest, now);

  const perMonth: Record<string, number> = {};
  const allActivities: IntervalsActivity[] = [];
  let activitiesFetched = 0;
  let subrequestsUsed = 0;

  for (const chunk of chunks) {
    const list = await listActivities(config, chunk.oldest, chunk.newest);
    subrequestsUsed += 1;
    activitiesFetched += list.length;

    const filtered = list.filter((a) => types.includes(a.type));
    perMonth[chunk.monthKey] = (perMonth[chunk.monthKey] ?? 0) + filtered.length;
    allActivities.push(...filtered);
  }

  // Elevation loss: reuse whatever's already in D1 before spending a
  // detail-call subrequest, so repeated syncs converge instead of refetching.
  const existingLoss = await existingLossById(
    env,
    allActivities.map((a) => a.id),
  );

  let elevationLossBackfilled = 0;
  let elevationLossStillMissing = 0;

  for (const activity of allActivities) {
    if (activity.total_elevation_loss != null) continue;

    const known = existingLoss.get(activity.id);
    if (known != null) {
      activity.total_elevation_loss = known;
      continue;
    }

    if (subrequestsUsed >= MAX_SUBREQUESTS) {
      elevationLossStillMissing += 1;
      continue;
    }

    try {
      const detail = await getActivityDetail(config, activity.id);
      subrequestsUsed += 1;
      if (detail.total_elevation_loss != null) {
        activity.total_elevation_loss = detail.total_elevation_loss;
        elevationLossBackfilled += 1;
      } else {
        elevationLossStillMissing += 1;
      }
    } catch {
      elevationLossStillMissing += 1;
    }
  }

  const syncedAt = now.toISOString();
  await upsertActivities(env, allActivities, syncedAt);

  return {
    mode,
    rangeOldest: chunks[0]?.oldest ?? '',
    rangeNewest: chunks[chunks.length - 1]?.newest ?? '',
    includeHikes,
    activitiesFetched,
    activitiesStored: allActivities.length,
    perMonth,
    elevationLossBackfilled,
    elevationLossStillMissing,
  };
}
