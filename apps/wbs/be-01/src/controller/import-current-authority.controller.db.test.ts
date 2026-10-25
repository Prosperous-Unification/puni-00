import { createHash } from 'node:crypto';

import { ImportedPlanResource } from '@wbs/core/module/plan-import/imported-plan.resource';
import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { decodeJwt } from 'jose';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
let afterResolve: (() => void) | undefined;
let afterWriterAttempt: (() => void) | undefined;
let instant = Date.now();
let refusingObservations = false;
let prematurePushes = 0;
let writerTurns = 0;
let observedCaptures = 0;
let observedPushes = 0;
afterEach(async () => {
  mock.restore();
  await harness.closeComposed();
});

async function openHarness() {
  instant = Date.now();
  afterResolve = undefined;
  afterWriterAttempt = undefined;
  refusingObservations = false;
  prematurePushes = 0;
  writerTurns = 0;
  observedCaptures = 0;
  observedPushes = 0;
  harness = OrganizationHarness.openComposedWith({
    sessionBinding: true,
    now: () => instant,
    afterResolve: () => afterResolve?.(),
    onBorrowedUnitOfWork: () => {
      writerTurns += 1;
      afterWriterAttempt?.();
    },
    onFanoutCapture: () => {
      observedCaptures += 1;
    },
    pushFetch: () => {
      observedPushes += 1;
      if (refusingObservations) prematurePushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    },
  });
  await harness.register('ada');
  for (const id of ['org-a', 'org-b']) {
    harness.organization(id);
    harness.member(id, 'ada', 'super_admin');
  }
  harness.activate();
  const selected = await harness.request('/api/organization/active', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      authorization: `Bearer ${harness.token('ada')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ organizationId: 'org-a' }),
  });
  expect(selected.status).toBe(200);
  const cookie = selected.headers.get('set-cookie')?.split(';')[0];
  if (cookie === undefined) throw new Error('selected cookie is absent');
  const request = (method: string, path: string, body?: unknown) =>
    harness.request(path, {
      method,
      headers: {
        origin: 'http://localhost',
        authorization: `Bearer ${harness.token('ada')}`,
        cookie,
        'X-WBS-Expected-Organization': 'org-a',
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const created = await request('POST', '/api/projects', { name: 'Plan' });
  expect(created.status).toBe(200);
  const project = harness.sqlite.query<{ id: string }, []>('SELECT id FROM project').get();
  if (project === null) throw new Error('fixture project is absent');
  const step = harness.sqlite
    .query<{ id: string }, []>('SELECT id FROM step ORDER BY position LIMIT 1')
    .get();
  if (step === null) throw new Error('fixture step is absent');
  const path = `/api/projects/${project.id}`;
  const commands = [{ kind: 'createWorkItem', parentId: null, afterId: null, name: 'Row' }];
  expect((await request('POST', `${path}/commands`, { commands })).status).toBe(200);
  return { request, path, stepId: step.id, projectId: project.id, cookie };
}

/** Snapshots every application table after the deliberate authority mutation. */
function snapshotTables() {
  const tables = harness.sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  return tables.map(({ name }) => ({
    name,
    rows: harness.sqlite
      .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
      .all()
      .map((row) => JSON.stringify(row))
      .sort(),
  }));
}

const faults = ['revocation', 'expiry', 'membership', 'demotion', 'credential', 'sso'] as const;
const operations = ['mounted', 'direct', 'mounted-external'] as const;

function createExternalDocument() {
  const document = planDocumentFixture();
  document.document.version = 12;
  document.typedDependencies = [
    {
      id: 'external',
      type: 'FS',
      predecessor: {
        kind: 'external',
        scope: 'whole',
        projectId: 'other',
        workItemId: 'remote',
        display: {
          projectName: 'Other',
          abbreviation: 'OTHER',
          workItemName: 'Remote',
          address: 'OTHER.1',
        },
      },
      successor: { kind: 'internal', scope: 'whole', workItem: 'row-1' },
    },
  ];
  // HTTP v12 carries attempts keyed by step; the application fixture stores an array.
  return { ...document, workItems: document.workItems.map((row) => ({ ...row, attempts: {} })) };
}
describe('current import authority on the process writer', () => {
  for (const fault of faults)
    for (const operation of operations) {
      test(`${operation} refuses queued ${fault} before any import effects`, async () => {
        const fixture = await openHarness();
        const cookieValue = decodeURIComponent(
          fixture.cookie.slice(fixture.cookie.indexOf('=') + 1),
        );
        const principal = await harness.authenticatedCommandPrincipal('ada', cookieValue);
        const access = {
          kind: 'scoped' as const,
          scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin' as const },
        };
        let release!: () => void;
        let entered!: () => void;
        const turnEntered = new Promise<void>((resolve) => {
          entered = resolve;
        });
        const held = harness.holdWriteTurn(
          new Promise<void>((resolve) => {
            release = resolve;
          }),
          () => {
            entered();
          },
        );
        await turnEntered;
        let resolved!: () => void;
        const ready = new Promise<void>((resolve) => {
          resolved = resolve;
        });
        afterResolve = () => {
          resolved();
        };
        const attempted = new Promise<void>((resolve) => {
          afterWriterAttempt = resolve;
        });
        const pending =
          operation === 'direct'
            ? harness
                .publicImports()
                .import(planDocumentFixture(), { kind: 'human', principal, expectedAccess: access })
            : fixture.request(
                'POST',
                '/api/projects/import',
                operation === 'mounted-external' ? createExternalDocument() : planDocumentFixture(),
              );
        if (operation !== 'direct') await ready;
        await attempted;
        afterWriterAttempt = undefined;
        afterResolve = undefined;
        try {
          const userId = harness.userId('ada');
          let error = 'no_active_organization';
          if (fault === 'revocation') {
            const claims = decodeJwt(harness.token('ada'));
            harness.sqlite.run(
              'INSERT INTO browser_credential_revocations (kind,user_id,credential_digest,expires_at,revoked_at) VALUES (?,?,?,?,?)',
              [
                'native',
                userId,
                createHash('sha256').update(harness.token('ada')).digest('hex'),
                Number(claims.exp) * 1000,
                instant,
              ],
            );
          } else if (fault === 'expiry') {
            const claims = decodeJwt(harness.token('ada'));
            instant = Number(claims.exp) * 1000 + 1;
          } else if (fault === 'membership') {
            harness.sqlite.run(
              "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id=?",
              [userId],
            );
            error = 'not_a_member';
          } else if (fault === 'demotion') {
            harness.sqlite.run(
              "UPDATE organization_membership SET role='viewer' WHERE organization_id='org-a' AND user_id=?",
              [userId],
            );
            error = 'forbidden';
          } else if (fault === 'sso') {
            harness.sqlite.run(
              "INSERT INTO organization_domain_claim (id,organization_id,domain,status,proof_digest,last_success_at,created_at) VALUES ('claim-a','org-a','acme.test','verified',?,1,1)",
              ['a'.repeat(64)],
            );
            harness.sqlite.run(
              "INSERT INTO organization_sso_connection (id,organization_id,domain_claim_id,auth0_connection,strategy,login_slug,enforced,proven_at,proven_by,created_at) VALUES ('conn-a','org-a','claim-a','acme-saml','samlp','acme',1,2,?,1)",
              [userId],
            );
            error = 'sso_required';
          } else {
            harness.sqlite.run(
              "INSERT INTO organization_session_policy (organization_id,max_session_seconds,reauthenticate_after_seconds,created_at,updated_at) VALUES ('org-a',300,NULL,1,1)",
            );
            instant += 301_000;
            error = 'reauthentication_required';
          }
          const before = snapshotTables();
          const capturesBefore = observedCaptures;
          const pushesBefore = observedPushes;
          refusingObservations = true;
          release();
          await held;
          const response = await pending;
          if (response instanceof Response) {
            expect(response.status).toBe(
              error === 'organization_context_changed' ? 409 : error === 'not_found' ? 404 : 403,
            );
            expect(await response.json()).toEqual(
              fault === 'credential'
                ? {
                    error,
                    organizationId: 'org-a',
                    reason: 'max_session',
                    login: '/api/auth/login?reauthenticate=org-a',
                  }
                : fault === 'sso'
                  ? {
                      error,
                      organizationId: 'org-a',
                      login: '/api/auth/login?organization=acme',
                      link: true,
                    }
                  : { error },
            );
          } else
            expect(response).toMatchObject(
              fault === 'credential'
                ? {
                    ok: false,
                    refusal: error,
                    organizationId: 'org-a',
                    reason: 'max_session',
                    login: '/api/auth/login?reauthenticate=org-a',
                  }
                : fault === 'sso'
                  ? {
                      ok: false,
                      refusal: error,
                      organizationId: 'org-a',
                      login: '/api/auth/login?organization=acme',
                      link: true,
                    }
                  : fault === 'demotion'
                    ? { ok: false, code: error }
                    : { ok: false, refusal: error },
            );
          expect(snapshotTables()).toEqual(before);
          expect(observedCaptures).toBe(capturesBefore);
          expect(observedPushes).toBe(pushesBefore);
          expect(prematurePushes).toBe(0);
        } finally {
          release();
          await held;
        }
      }, 15_000);
    }
});

const credentialFaults = [
  'missing',
  'revoked',
  'person',
  'account',
  'unbound',
  'organization',
  'source',
  'family',
  'direct-consent',
  'no-context',
] as const;

for (const kind of ['machine', 'consent'] as const)
  for (const fault of credentialFaults) {
    if (kind === 'machine' && (fault === 'family' || fault === 'direct-consent')) continue;
    test(`${kind} direct import refuses current credential ${fault} before capture`, async () => {
      await openHarness();
      addAgentPerson(harness.sqlite, 'agent', 'org-a', harness.userId('ada'));
      addAgentPerson(harness.sqlite, 'other-agent', 'org-a', harness.userId('ada'));
      const credential = await issueApiKey(harness.sqlite, {
        organizationId: 'org-a',
        personId: 'agent',
        issuedBy: harness.userId('ada'),
      });
      const authenticated = await harness.authenticatedMachinePrincipal(credential.key);
      const principal =
        kind === 'machine'
          ? authenticated
          : {
              ...authenticated,
              authentication: {
                kind: 'consent' as const,
                credentialId: credential.id,
                personId: 'agent',
                issuer: 'https://issuer.test',
                subject: 'ada',
              },
              delegation: {
                organizationId: 'org-a',
                audience: 'wbs-be-01/via-mcp-01' as const,
                client: 'client',
                grant: 'family',
              },
            };
      if (kind === 'consent')
        harness.sqlite.run(
          "UPDATE machine_credential SET source='mcp_consent',mcp_family_id='family' WHERE id=?",
          [credential.id],
        );
      harness.sqlite.run('PRAGMA ignore_check_constraints = ON');
      switch (fault) {
        case 'missing':
          harness.sqlite.run('DELETE FROM machine_credential_secret WHERE credential_id=?', [
            credential.id,
          ]);
          harness.sqlite.run('DELETE FROM machine_credential WHERE id=?', [credential.id]);
          break;
        case 'revoked':
          harness.sqlite.run('UPDATE machine_credential SET revoked_at=1 WHERE id=?', [
            credential.id,
          ]);
          break;
        case 'person':
          harness.sqlite.run("UPDATE machine_credential SET person_id='other-agent' WHERE id=?", [
            credential.id,
          ]);
          break;
        case 'account':
          await harness.register('other');
          harness.sqlite.run("UPDATE person SET account_id=? WHERE id='agent'", [
            harness.userId('other'),
          ]);
          break;
        case 'unbound':
          harness.sqlite.run("UPDATE person SET account_id=NULL WHERE id='agent'");
          break;
        case 'organization':
          harness.sqlite.run("UPDATE machine_credential SET organization_id='org-b' WHERE id=?", [
            credential.id,
          ]);
          break;
        case 'source':
          harness.sqlite.run('UPDATE machine_credential SET source=? WHERE id=?', [
            kind === 'machine' ? 'mcp_consent' : 'api_key',
            credential.id,
          ]);
          break;
        case 'family':
          harness.sqlite.run("UPDATE machine_credential SET mcp_family_id='other' WHERE id=?", [
            credential.id,
          ]);
          break;
        case 'direct-consent':
          principal.delegation = { organizationId: 'org-a', audience: 'wbs-be-01/direct' };
          break;
        case 'no-context':
          delete principal.delegation;
          break;
      }
      const before = snapshotTables();
      const capturesBefore = observedCaptures;
      const pushesBefore = observedPushes;
      refusingObservations = true;
      expect(
        await harness.publicImports().import(planDocumentFixture(), {
          kind: 'human',
          principal,
          expectedAccess: {
            kind: 'scoped',
            scope: { organizationId: 'org-a', userId: principal.id, role: 'member' },
          },
        }),
      ).toEqual({ ok: false, refusal: 'organization_context_changed' });
      expect(snapshotTables()).toEqual(before);
      expect(observedCaptures).toBe(capturesBefore);
      expect(observedPushes).toBe(pushesBefore);
    });
  }

for (const kind of ['machine', 'consent'] as const)
  for (const operation of ['import'] as const)
    test(`${kind} retained ${operation} refuses revocation while waiting on the writer`, async () => {
      await openHarness();
      addAgentPerson(harness.sqlite, 'agent', 'org-a', harness.userId('ada'));
      const credential = await issueApiKey(harness.sqlite, {
        organizationId: 'org-a',
        personId: 'agent',
        issuedBy: harness.userId('ada'),
      });
      const principal = await harness.authenticatedMachinePrincipal(credential.key);
      if (kind === 'consent') {
        harness.sqlite.run(
          "UPDATE machine_credential SET source='mcp_consent',mcp_family_id='family' WHERE id=?",
          [credential.id],
        );
        principal.authentication = {
          kind: 'consent',
          credentialId: credential.id,
          personId: 'agent',
          issuer: 'https://issuer.test',
          subject: 'ada',
        };
        principal.delegation = {
          organizationId: 'org-a',
          audience: 'wbs-be-01/via-mcp-01',
          client: 'client',
          grant: 'family',
        };
      }
      const access = {
        kind: 'scoped' as const,
        scope: { organizationId: 'org-a', userId: principal.id, role: 'member' as const },
      };
      const imports = harness.publicImports();
      expect(
        await imports.import(planDocumentFixture(), {
          kind: 'human',
          principal,
          expectedAccess: access,
        }),
      ).toMatchObject({
        ok: true,
      });
      let release!: () => void;
      let entered!: () => void;
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const held = harness.holdWriteTurn(
        new Promise<void>((resolve) => {
          release = resolve;
        }),
        entered,
      );
      await ready;
      const attempted = new Promise<void>((resolve) => {
        afterWriterAttempt = resolve;
      });
      const pending = imports.import(planDocumentFixture(), {
        kind: 'human',
        principal,
        expectedAccess: access,
      });
      await attempted;
      afterWriterAttempt = undefined;
      try {
        harness.sqlite.run('UPDATE machine_credential SET revoked_at=1 WHERE id=?', [
          credential.id,
        ]);
        const before = snapshotTables();
        const capturesBefore = observedCaptures;
        const pushesBefore = observedPushes;
        refusingObservations = true;
        release();
        await held;
        expect(await pending).toEqual({ ok: false, refusal: 'organization_context_changed' });
        expect(snapshotTables()).toEqual(before);
        expect(observedCaptures).toBe(capturesBefore);
        expect(observedPushes).toBe(pushesBefore);
        expect(prematurePushes).toBe(0);
      } finally {
        release();
        await held;
      }
    });

for (const fault of ['absent-table', 'unreadable-table', 'source', 'revocation'] as const)
  test(`machine direct import throws on trusted credential ${fault}`, async () => {
    await openHarness();
    addAgentPerson(harness.sqlite, 'agent', 'org-a', harness.userId('ada'));
    const credential = await issueApiKey(harness.sqlite, {
      organizationId: 'org-a',
      personId: 'agent',
      issuedBy: harness.userId('ada'),
    });
    const principal = await harness.authenticatedMachinePrincipal(credential.key);
    harness.sqlite.run('PRAGMA ignore_check_constraints=ON');
    if (fault === 'absent-table')
      harness.sqlite.run('ALTER TABLE machine_credential RENAME TO credential_away');
    else if (fault === 'unreadable-table') {
      harness.sqlite.run('ALTER TABLE machine_credential RENAME TO credential_away');
      harness.sqlite.run('CREATE VIEW machine_credential AS SELECT * FROM missing_credentials');
    } else if (fault === 'source')
      harness.sqlite.run("UPDATE machine_credential SET source='broken'");
    else harness.sqlite.run("UPDATE machine_credential SET revoked_at='broken'");
    const before = snapshotTables();
    const capturesBefore = observedCaptures;
    const pushesBefore = observedPushes;
    const failure = await harness
      .publicImports()
      .import(planDocumentFixture(), {
        kind: 'human',
        principal,
        expectedAccess: {
          kind: 'scoped',
          scope: { organizationId: 'org-a', userId: principal.id, role: 'member' },
        },
      })
      .then(
        () => null,
        (cause: unknown) => cause,
      );
    expect(failure).toBeInstanceOf(Error);
    expect(snapshotTables()).toEqual(before);
    expect(observedCaptures).toBe(capturesBefore);
    expect(observedPushes).toBe(pushesBefore);
  });
test('direct import compares current kind, organization and principal identity with expected context', async () => {
  const fixture = await openHarness();
  const cookieValue = decodeURIComponent(fixture.cookie.slice(fixture.cookie.indexOf('=') + 1));
  const principal = await harness.authenticatedCommandPrincipal('ada', cookieValue);
  for (const expected of [
    { kind: 'legacy' as const },
    {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-b', userId: principal.id, role: 'super_admin' as const },
    },
    {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: 'another-user', role: 'super_admin' as const },
    },
  ]) {
    const before = snapshotTables();
    const capturesBefore = observedCaptures;
    const pushesBefore = observedPushes;
    expect(
      await harness
        .publicImports()
        .import(planDocumentFixture(), { kind: 'human', principal, expectedAccess: expected }),
    ).toEqual({ ok: false, refusal: 'organization_context_changed' });
    expect(snapshotTables()).toEqual(before);
    expect(observedCaptures).toBe(capturesBefore);
    expect(observedPushes).toBe(pushesBefore);
  }
});

test('explicit legacy import refuses after durable activation', async () => {
  await openHarness();
  const before = snapshotTables();
  const capturesBefore = observedCaptures;
  const pushesBefore = observedPushes;
  expect(
    await harness
      .publicImports()
      .import(planDocumentFixture(), { kind: 'legacy', actorId: harness.userId('ada') }),
  ).toEqual({
    ok: false,
    refusal: 'no_active_organization',
  });
  expect(snapshotTables()).toEqual(before);
  expect(observedCaptures).toBe(capturesBefore);
  expect(observedPushes).toBe(pushesBefore);
});

test('missing trusted activation state throws instead of reopening legacy imports', async () => {
  await openHarness();
  harness.sqlite.run('DROP TABLE organization_activation');
  const before = snapshotTables();
  const capturesBefore = observedCaptures;
  const pushesBefore = observedPushes;
  const failure = await harness
    .publicImports()
    .import(planDocumentFixture(), { kind: 'legacy', actorId: harness.userId('ada') })
    .then(
      () => null,
      (cause: unknown) => cause,
    );
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).toContain('organization activation marker is absent');
  expect(snapshotTables()).toEqual(before);
  expect(observedCaptures).toBe(capturesBefore);
  expect(observedPushes).toBe(pushesBefore);
});

test('malformed trusted membership throws before direct import effects', async () => {
  const fixture = await openHarness();
  const cookieValue = decodeURIComponent(fixture.cookie.slice(fixture.cookie.indexOf('=') + 1));
  const principal = await harness.authenticatedCommandPrincipal('ada', cookieValue);
  harness.sqlite.run('PRAGMA ignore_check_constraints = ON');
  harness.sqlite.run("UPDATE organization_membership SET role='broken' WHERE user_id=?", [
    principal.id,
  ]);
  const before = snapshotTables();
  const capturesBefore = observedCaptures;
  const pushesBefore = observedPushes;
  const failure = await harness
    .publicImports()
    .import(planDocumentFixture(), {
      kind: 'human',
      principal,
      expectedAccess: {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin' },
      },
    })
    .then(
      () => null,
      (cause: unknown) => cause,
    );
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).toContain('malformed role');
  expect(snapshotTables()).toEqual(before);
  expect(observedCaptures).toBe(capturesBefore);
  expect(observedPushes).toBe(pushesBefore);
});

test('direct import refuses a scoped expectation while current authority is legacy', async () => {
  harness = OrganizationHarness.openComposedWith({ sessionBinding: true });
  await harness.register('ada');
  const principal = await harness.authenticatedCommandPrincipal('ada', '');
  expect(
    await harness.publicImports().import(planDocumentFixture(), {
      kind: 'human',
      principal,
      expectedAccess: {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin' },
      },
    }),
  ).toEqual({ ok: false, refusal: 'organization_context_changed' });
});

test('mounted machine import refuses revocation queued after request resolution', async () => {
  await openHarness();
  addAgentPerson(harness.sqlite, 'agent', 'org-a', harness.userId('ada'));
  const credential = await issueApiKey(harness.sqlite, {
    organizationId: 'org-a',
    personId: 'agent',
    issuedBy: harness.userId('ada'),
  });
  let release!: () => void;
  let resolved!: () => void;
  let held: Promise<void> | undefined;
  const ready = new Promise<void>((resolve) => {
    resolved = resolve;
  });
  afterResolve = () => {
    afterResolve = undefined;
    held = harness.holdWriteTurn(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
      resolved,
    );
  };
  const pending = harness.callWith(
    credential.key,
    'POST',
    '/api/projects/import',
    planDocumentFixture(),
  );
  await ready;
  try {
    harness.sqlite.run('UPDATE machine_credential SET revoked_at=1 WHERE id=?', [credential.id]);
    const before = snapshotTables();
    const capturesBefore = observedCaptures;
    const pushesBefore = observedPushes;
    refusingObservations = true;
    release();
    await held;
    const response = await pending;
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'organization_context_changed' });
    expect(snapshotTables()).toEqual(before);
    expect(observedCaptures).toBe(capturesBefore);
    expect(observedPushes).toBe(pushesBefore);
    expect(prematurePushes).toBe(0);
  } finally {
    release();
    await held;
  }
}, 15_000);

test('valid mounted import retains the installed production composition', async () => {
  const fixture = await openHarness();
  expect(
    (await fixture.request('POST', '/api/projects/import', planDocumentFixture())).status,
  ).toBe(201);
});

test('direct read scope refuses before writer admission', async () => {
  const fixture = await openHarness();
  const cookie = decodeURIComponent(fixture.cookie.slice(fixture.cookie.indexOf('=') + 1));
  const principal = {
    ...(await harness.authenticatedCommandPrincipal('ada', cookie)),
    scopes: ['read'] as const,
  };
  const before = snapshotTables();
  const capturesBefore = observedCaptures;
  const pushesBefore = observedPushes;
  const turns = writerTurns;
  expect(
    await harness.publicImports().import(planDocumentFixture(), {
      kind: 'human',
      principal,
      expectedAccess: {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin' },
      },
    }),
  ).toEqual({ ok: false, error: 'insufficient_scope' });
  expect(writerTurns).toBe(turns);
  expect(snapshotTables()).toEqual(before);
  expect(observedCaptures).toBe(capturesBefore);
  expect(observedPushes).toBe(pushesBefore);
});

for (const table of [
  'organization_activation',
  'organization_membership',
  'browser_credential_revocations',
  'organization_session_policy',
] as const)
  for (const fault of ['absent', 'unreadable'] as const)
    test(`direct import throws on ${fault} trusted ${table}`, async () => {
      const fixture = await openHarness();
      const cookie = decodeURIComponent(fixture.cookie.slice(fixture.cookie.indexOf('=') + 1));
      const principal = await harness.authenticatedCommandPrincipal('ada', cookie);
      harness.sqlite.run(`ALTER TABLE "${table}" RENAME TO "${table}_away"`);
      if (fault === 'unreadable') {
        if (table === 'organization_activation')
          harness.sqlite.run('CREATE TABLE organization_activation (broken TEXT)');
        else harness.sqlite.run(`CREATE VIEW "${table}" AS SELECT * FROM missing_authority`);
      }
      const before = snapshotTables();
      const capturesBefore = observedCaptures;
      const pushesBefore = observedPushes;
      const captures = observedCaptures;
      const pushes = observedPushes;
      const failure = await harness
        .publicImports()
        .import(planDocumentFixture(), {
          kind: 'human',
          principal,
          expectedAccess: {
            kind: 'scoped',
            scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin' },
          },
        })
        .then(
          () => null,
          (cause: unknown) => cause,
        );
      expect(failure).toBeInstanceOf(Error);
      if (table === 'organization_activation')
        expect(String(failure)).toContain(`organization activation marker is ${fault}`);
      expect(snapshotTables()).toEqual(before);
      expect(observedCaptures).toBe(capturesBefore);
      expect(observedPushes).toBe(pushesBefore);
      expect(observedCaptures).toBe(captures);
      expect(observedPushes).toBe(pushes);
    });

test('machine import uses the persisted member ceiling despite expected super-admin', async () => {
  await openHarness();
  addAgentPerson(harness.sqlite, 'agent', 'org-a', harness.userId('ada'));
  const credential = await issueApiKey(harness.sqlite, {
    organizationId: 'org-a',
    personId: 'agent',
    issuedBy: harness.userId('ada'),
  });
  const principal = await harness.authenticatedMachinePrincipal(credential.key);
  const create = Reflect.get(ImportedPlanResource.prototype, 'createProject');
  const observed: unknown[] = [];
  spyOn(ImportedPlanResource.prototype, 'createProject').mockImplementation(function (
    this: ImportedPlanResource,
    ...args
  ) {
    observed.push(args[3]);
    return create.apply(this, args);
  });
  expect(
    await harness.publicImports().import(planDocumentFixture(), {
      kind: 'human',
      principal,
      expectedAccess: {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin' },
      },
    }),
  ).toMatchObject({ ok: true });
  expect(observed).toEqual([
    {
      kind: 'scoped',
      scope: { organizationId: 'org-a', userId: principal.id, role: 'member', delegated: true },
    },
  ]);
});

test('mounted legacy request queued across activation cannot retain legacy authority', async () => {
  harness = OrganizationHarness.openComposedWith({
    sessionBinding: true,
    afterResolve: () => afterResolve?.(),
    onBorrowedUnitOfWork: () => afterWriterAttempt?.(),
  });
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'super_admin');
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = harness.holdWriteTurn(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
    entered,
  );
  await ready;
  const attempted = new Promise<void>((resolve) => {
    afterWriterAttempt = resolve;
  });
  const pending = harness.call('ada', 'POST', '/api/projects/import', planDocumentFixture());
  await attempted;
  afterWriterAttempt = undefined;
  try {
    harness.activate();
    const before = snapshotTables();
    release();
    await held;
    expect(await pending).toEqual({ status: 403, body: { error: 'no_active_organization' } });
    expect(snapshotTables()).toEqual(before);
  } finally {
    release();
    await held;
  }
});

for (const fault of [
  'activation-row-absent',
  'activation-malformed',
  'policy-malformed',
  'revocation-malformed',
] as const)
  test(`direct import throws on trusted ${fault}`, async () => {
    const fixture = await openHarness();
    const cookie = decodeURIComponent(fixture.cookie.slice(fixture.cookie.indexOf('=') + 1));
    const principal = await harness.authenticatedCommandPrincipal('ada', cookie);
    harness.sqlite.run('PRAGMA ignore_check_constraints=ON');
    if (fault === 'activation-row-absent') {
      harness.sqlite.run('DROP TRIGGER organization_activation_no_delete');
      harness.sqlite.run('DELETE FROM organization_activation');
    } else if (fault === 'activation-malformed') {
      harness.sqlite.run('DROP TRIGGER organization_activation_no_revert');
      harness.sqlite.run("UPDATE organization_activation SET state='broken'");
    } else if (fault === 'policy-malformed')
      harness.sqlite.run(
        "INSERT INTO organization_session_policy (organization_id,max_session_seconds,reauthenticate_after_seconds,created_at,updated_at) VALUES ('org-a','broken',NULL,1,1)",
      );
    else {
      const binding = principal.organizationBinding;
      if (binding === undefined) throw new Error('fixture lost verified credential evidence');
      harness.sqlite.run(
        'INSERT INTO browser_credential_revocations (kind,user_id,credential_digest,expires_at,revoked_at) VALUES (?,?,?,?,?)',
        [
          binding.credential.kind,
          principal.id,
          binding.credential.digest,
          binding.credential.expiresAt,
          'broken',
        ],
      );
    }
    const before = snapshotTables();
    const captures = observedCaptures;
    const pushes = observedPushes;
    const failure = await harness
      .publicImports()
      .import(planDocumentFixture(), {
        kind: 'human',
        principal,
        expectedAccess: {
          kind: 'scoped',
          scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin' },
        },
      })
      .then(
        () => null,
        (cause: unknown) => cause,
      );
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('malformed');
    expect(snapshotTables()).toEqual(before);
    expect(observedCaptures).toBe(captures);
    expect(observedPushes).toBe(pushes);
  });
