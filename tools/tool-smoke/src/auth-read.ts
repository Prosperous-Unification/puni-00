import { APP_NAME, PORT } from '@tools/deploy-contract';
import { SignJWT } from 'jose';

import { resolveColor } from './color';

const TIMEOUT_MS = 3000;

/**
 * One authenticated-read check. `skipped` exists only for the signed-in
 * reads, which need an operator-chosen account (`SMOKE_READ_USER_ID`,
 * `SMOKE_READ_USERNAME`); it is printed, never counted as a pass by an
 * operator reading `ok`.
 */
export type ReadCheck =
  | { readonly name: string; readonly kind: 'ok' }
  | { readonly name: string; readonly kind: 'fail'; readonly detail: string }
  | { readonly name: string; readonly kind: 'skipped'; readonly reason: string };

/** The account the signed-in reads act as, or why they cannot run. */
export type ReadIdentity =
  | {
      readonly kind: 'account';
      readonly id: string;
      readonly username: string;
      readonly key: string;
    }
  | { readonly kind: 'unconfigured'; readonly reason: string };

/**
 * be-01's API base on the deploy network. `SMOKE_API_URL` (set per tier colour
 * by `tool-deploy`'s `buildSmokeCommand`) wins; otherwise `SMOKE_COLOR` names
 * the colour, and neither set throws (`resolveColor`).
 */
export function resolveApiBase(env: NodeJS.ProcessEnv = process.env): string {
  return env['SMOKE_API_URL'] ?? `http://${APP_NAME.be}-${resolveColor(env)}:${String(PORT.be)}`;
}

/**
 * The signed-in read account. Both identity keys absent is the modeled
 * "not configured" state; one without the other, or either without the
 * signing key the session must be minted with, is a broken configuration and
 * throws.
 */
export function resolveReadIdentity(env: NodeJS.ProcessEnv = process.env): ReadIdentity {
  const id = env['SMOKE_READ_USER_ID'] ?? '';
  const username = env['SMOKE_READ_USERNAME'] ?? '';
  if (id === '' && username === '') {
    return {
      kind: 'unconfigured',
      reason: 'SMOKE_READ_USER_ID and SMOKE_READ_USERNAME are unset (docs/runbook-prod-deploy.md)',
    };
  }
  if (id === '' || username === '') {
    throw new Error('SMOKE_READ_USER_ID and SMOKE_READ_USERNAME must be set together');
  }
  const key = env['JWT_SIGNING_KEY_CURRENT'] ?? '';
  if (key === '') {
    throw new Error('JWT_SIGNING_KEY_CURRENT must be set to mint the signed-in read session');
  }
  return { kind: 'account', id, username, key };
}

/** A be-01 password-session token for `identity`, as `joseTokenCodec` signs one. */
export async function mintSession(
  identity: Extract<ReadIdentity, { kind: 'account' }>,
): Promise<string> {
  return await new SignJWT({ username: identity.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity.id)
    .setIssuedAt()
    .setExpirationTime('1m')
    .sign(new TextEncoder().encode(identity.key));
}

async function fetchJson(
  url: string,
  cookie: string | null,
  fetchImpl: typeof fetch,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: cookie === null ? {} : { cookie: `__Host-wbs_access=${cookie}` },
      signal: controller.signal,
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      // A non-JSON body is kept as text; the caller reports it as the failure.
      body = text;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function responseSummary(status: number, body: unknown): string {
  return `HTTP ${String(status)} ${JSON.stringify(body).slice(0, 200)}`;
}

/**
 * Runs the read checks against be-01, in order, each settling to one
 * {@link ReadCheck}; a thrown fetch is that check's failure, not the suite's.
 *
 * - signed-out probe: `GET /api/auth/me` without a credential answers
 *   `200 {"user":null}`;
 * - anonymous read refused: `GET /api/projects` without a credential is 401;
 * - signed-in reads: with {@link ReadIdentity} configured, `/api/auth/me`
 *   names that account and `/api/projects` answers `200 {projects: [...]}`.
 */
export async function runReadChecks(
  apiBase: string,
  identity: ReadIdentity,
  fetchImpl: typeof fetch = fetch,
): Promise<ReadCheck[]> {
  const checks: ReadCheck[] = [];
  const attempt = async (name: string, check: () => Promise<string | null>) => {
    try {
      const failure = await check();
      checks.push(
        failure === null ? { name, kind: 'ok' } : { name, kind: 'fail', detail: failure },
      );
    } catch (error: unknown) {
      checks.push({
        name,
        kind: 'fail',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  await attempt('signed-out /api/auth/me', async () => {
    const { status, body } = await fetchJson(`${apiBase}/api/auth/me`, null, fetchImpl);
    const signedOut =
      status === 200 &&
      body !== null &&
      typeof body === 'object' &&
      Reflect.get(body, 'user') === null;
    return signedOut ? null : responseSummary(status, body);
  });
  // Proof: accepting any status here made `fails when projects are readable
  // anonymously` in auth-read.test.ts fail (8 pass, 1 fail, 2026-09-29).
  await attempt('anonymous /api/projects refused', async () => {
    const { status, body } = await fetchJson(`${apiBase}/api/projects`, null, fetchImpl);
    return status === 401 ? null : responseSummary(status, body);
  });

  if (identity.kind === 'unconfigured') {
    for (const name of ['signed-in /api/auth/me', 'signed-in /api/projects']) {
      checks.push({ name, kind: 'skipped', reason: identity.reason });
    }
    return checks;
  }
  const session = await mintSession(identity);
  await attempt('signed-in /api/auth/me', async () => {
    const { status, body } = await fetchJson(`${apiBase}/api/auth/me`, session, fetchImpl);
    const user: unknown =
      body !== null && typeof body === 'object' ? Reflect.get(body, 'user') : undefined;
    // Proof: dropping the id comparison made `fails when the session
    // resolves to a different account` fail (8 pass, 1 fail, 2026-09-29).
    const named =
      status === 200 &&
      user !== null &&
      typeof user === 'object' &&
      Reflect.get(user, 'id') === identity.id;
    return named ? null : responseSummary(status, body);
  });
  await attempt('signed-in /api/projects', async () => {
    const { status, body } = await fetchJson(`${apiBase}/api/projects`, session, fetchImpl);
    const listed =
      status === 200 &&
      body !== null &&
      typeof body === 'object' &&
      Array.isArray(Reflect.get(body, 'projects'));
    return listed ? null : responseSummary(status, body);
  });
  return checks;
}

/**
 * The read suite for `main.ts`: prints every check, including skipped ones,
 * and passes when none failed.
 */
export async function runAuthReadSuite(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const checks = await runReadChecks(resolveApiBase(env), resolveReadIdentity(env));
  for (const check of checks) {
    const suffix =
      check.kind === 'fail'
        ? ` — ${check.detail}`
        : check.kind === 'skipped'
          ? ` — ${check.reason}`
          : '';
    console.log(
      `[smoke/read] ${check.kind === 'ok' ? 'ok' : check.kind.toUpperCase()} ${check.name}${suffix}`,
    );
  }
  return checks.every((check) => check.kind !== 'fail');
}
