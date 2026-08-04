export interface SessionUser {
  id: string;
  username: string;
}

export interface Session {
  token: string;
  user: SessionUser;
}

const STORAGE_KEY = 'wbs.session';

/**
 * Same-origin paths, never an absolute URL. The edge serves the app and
 * proxies `/api/*` and `/ws` on the same host, so a configured base URL would
 * be a second source of truth that is wrong on exactly one environment. It
 * also means dev's basic auth is already satisfied: the browser attaches the
 * credential it used to load the page to these requests too.
 */
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    // The server's own error code is surfaced rather than a generic message:
    // "taken" and "invalid_credentials" need different words in the UI.
    let code = `http_${String(res.status)}`;
    try {
      code = (JSON.parse(text) as { error?: string }).error ?? code;
    } catch {
      // Non-JSON body (a proxy error page, say) — keep the status code.
    }
    throw new Error(code);
  }
  return JSON.parse(text) as T;
}

export const register = (username: string, password: string): Promise<Session> =>
  post<Session>('/api/auth/register', { username, password });

export const login = (username: string, password: string): Promise<Session> =>
  post<Session>('/api/auth/login', { username, password });

/** Proves a stored token is still valid, and returns who it belongs to. */
export async function me(token: string): Promise<SessionUser | null> {
  // `x-wbs-token`, never `Authorization`. Dev's edge requires an
  // `Authorization: Basic` credential on /api, and a Bearer header from here
  // would overwrite the one the browser attaches — turning every authenticated
  // request into a 401 from Caddy that looks like an expired app token.
  const res = await fetch('/api/auth/me', { headers: { 'x-wbs-token': token } });
  if (!res.ok) return null;
  return ((await res.json()) as { user: SessionUser }).user;
}

export function loadSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  if (session === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

/**
 * The gateway takes the token in the query string, not a header: a browser
 * cannot set Authorization on a WebSocket handshake. That is also why the
 * edge exempts `/ws` from basic auth — gw-01 rejects a missing or invalid
 * token itself.
 */
export function websocketUrl(token: string): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws?token=${encodeURIComponent(token)}`;
}
