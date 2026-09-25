export async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, response: Response.json({ error: 'body must be valid JSON' }, { status: 400 }) };
  }
}
