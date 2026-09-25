import type { Env } from '../index';
import { runSync, type SyncMode } from '../sync';

export async function handleSync(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const modeParam = url.searchParams.get('mode');
  const mode: SyncMode = modeParam === 'backfill' ? 'backfill' : 'incremental';

  try {
    const result = await runSync(env, mode);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}
