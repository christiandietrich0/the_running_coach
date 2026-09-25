import { readJson } from '../http';
import type { Env } from '../index';
import { setSettings } from '../settings-store';
import { buildState } from '../state';
import { parseSettingsPatch } from '../validation';

export async function handlePutSettings(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const patchResult = parseSettingsPatch(body.value);
  if (!patchResult.ok) return Response.json({ error: patchResult.error }, { status: 400 });

  await setSettings(env, patchResult.value);

  return Response.json(await buildState(env));
}
