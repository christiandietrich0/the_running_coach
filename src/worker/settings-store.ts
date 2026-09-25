import { DEFAULTS } from './defaults';
import type { Env } from './index';

export async function getIncludeHikes(env: Env): Promise<boolean> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
    .bind('includeHikes')
    .first<{ value: string }>();
  if (!row) return DEFAULTS.includeHikes;
  try {
    return JSON.parse(row.value) === true;
  } catch {
    return DEFAULTS.includeHikes;
  }
}
