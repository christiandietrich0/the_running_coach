import type { Env } from '../index';
import { buildState } from '../state';

export async function handleState(_request: Request, env: Env): Promise<Response> {
  const state = await buildState(env);
  return Response.json(state);
}
