import { handleListActivities, handlePutActivityOverride } from './routes/activities';
import { handlePutCheckin } from './routes/checkin';
import { handleHealth } from './routes/health';
import { handlePutPlanWeek, handleSuggestPlan } from './routes/plan';
import { handleDeleteRace, handlePutRace } from './routes/races';
import { handlePutSettings } from './routes/settings';
import { handleState } from './routes/state';
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
    const { pathname } = url;
    const { method } = request;

    if (pathname === '/api/health') return handleHealth();
    if (pathname === '/api/sync' && method === 'POST') return handleSync(request, env);
    if (pathname === '/api/state' && method === 'GET') return handleState(request, env);
    if (pathname === '/api/settings' && method === 'PUT') return handlePutSettings(request, env);
    if (pathname === '/api/plan/suggest' && method === 'POST') return handleSuggestPlan(request, env);
    if (pathname === '/api/activities' && method === 'GET') return handleListActivities(request, env);

    let match = pathname.match(/^\/api\/plan\/([^/]+)$/);
    if (match && method === 'PUT') return handlePutPlanWeek(request, env, decodeURIComponent(match[1]));

    match = pathname.match(/^\/api\/races\/([^/]+)$/);
    if (match) {
      if (method === 'PUT') return handlePutRace(request, env, decodeURIComponent(match[1]));
      if (method === 'DELETE') return handleDeleteRace(request, env, decodeURIComponent(match[1]));
    }

    match = pathname.match(/^\/api\/checkin\/([^/]+)$/);
    if (match && method === 'PUT') return handlePutCheckin(request, env, decodeURIComponent(match[1]));

    match = pathname.match(/^\/api\/activities\/([^/]+)\/override$/);
    if (match && method === 'PUT') return handlePutActivityOverride(request, env, decodeURIComponent(match[1]));

    // No other /api/* routes exist; fall through to assets so unmatched
    // /api requests still 404 instead of serving index.html.
    if (pathname.startsWith('/api/')) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runSync(env, 'incremental').then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
