import { handleHealth } from './routes/health';
import { handleSync } from './routes/sync';
import { runSync } from './sync';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ICU_API_KEY?: string;
  ICU_ATHLETE_ID?: string;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return handleHealth();
    }

    if (url.pathname === '/api/sync' && request.method === 'POST') {
      return handleSync(request, env);
    }

    // No other /api/* routes exist yet (Phase 4+); fall through to assets
    // so unmatched /api requests still 404 instead of serving index.html.
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runSync(env, 'incremental').then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
