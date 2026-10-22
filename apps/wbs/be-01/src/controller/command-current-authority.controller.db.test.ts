import { createHash } from 'node:crypto';

import { runRecoveryWrite } from '@wbs/core/http/recovery-write';
import { createAdmittedWrites } from '@wbs/core/module/plan-commands/composition';
import { afterEach, describe, expect, test } from 'bun:test';
import { decodeJwt } from 'jose';

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
            instant += 301_000;
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
