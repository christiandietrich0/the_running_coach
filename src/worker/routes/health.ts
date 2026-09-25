export function handleHealth(): Response {
  return Response.json({ status: 'ok', time: new Date().toISOString() });
}
