import { handleHealth } from './routes/health';

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

    // No other /api/* routes exist yet (Phase 2+); fall through to assets
    // so unmatched /api requests still 404 instead of serving index.html.
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {
    // Daily sync cron. Wired up in Phase 2.
  },
} satisfies ExportedHandler<Env>;
