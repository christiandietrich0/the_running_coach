import { DEFAULTS, type Defaults } from './defaults';
import type { Env } from './index';

const KEYS = Object.keys(DEFAULTS) as (keyof Defaults)[];

// Every threshold is a setting (mechanics brief section 1): each top-level
// Defaults field is one row in the settings table (key, JSON value). A
// missing row falls back to the default, and a row that fails to parse
// (or was never written) is silently ignored rather than crashing the
// logic module -- a bad settings row should never take the app down.
export async function getSettings(env: Env): Promise<Defaults> {
  const rows = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const overrides = new Map((rows.results ?? []).map((r) => [r.key, r.value]));

  const settings = { ...DEFAULTS };
  for (const key of KEYS) {
    const raw = overrides.get(key);
    if (raw == null) continue;
    try {
      (settings as Record<string, unknown>)[key] = JSON.parse(raw);
    } catch {
      // keep the default for this key
    }
  }
  return settings;
}

export async function setSettings(env: Env, updates: Partial<Defaults>): Promise<void> {
  const entries = Object.entries(updates);
  if (entries.length === 0) return;

  const statements = entries.map(([key, value]) =>
    env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(
      key,
      JSON.stringify(value),
    ),
  );
  await env.DB.batch(statements);
}

export async function getIncludeHikes(env: Env): Promise<boolean> {
  return (await getSettings(env)).includeHikes;
}
