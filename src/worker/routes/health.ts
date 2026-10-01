import type { Env } from '../index';

// workerBuild lets a quick GET (even from a phone browser, no app needed)
// prove whether the deployed *Worker script* actually landed a given
// commit -- separate from the frontend's own __BUILD_VERSION__ stamp,
// which only proves the static assets are current (vite.config.ts's
// buildVersion()). The two are independent build artefacts bundled by
// different tools in the same `wrangler deploy`; a matching frontend
// stamp alone was mistaken for proof the Worker's compiled logic was
// current too (v1.1 review round 10 follow-up, D30/DW4 investigation).
export function handleHealth(env: Env): Response {
  return Response.json({ status: 'ok', time: new Date().toISOString(), workerBuild: env.WORKER_BUILD ?? null });
}
