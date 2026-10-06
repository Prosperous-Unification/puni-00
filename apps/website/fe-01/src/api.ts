export const apiOrigin = import.meta.env['VITE_API_ORIGIN'] ?? 'http://localhost:3101';

/**
 * A typed API refusal. `retryAfterSeconds` is the `Retry-After` header in whole seconds, or null
 * when the response carried none.
 */
export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfterSeconds: number | null = null,
  ) {
    super(code);
  }
}

function readRetryAfter(response: Response): number | null {
  const header = response.headers.get('retry-after');
  return header !== null && /^\d+$/.test(header) ? Number(header) : null;
}

/** Sends a credentialed request and translates typed API failures into a rendered state. */
export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${apiOrigin}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const code =
      typeof payload === 'object' &&
      payload !== null &&
      'code' in payload &&
      typeof payload.code === 'string'
        ? payload.code
        : `HTTP ${String(response.status)}`;
    throw new ApiFailure(response.status, code, readRetryAfter(response));
  }
  // The API response is the trust boundary; callers use the declared route contract.
  return payload as T;
}

/**
 * Sends a credentialed command whose success is `204 No Content`.
 * @throws ApiFailure for any other status, with the API's typed code when the body carries one.
 */
export async function sendCommand(path: string, init: RequestInit): Promise<void> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${apiOrigin}${path}`, { ...init, credentials: 'include', headers });
  if (response.status === 204) return;
  const payload: unknown = await response.json();
  const code =
    typeof payload === 'object' &&
    payload !== null &&
    'code' in payload &&
    typeof payload.code === 'string'
      ? payload.code
      : `HTTP ${String(response.status)}`;
  throw new ApiFailure(response.status, code, readRetryAfter(response));
}

/**
 * `fetch` for AI SDK stream transports: a non-2xx answer becomes an {@link ApiFailure} with the
 * API's typed code (and its `exhaustedReason` when the body carries one), so a refusal before
 * streaming renders as a modeled state instead of a stream parse error.
 */
export const streamFetch = Object.assign(
  async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const response = await fetch(input, init);
    if (response.ok) return response;
    const payload: unknown = await response.json();
    const code =
      typeof payload === 'object' &&
      payload !== null &&
      'code' in payload &&
      typeof payload.code === 'string'
        ? payload.code
        : `HTTP ${String(response.status)}`;
    throw new ApiFailure(response.status, code, readRetryAfter(response));
  },
  { preconnect: fetch.preconnect },
);
