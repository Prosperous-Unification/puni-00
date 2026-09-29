import { vi } from 'vitest';

/** One canned answer to a request, given the JSON body it sent. */
export type StubAnswer = (body: unknown) => Response;

/** A request the stub received, keyed as `METHOD /path`. */
export interface StubRequest {
  route: string;
  body: unknown;
}

/** A JSON response with the given status. */
export function answerJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** An empty response, for the 204 answers. */
export function answerEmpty(status: number): Response {
  return new Response(null, { status });
}

/**
 * Stubs global `fetch` with one answer queue per `METHOD /path`. Each call
 * takes the next answer and the last one repeats; a route with no queue
 * rejects like an unreachable server. Returns the requests as they arrive.
 */
export function stubServer(routes: Record<string, StubAnswer[]>): StubRequest[] {
  const queues = new Map(Object.entries(routes));
  const sent: StubRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const route = `${init?.method ?? 'GET'} ${new URL(url, 'http://wbs.test').pathname}`;
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      sent.push({ route, body });
      const queue = queues.get(route) ?? [];
      const next = queue.length > 1 ? queue.shift() : queue[0];
      if (next === undefined) return Promise.reject(new Error(`unstubbed ${route}`));
      return Promise.resolve(next(body));
    }),
  );
  return sent;
}
