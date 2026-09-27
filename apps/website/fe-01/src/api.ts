export const apiOrigin = import.meta.env['VITE_API_ORIGIN'] ?? 'http://localhost:3101';

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
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
    throw new ApiFailure(response.status, code);
  }
  // The API response is the trust boundary; callers use the declared route contract.
  return payload as T;
}
