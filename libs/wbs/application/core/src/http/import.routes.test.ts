import { type AuthenticatedUser, importProject } from '@wbs/contracts';
import { expect, mock, test } from 'bun:test';

import { legacyOrganizationAccess } from '../testing/organization-access-fixture';
import { planDocumentFixture } from '../testing/plan-document-fixture';
import { importRoutes } from './import.routes';

const summary = {
  ok: true as const,
  projectId: 'project-new',
  rows: 2,
  created: {
    teams: ['Billing'],
    people: [],
    tags: ['Urgent'],
    services: [],
    types: [],
    externalSystems: [],
  },
  solutionRef: 'kept' as const,
};

test('binds the import shape and returns its complete created summary', async () => {
  const principal: AuthenticatedUser = {
    id: 'actor',
    username: 'actor',
    scopes: ['read', 'write'],
    authentication: {
      kind: 'consent',
      credentialId: 'credential',
      personId: 'agent',
      issuer: 'https://issuer.test',
      subject: 'subject',
    },
    delegation: {
      organizationId: 'org',
      audience: 'wbs-be-01/via-mcp-01',
      client: 'client',
      grant: 'family',
    },
    organizationBinding: {
      credential: { kind: 'native', userId: 'actor', digest: 'digest', expiresAt: 123 },
      cookie: 'exact-cookie',
    },
  };
  const importPlan = mock(() => Promise.resolve(summary));
  const [endpoint] = importRoutes({ import: importPlan }, legacyOrganizationAccess);
  expect(endpoint.shape).toBe(importProject);

  const response = await endpoint.handle({
    params: {},
    query: undefined,
    body: planDocumentFixture(),
    principal,
    request: {
      url: new URL('https://app.test/api/projects/import'),
      method: 'POST',
      headers: new Headers(),
      signal: new AbortController().signal,
    },
  });

  expect(importPlan).toHaveBeenCalledWith(planDocumentFixture(), {
    kind: 'human',
    principal: {
      ...principal,
      organizationOperation: { kind: 'mutation', expected: { kind: 'absent' } },
    },
    expectedAccess: { kind: 'legacy' },
  });
  expect(response).toEqual({
    ok: true,
    status: 201,
    body: {
      projectId: summary.projectId,
      rows: summary.rows,
      created: summary.created,
      solutionRef: summary.solutionRef,
    },
  });
});

test.each([
  [
    {
      ok: false as const,
      code: 'unknown_ref' as const,
      path: 'workItems[0].dependsOn[0]',
      detail: 'missing',
    },
    400,
  ],
  [
    {
      ok: false as const,
      code: 'engine_unavailable' as const,
      path: 'settings.scheduleEngine',
      detail: 'optimized',
    },
    409,
  ],
  [
    {
      ok: false as const,
      code: 'source_refused' as const,
      path: 'workItems[0]',
      detail: 'unknown_tag',
    },
    409,
  ],
] as const)('maps import refusal %# to its declared wire status', async (outcome, status) => {
  const [endpoint] = importRoutes(
    { import: () => Promise.resolve(outcome) },
    legacyOrganizationAccess,
  );
  const response = await endpoint.handle({
    params: {},
    query: undefined,
    body: planDocumentFixture(),
    principal: { id: 'actor', username: 'actor', scopes: ['write'] },
    request: {
      url: new URL('https://app.test/api/projects/import'),
      method: 'POST',
      headers: new Headers(),
      signal: new AbortController().signal,
    },
  });
  expect(response.status).toBe(status);
  expect(response.body).toEqual({
    error: outcome.code,
    path: outcome.path,
    detail: outcome.detail,
  });
});

test('maps dormant v11 external import to conflict with its declaration path', async () => {
  const [endpoint] = importRoutes(
    {
      import: () =>
        Promise.resolve({
          ok: false as const,
          code: 'external_dependencies_inactive' as const,
          path: 'typedDependencies[0]',
          detail: null,
        }),
    },
    legacyOrganizationAccess,
  );
  const response = await endpoint.handle({
    params: {},
    query: undefined,
    body: planDocumentFixture(),
    principal: { id: 'actor', username: 'actor', scopes: ['write'] },
    request: {
      url: new URL('https://app.test/api/projects/import'),
      method: 'POST',
      headers: new Headers(),
    },
  });
  expect(response).toEqual({
    ok: false,
    status: 409,
    body: { error: 'external_dependencies_inactive', detail: 'typedDependencies[0]' },
  });
});

for (const [outcome, status, body] of [
  [{ ok: false, refusal: 'not_a_member' }, 403, { error: 'not_a_member' }],
  [{ ok: false, refusal: 'no_active_organization' }, 403, { error: 'no_active_organization' }],
  [
    { ok: false, refusal: 'organization_context_changed' },
    409,
    { error: 'organization_context_changed' },
  ],
  [
    { ok: false, refusal: 'sso_required', organizationId: 'org-a', login: '/login', link: true },
    403,
    { error: 'sso_required', organizationId: 'org-a', login: '/login', link: true },
  ],
  [
    {
      ok: false,
      refusal: 'reauthentication_required',
      organizationId: 'org-a',
      reason: 'max_session',
      login: '/reauth',
    },
    403,
    {
      error: 'reauthentication_required',
      organizationId: 'org-a',
      reason: 'max_session',
      login: '/reauth',
    },
  ],
  [{ ok: false, error: 'insufficient_scope' }, 403, { error: 'insufficient_scope' }],
] as const) {
  test(`preserves writer refusal ${body.error}`, async () => {
    const [endpoint] = importRoutes(
      { import: () => Promise.resolve(outcome) },
      legacyOrganizationAccess,
    );
    const reply: unknown = await endpoint.handle({
      params: {},
      query: undefined,
      body: planDocumentFixture(),
      principal: { id: 'actor', username: 'actor', scopes: ['write'] },
      request: {
        url: new URL('https://app.test/api/projects/import'),
        method: 'POST',
        headers: new Headers(),
      },
    });
    expect(reply).toEqual({ ok: false, status, body });
  });
}
