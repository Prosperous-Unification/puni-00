import { createHash } from 'node:crypto';

import { runRecoveryWrite } from '@wbs/core/http/recovery-write';
import { createAdmittedWrites } from '@wbs/core/module/plan-commands/composition';
import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { decodeJwt } from 'jose';

import { openDatabase } from '../repository/db';
import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
let afterResolve: (() => void) | undefined;
let instant = Date.now();
let refusingObservations = false;
let prematurePushes = 0;
let writerTurns = 0;
let observedCaptures = 0;
let observedPushes = 0;
afterEach(async () => {
  await harness.closeComposed();
});

async function open() {
  instant = Date.now();
  afterResolve = undefined;
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
    },
    onFanoutCapture: () => {
      observedCaptures += 1;
      if (refusingObservations) throw new Error('refused authority reached fan-out capture');
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

/** Includes all command, history, audit and fan-out rows, excluding only the injected authority. */
function effects() {
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

const faults = ['revocation', 'expiry', 'membership', 'demotion', 'credential'] as const;
const operations = [
  'batch',
  'directory',
  'undo',
  'redo',
  'prelude',
  'project',
  'step',
  'step-rename',
  'step-remove',
  'bare-step',
  'direct',
] as const;

describe('current command authority on the process writer', () => {
  for (const fault of faults)
    for (const operation of operations) {
      test(`${operation} refuses queued ${fault} before any command effects`, async () => {
        const fixture = await open();
        if (operation === 'redo')
          expect((await fixture.request('POST', `${fixture.path}/undo`)).status).toBe(200);
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
        const pending = (() => {
          switch (operation) {
            case 'direct':
              return harness.publicCommands().runWithin(fixture.projectId, principal, [], access);
            case 'bare-step':
              return harness.removeBareStep(
                fixture.projectId,
                fixture.stepId,
                principal,
                true,
                access,
              );
            case 'directory':
              return fixture.request('POST', '/api/directory/commands', {
                commands: [{ kind: 'createTeam', name: 'Queued' }],
              });
            case 'undo':
            case 'redo':
              return fixture.request('POST', `${fixture.path}/${operation}`);
            case 'prelude':
              return fixture.request('PATCH', `${fixture.path}/steps/${fixture.stepId}`, {
                name: 'Queued',
                allowancePercent: 10,
              });
            case 'project':
              return fixture.request('PATCH', fixture.path, { startDate: '2026-10-22' });
            case 'step':
              return fixture.request('POST', `${fixture.path}/steps`, { name: 'Queued' });
            case 'step-rename':
              return fixture.request('PATCH', `${fixture.path}/steps/${fixture.stepId}`, {
                name: 'Queued',
              });
            case 'step-remove':
              return fixture.request(
                'DELETE',
                `${fixture.path}/steps/${fixture.stepId}?cascade=true`,
              );
            case 'batch':
              return fixture.request('POST', `${fixture.path}/commands`, {
                commands: [
                  { kind: 'createWorkItem', parentId: null, afterId: null, name: 'Queued' },
                ],
              });
          }
        })();
        if (operation !== 'direct' && operation !== 'bare-step') await ready;
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
          } else {
            harness.sqlite.run(
              "INSERT INTO organization_session_policy (organization_id,max_session_seconds,reauthenticate_after_seconds,created_at,updated_at) VALUES ('org-a',300,NULL,1,1)",
            );
            if (principal.authentication?.kind !== 'first_party')
              throw new Error('credential race requires first-party issuance evidence');
            instant = principal.authentication.issuedAt + 301_000;
            error = 'reauthentication_required';
          }
          const before = effects();
          refusingObservations = true;
          release();
          await held;
          const response = await pending;
          if (response instanceof Response) {
            expect(response.status).toBe(
              error === 'organization_context_changed' ? 409 : error === 'not_found' ? 404 : 403,
            );
            expect(await response.json()).toMatchObject(
              fault === 'credential'
                ? {
                    error,
                    organizationId: 'org-a',
                    reason: 'max_session',
                    login: '/api/auth/login?reauthenticate=org-a',
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
                : operation === 'bare-step' && fault === 'demotion'
                  ? { ok: false, reason: error }
                  : { ok: false, refusal: error },
            );
          expect(effects()).toEqual(before);
          expect(prematurePushes).toBe(0);
        } finally {
          release();
          await held;
        }
      }, 15_000);
    }
});

test('direct runner compares current kind, organization and principal identity with expected context', async () => {
  const fixture = await open();
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
    const before = effects();
    expect(
      await harness.publicCommands().runWithin(fixture.projectId, principal, [], expected),
    ).toEqual({ ok: false, refusal: 'organization_context_changed' });
    expect(effects()).toEqual(before);
  }
});

test('explicit legacy runner refuses after durable activation', async () => {
  const fixture = await open();
  const before = effects();
  expect(await harness.publicCommands().run(fixture.projectId, harness.userId('ada'), [])).toEqual({
    ok: false,
    refusal: 'no_active_organization',
  });
  expect(effects()).toEqual(before);
});

test('missing trusted activation state throws instead of reopening legacy commands', async () => {
  const fixture = await open();
  harness.sqlite.run('DROP TABLE organization_activation');
  const before = effects();
  const failure = await harness
    .publicCommands()
    .run(fixture.projectId, harness.userId('ada'), [])
    .then(
      () => null,
      (cause: unknown) => cause,
    );
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).toContain('organization activation marker is absent');
  expect(effects()).toEqual(before);
});

test('malformed trusted membership throws before direct command effects', async () => {
  const fixture = await open();
  const cookieValue = decodeURIComponent(fixture.cookie.slice(fixture.cookie.indexOf('=') + 1));
  const principal = await harness.authenticatedCommandPrincipal('ada', cookieValue);
  harness.sqlite.run('PRAGMA ignore_check_constraints = ON');
  harness.sqlite.run("UPDATE organization_membership SET role='broken' WHERE user_id=?", [
    principal.id,
  ]);
  const before = effects();
  const failure = await harness
    .publicCommands()
    .runWithin(fixture.projectId, principal, [], {
      kind: 'scoped',
      scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin' },
    })
    .then(
      () => null,
      (cause: unknown) => cause,
    );
  expect(failure).toBeInstanceOf(Error);
  expect(String(failure)).toContain('malformed role');
  expect(effects()).toEqual(before);
});

test('direct runner refuses a scoped expectation while current authority is legacy', async () => {
  harness = OrganizationHarness.openComposedWith({ sessionBinding: true });
  await harness.register('ada');
  const principal = await harness.authenticatedCommandPrincipal('ada', '');
  expect(
    await harness.publicCommands().runDirectoryWithin(principal, [], {
      kind: 'scoped',
      scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin' },
    }),
  ).toEqual({ ok: false, refusal: 'organization_context_changed' });
});

test('direct authenticated runner entries refuse read-only principals before opening any write graph', async () => {
  const fixture = await open();
  const cookieValue = decodeURIComponent(fixture.cookie.slice(fixture.cookie.indexOf('=') + 1));
  const principal = {
    ...(await harness.authenticatedCommandPrincipal('ada', cookieValue)),
    scopes: ['read'] as const,
  };
  const access = {
    kind: 'scoped' as const,
    scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin' as const },
  };
  const runner = harness.publicCommands();
  const before = effects();
  for (const pending of [
    runner.runWithin(fixture.projectId, principal, [], access),
    runner.runDirectoryWithin(principal, [], access),
    runner.runAfterWithin(
      fixture.projectId,
      principal,
      () => {
        throw new Error('read-only prelude was reached');
      },
      [],
      access,
    ),
    runner.undoWithin(fixture.projectId, principal, access),
    runner.redoWithin(fixture.projectId, principal, access),
  ])
    expect(await pending).toEqual({ ok: false, error: 'insufficient_scope' });
  expect(effects()).toEqual(before);
});

for (const operation of ['project update', 'bare step removal', 'recovery write'] as const) {
  test(`direct ${operation} refuses read-only scope before opening its SQLite UoW`, async () => {
    const fixture = await open();
    const cookieValue = decodeURIComponent(fixture.cookie.slice(fixture.cookie.indexOf('=') + 1));
    const principal = {
      ...(await harness.authenticatedCommandPrincipal('ada', cookieValue)),
      scopes: ['read'] as const,
    };
    const access = {
      kind: 'scoped' as const,
      scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin' as const },
    };
    if (operation !== 'bare step removal') {
      await harness.register('owner');
      harness.member('org-a', 'owner', 'member');
      harness.sqlite.run('UPDATE project SET owner_id=?, restricted=1 WHERE id=?', [
        harness.userId('owner'),
        fixture.projectId,
      ]);
    }
    const boundary = harness.publicWrites();
    const before = effects();
    const turnsBefore = writerTurns;
    const capturesBefore = observedCaptures;
    const pushesBefore = observedPushes;
    const outcome =
      operation === 'project update'
        ? await createAdmittedWrites(boundary).updateProjectWithin(
            fixture.projectId,
            principal,
            { name: 'Must not write' },
            access,
          )
        : operation === 'bare step removal'
          ? await harness.removeBareStep(fixture.projectId, fixture.stepId, principal, true, access)
          : await runRecoveryWrite(
              boundary,
              access,
              fixture.projectId,
              principal,
              { step: 'remove' },
              (services, freshAccess) =>
                services.steps.removeWithin(
                  fixture.projectId,
                  fixture.stepId,
                  principal.id,
                  true,
                  freshAccess,
                ),
              (reason) => ({ ok: false, reason }),
            );
    expect(outcome).toEqual({ ok: false, error: 'insufficient_scope' });
    expect(writerTurns).toBe(turnsBefore);
    expect(observedCaptures).toBe(capturesBefore);
    expect(observedPushes).toBe(pushesBefore);
    expect(effects()).toEqual(before);
    expect(
      harness.sqlite.query('SELECT id FROM step WHERE id=?').get(fixture.stepId),
    ).not.toBeNull();
  });
}

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
    test(`${kind} direct runner refuses current credential ${fault} before capture`, async () => {
      const fixture = await open();
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
      const before = effects();
      refusingObservations = true;
      expect(
        await harness.publicCommands().runWithin(fixture.projectId, principal, [], {
          kind: 'scoped',
          scope: { organizationId: 'org-a', userId: principal.id, role: 'member' },
        }),
      ).toEqual({ ok: false, refusal: 'organization_context_changed' });
      expect(effects()).toEqual(before);
    });
  }

for (const operation of [
  'batch',
  'directory',
  'undo',
  'redo',
  'prelude',
  'ordinary',
  'recovery',
] as const)
  test(`machine ${operation} refuses revocation queued after request resolution`, async () => {
    const fixture = await open();
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
      operation === 'prelude' || operation === 'ordinary'
        ? 'PATCH'
        : operation === 'recovery'
          ? 'DELETE'
          : 'POST',
      operation === 'directory'
        ? '/api/directory/commands'
        : operation === 'prelude'
          ? `${fixture.path}/steps/${fixture.stepId}`
          : operation === 'ordinary'
            ? fixture.path
            : operation === 'recovery'
              ? `${fixture.path}/steps/${fixture.stepId}?cascade=true`
              : `${fixture.path}/${operation === 'batch' ? 'commands' : operation}`,
      operation === 'batch'
        ? { commands: [{ kind: 'createWorkItem', parentId: null, name: 'Queued' }] }
        : operation === 'directory'
          ? { commands: [{ kind: 'createTeam', name: 'Queued' }] }
          : operation === 'prelude'
            ? { name: 'Queued', allowancePercent: 10 }
            : operation === 'ordinary'
              ? { name: 'Queued' }
              : undefined,
    );
    await ready;
    try {
      harness.sqlite.run('UPDATE machine_credential SET revoked_at=1 WHERE id=?', [credential.id]);
      const before = effects();
      refusingObservations = true;
      release();
      await held;
      const response = await pending;
      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'organization_context_changed' });
      expect(effects()).toEqual(before);
      expect(prematurePushes).toBe(0);
    } finally {
      release();
      await held;
    }
  }, 15_000);

for (const kind of ['machine', 'consent'] as const)
  for (const operation of ['batch', 'directory', 'undo', 'redo', 'prelude'] as const)
    test(`${kind} retained ${operation} refuses revocation while waiting on the writer`, async () => {
      const fixture = await open();
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
      const runner = harness.publicCommands();
      expect(await runner.runWithin(fixture.projectId, principal, [], access)).toMatchObject({
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
      const pending =
        operation === 'directory'
          ? runner.runDirectoryWithin(principal, [], access)
          : operation === 'undo'
            ? runner.undoWithin(fixture.projectId, principal, access)
            : operation === 'redo'
              ? runner.redoWithin(fixture.projectId, principal, access)
              : operation === 'prelude'
                ? runner.runAfterWithin(
                    fixture.projectId,
                    principal,
                    () => {
                      throw new Error('revoked credential reached prelude');
                    },
                    [],
                    access,
                  )
                : runner.runWithin(fixture.projectId, principal, [], access);
      try {
        harness.sqlite.run('UPDATE machine_credential SET revoked_at=1 WHERE id=?', [
          credential.id,
        ]);
        const before = effects();
        refusingObservations = true;
        release();
        await held;
        expect(await pending).toEqual({ ok: false, refusal: 'organization_context_changed' });
        expect(effects()).toEqual(before);
        expect(prematurePushes).toBe(0);
      } finally {
        release();
        await held;
      }
    });

for (const fault of ['absent-table', 'unreadable-table', 'source', 'revocation'] as const)
  test(`machine direct runner throws on trusted credential ${fault}`, async () => {
    const fixture = await open();
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
    const before = effects();
    const failure = await harness
      .publicCommands()
      .runWithin(fixture.projectId, principal, [], {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: principal.id, role: 'member' },
      })
      .then(
        () => null,
        (cause: unknown) => cause,
      );
    expect(failure).toBeInstanceOf(Error);
    expect(effects()).toEqual(before);
  });

for (const fault of ['membership', 'revocation'] as const)
  test(`qualified address lookup then queued external command refuses current ${fault}`, async () => {
    const fixture = await open();
    expect(
      (await fixture.request('POST', '/api/projects', { name: 'Remote', abbreviation: 'REMOTE' }))
        .status,
    ).toBe(200);
    const remote = harness.sqlite
      .query<{ id: string }, []>("SELECT id FROM project WHERE name='Remote'")
      .get();
    if (remote === null) throw new Error('remote project absent');
    expect(
      (
        await fixture.request('POST', `/api/projects/${remote.id}/commands`, {
          commands: [{ kind: 'createWorkItem', name: 'Prerequisite' }],
        })
      ).status,
    ).toBe(200);
    const candidates = await fixture.request(
      'GET',
      `/api/projects/${remote.id}/address-candidates`,
    );
    expect(candidates.status).toBe(200);
    const page = (await candidates.json()) as { addressRevision: string };
    const lookup = await fixture.request(
      'GET',
      `/api/projects/${remote.id}/address-references?reference=REMOTE.010&revision=${page.addressRevision}`,
    );
    expect(lookup.status).toBe(200);
    const resolved = (await lookup.json()) as {
      projectId: string;
      endpoint: { scope: 'whole'; workItemId: string };
    };
    const successor = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE project_id=?')
      .get(fixture.projectId);
    if (successor === null) throw new Error('successor absent');
    const command = {
      kind: 'addTypedDependency',
      predecessor: { projectId: resolved.projectId, ...resolved.endpoint },
      successor: { scope: 'whole', workItemId: successor.id },
      type: 'FS',
    };
    const baseline = await fixture.request('POST', `${fixture.path}/commands`, {
      commands: [command],
    });
    expect(baseline.status).toBe(409);
    expect(await baseline.json()).toMatchObject({ error: 'external_dependencies_inactive' });
    let release!: () => void;
    let entered!: () => void;
    const admitted = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = harness.holdWriteTurn(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
      entered,
    );
    await admitted;
    let authenticated!: () => void;
    const ready = new Promise<void>((resolve) => {
      authenticated = resolve;
    });
    let enqueued!: () => void;
    const queued = new Promise<void>((resolve) => {
      enqueued = resolve;
    });
    const descriptor = Object.getOwnPropertyDescriptor(WriteCoordinator.prototype, 'enter');
    if (descriptor === undefined) throw new Error('writer admission method missing');
    const enter = descriptor.value as WriteCoordinator['enter'];
    const queue = spyOn(WriteCoordinator.prototype, 'enter').mockImplementation(function <T>(
      this: WriteCoordinator,
      work: () => Promise<T>,
    ): Promise<T> {
      const pending = enter.call(this, work) as Promise<T>;
      enqueued();
      return pending;
    });
    afterResolve = authenticated;
    const pending = fixture.request('POST', `${fixture.path}/commands`, { commands: [command] });
    await ready;
    await queued;
    queue.mockRestore();
    afterResolve = undefined;
    const separate = openDatabase(harness.databasePath());
    expect(separate.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get()).toEqual({
      foreign_keys: 1,
    });
    try {
      const userId = harness.userId('ada');
      if (fault === 'membership')
        separate
          .query("DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id=?")
          .run(userId);
      else {
        const claims = decodeJwt(harness.token('ada'));
        separate
          .query(
            'INSERT INTO browser_credential_revocations (kind,user_id,credential_digest,expires_at,revoked_at) VALUES (?,?,?,?,?)',
          )
          .run(
            'native',
            userId,
            createHash('sha256').update(harness.token('ada')).digest('hex'),
            Number(claims.exp) * 1000,
            instant,
          );
      }
      const before = effects();
      const captures = observedCaptures;
      const pushes = observedPushes;
      refusingObservations = true;
      release();
      await held;
      const response = await pending;
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: fault === 'membership' ? 'not_a_member' : 'no_active_organization',
      });
      expect(effects()).toEqual(before);
      expect(observedCaptures).toBe(captures);
      expect(observedPushes).toBe(pushes);
      refusingObservations = false;
      if (fault === 'membership')
        separate
          .query(
            "INSERT INTO organization_membership (organization_id,user_id,role,created_at) VALUES ('org-a',?,'super_admin',1)",
          )
          .run(userId);
      else separate.query('DELETE FROM browser_credential_revocations WHERE user_id=?').run(userId);
      const restored = await fixture.request('POST', `${fixture.path}/commands`, {
        commands: [command],
      });
      expect(restored.status).toBe(409);
      expect(await restored.json()).toMatchObject({ error: 'external_dependencies_inactive' });
    } finally {
      release();
      await held;
      separate.close();
    }
  }, 15_000);
