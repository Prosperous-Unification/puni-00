export function requireInternalAuth(request: Request, secret: string): Response | null {
  if (request.headers.get('x-internal-auth') !== secret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  return null;
}
