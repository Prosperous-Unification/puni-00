import { InMemoryOidcTransactionStore, InMemoryTokenStore } from '@wbs/auth';
import { afterEach, describe, expect, it } from 'bun:test';
import { errors } from 'jose';

import type { OidcRouteOptions } from './controller/oidc-options';
import {
  BOOTED_INTERNAL_SECRET,
  BOOTED_ORIGIN,
  BootedBrowserProcess,
} from './testing/booted-browser-process';

const opened: BootedBrowserProcess[] = [];

afterEach(async () => {
  for (const be of opened.splice(0)) await be.close();
});

async function boot(
  authority: 'enabled' | 'disabled',
  oidc?: OidcRouteOptions,
): Promise<BootedBrowserProcess> {
  const be = await BootedBrowserProcess.open(authority, oidc);
  opened.push(be);
  return be;
}

function oidcOptions(): OidcRouteOptions {
  return {
    appOrigin: 'https://dev.wbs.test',
    mode: 'oidc',
    now: () => 1,
    passwordLoginEnabled: true,
    random: () => 'r'.repeat(43),
    redirectUri: 'https://dev.wbs.test/api/auth/okta/callback',
    transactions: new InMemoryOidcTransactionStore({ ttlMs: 300_000 }),
    tokens: new InMemoryTokenStore(),
    groupPrefix: 'dev',
    groupsClaim: 'wbs_groups',
    verifier: { verify: () => Promise.reject(new errors.JOSEAlgNotAllowed('not an OIDC token')) },
    client: {
      authorizationUrl: () => Promise.resolve(new URL('https://idp.test/authorize')),
      exchange: () => Promise.resolve({ accessToken: 'a', expiresIn: 60 }),
      refresh: () => Promise.resolve({ accessToken: 'a', expiresIn: 60 }),
      revoke: () => Promise.resolve(),
    },
  };
}

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

async function call(
  be: BootedBrowserProcess,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Answer & { readonly setCookie: string | null }> {
  const response = await be.app.handle(
    new Request(`${BOOTED_ORIGIN}${path}`, {
      method,
      headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: response.headers.get('content-type')?.startsWith('application/json')
      ? (JSON.parse(text) as unknown)
      : text,
    setCookie: response.headers.get('set-cookie'),
  };
}

function bearer(be: BootedBrowserProcess, username: string): Record<string, string> {
  return { authorization: `Bearer ${be.token(username)}`, origin: BOOTED_ORIGIN };
}

function cookies(
  be: BootedBrowserProcess,
  username: string,
  organization: string,
): Record<string, string> {
  return {
    cookie: `__Host-wbs_access=${be.token(username)}; __Host-wbs_organization=${organization}`,
    origin: BOOTED_ORIGIN,
  };
}

/** The selection cookie value `POST /api/organization/active` issued, or a thrown refusal. */
async function select(
  be: BootedBrowserProcess,
  username: string,
  organizationId: string,
): Promise<string> {
  const answer = await call(be, 'POST', '/api/organization/active', bearer(be, username), {
    organizationId,
  });
  const pair = answer.setCookie?.split(';')[0];
  if (answer.status !== 200 || pair === undefined)
    throw new Error(`selection refused: ${JSON.stringify(answer)}`);
  return pair.slice('__Host-wbs_organization='.length);
}

/**
 * One fixed matrix of organization requests before activation, normalized so
 * two processes' ids and clocks compare equal while their decisions differ.
 */
async function preActivationAnswers(authority: 'enabled' | 'disabled'): Promise<Answer[]> {
  const be = await boot(authority);
  await be.register('ada');
  await be.register('grace');
  be.organization('org-a');
  be.member('org-a', 'ada', 'member');
  const created = await call(be, 'POST', '/api/projects', bearer(be, 'ada'), {
    name: 'A plan',
  });
  const projectId = (created.body as { project: { id: string } }).project.id;
  // A syntactically valid selection signed by someone else's key, and a
  // malformed one: before activation neither may change any answer.
  const forged = 'eyJhbGciOiJIUzI1NiJ9.eyJvcmciOiJvcmctYSJ9.c2lnbmF0dXJl';
  const requests: [string, string, Record<string, string>, unknown?][] = [
    ['GET', '/api/projects', bearer(be, 'ada')],
    ['GET', '/api/projects', bearer(be, 'grace')],
    ['GET', '/api/projects', cookies(be, 'ada', forged)],
    ['GET', '/api/projects', cookies(be, 'grace', 'not-a-jwt')],
    ['GET', '/api/tags', cookies(be, 'ada', forged)],
    ['GET', '/api/people', bearer(be, 'grace')],
    ['GET', `/api/projects/${projectId}`, cookies(be, 'grace', forged)],
    ['GET', '/api/organization/memberships', bearer(be, 'ada')],
    ['GET', '/api/organization/memberships', bearer(be, 'grace')],
    ['GET', '/api/organization/memberships', {}],
    ['POST', '/api/organization/active', bearer(be, 'ada'), { organizationId: 'org-a' }],
    ['POST', '/api/organization/active', bearer(be, 'grace'), { organizationId: 'org-a' }],
    [
      'POST',
      `/internal/gateway/projects/${projectId}/browser-access`,
      {
        'x-internal-auth': BOOTED_INTERNAL_SECRET,
        cookie: `__Host-wbs_access=${be.token('grace')}; __Host-wbs_organization=${forged}`,
      },
    ],
  ];
  const observed: Answer[] = [];
  for (const [method, path, headers, body] of requests) {
    const answer = await call(be, method, path, headers, body);
    // Ids, clocks and the cookie name differ per be; the decision does not.
    observed.push({
      status: answer.status,
      body: JSON.parse(
        JSON.stringify(answer.body)
          .replaceAll(projectId, '<project>')
          .replaceAll(be.userId('ada'), '<ada>')
          .replaceAll(be.userId('grace'), '<grace>')
          .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>')
          .replace(/"(createdAt|updatedAt|lastOpenedAt)":\d+/g, '"$1":0'),
      ) as unknown,
    });
  }
  return observed;
}

describe('bootBe01 browser session authority', () => {
  it('keeps the legacy browser composition when disabled', async () => {
    const oidc = oidcOptions();
    const be = await boot('disabled', oidc);

    // Proof: composing the authority regardless of the setting made all three
    // assertions fail (browserSession, browserLifecycle and selection defined).
    expect(be.options.browserSession).toBeUndefined();
    expect(be.options.oidc?.browserLifecycle).toBeUndefined();
    expect(be.options.organizationSelection).toBeUndefined();
    expect(be.options.oidc).toBe(oidc);
  });

  it('shares one durable lifecycle, token store and provider revocation with OIDC when enabled', async () => {
    const oidc = oidcOptions();
    const be = await boot('enabled', oidc);
    const session = be.options.browserSession;
    const mounted = be.options.oidc;

    if (session === undefined || mounted === undefined)
      throw new Error('enabled boot composed no browser session authority');
    expect(session.lifecycle).toBeDefined();
    expect(mounted.browserLifecycle).toBe(session.lifecycle);
    expect(mounted.tokens).toBe(oidc.tokens);
    expect(session.tokens).toBe(oidc.tokens);
    const { revoke } = oidc.client;
    expect(session.revokeProvider).toBe(revoke);
    expect(be.options.organizationSelection).toBeDefined();
    // The lifecycle reaches the database: a refresh without a correlation is
    // the modeled 401, not a composition fault.
    const refresh = await call(be, 'POST', '/api/auth/refresh', {
      origin: 'https://dev.wbs.test',
    });
    expect(refresh.status).toBe(401);
  });

  it('mounts native logout without a refresh lifecycle when enabled without OIDC', async () => {
    const disabled = await boot('disabled');
    const enabled = await boot('enabled');
    await disabled.register('ada');
    await enabled.register('ada');

    expect(enabled.options.browserSession?.lifecycle).toBeUndefined();
    expect((await call(disabled, 'POST', '/api/auth/logout', bearer(disabled, 'ada'))).status).toBe(
      404,
    );
    expect((await call(enabled, 'POST', '/api/auth/logout', bearer(enabled, 'ada'))).status).toBe(
      204,
    );
  });

  it('answers every pre-activation organization request exactly as the disabled composition', async () => {
    const disabled = await preActivationAnswers('disabled');
    const enabled = await preActivationAnswers('enabled');

    expect(enabled).toEqual(disabled);
    // The matrix reaches the legacy decision, not a uniform refusal.
    expect(enabled[0]).toMatchObject({ status: 200 });
    expect(enabled[1]).toEqual(enabled[0]);
    expect(enabled[10]).toEqual({ status: 403, body: { error: 'onboarding_inactive' } });
  });

  it('refuses the whole old token and organization cookie pair once native logout commits', async () => {
    const be = await boot('enabled');
    await be.register('ada');
    be.organization('org-a');
    be.member('org-a', 'ada', 'member');
    be.activate();
    const selection = await select(be, 'ada', 'org-a');
    const pair = cookies(be, 'ada', selection);

    expect((await call(be, 'GET', '/api/projects', pair)).status).toBe(200);
    expect((await call(be, 'POST', '/api/auth/logout', bearer(be, 'ada'))).status).toBe(204);

    expect(await call(be, 'GET', '/api/projects', pair)).toMatchObject({
      status: 403,
      body: { error: 'no_active_organization' },
    });
    expect(await call(be, 'GET', '/api/organization/memberships', bearer(be, 'ada'))).toMatchObject(
      { status: 401, body: { error: 'unauthenticated' } },
    );
    expect(
      await call(be, 'POST', '/api/organization/active', bearer(be, 'ada'), {
        organizationId: 'org-a',
      }),
    ).toMatchObject({ status: 401, body: { error: 'unauthenticated' }, setCookie: null });
  });
});
