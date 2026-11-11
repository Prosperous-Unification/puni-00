import type { CredentialAuthentication } from '@wbs/contracts';
import { type Connection, type Drizzle, openConnection } from '@wbs/store-sqlite/db';
import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import { SqliteOrganizationAccess } from '@wbs/store-sqlite/organization-access';
import { SessionPolicyRepository } from '@wbs/store-sqlite/session-policy';
import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';

import {
  addAgentPerson,
  grantCredential,
  issueApiKey,
} from '../testing/machine-credential-fixture';
import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
const ownedConnections: Connection[] = [];

beforeEach(async () => {
  harness = OrganizationHarness.open();
  for (const username of ['security', 'role-only']) await harness.register(username);
  harness.organization('org-a');
  harness.member('org-a', 'security', 'viewer');
  harness.grantPermissions('org-a', 'security', ['organization.manage_security']);
  harness.member('org-a', 'role-only', 'super_admin', ['project-contributor']);
  harness.bind('security', 'org-a');
  harness.bind('role-only', 'org-a');
  harness.activate();
});

afterEach(() => {
  for (const connection of ownedConnections.splice(0).reverse()) connection.close();
  harness.close();
});

const policy = { maxSessionSeconds: 28_800, reauthenticateAfterSeconds: 3_600 };

for (const method of ['GET', 'PUT'] as const) {
  it(
    'uses a minimal security grant instead of a viewer role for session-policy ' + method,
    async () => {
      expect(
        await harness.call(
          'security',
          method,
          '/api/organization/session-policy',
          method === 'GET' ? undefined : policy,
        ),
      ).toEqual({ status: 200, body: { policy: method === 'GET' ? null : policy } });
      if (method === 'PUT')
        expect(
          harness.sqlite.query('SELECT max_session_seconds FROM organization_session_policy').all(),
        ).toEqual([{ max_session_seconds: 28_800 }]);
    },
  );

  it(
    'encodes manage_security for a role-only super-admin on session-policy ' + method,
    async () => {
      const snapshot = () =>
        ['organization_session_policy', 'organization_audit'].map((table) =>
          harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
        );
      const before = snapshot();
      expect(
        await harness.call(
          'role-only',
          method,
          '/api/organization/session-policy',
          method === 'GET' ? undefined : policy,
        ),
      ).toEqual({
        status: 403,
        body: { error: 'forbidden', permission: 'organization.manage_security' },
      });
      expect(snapshot()).toEqual(before);
    },
  );
}

const policyRows = () =>
  ['organization_session_policy', 'organization_audit'].map((table) =>
    harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
  );

for (const method of ['read', 'set'] as const) {
  it('rechecks a queued security grant before session-policy ' + method, async () => {
    const gate = new WriteCoordinator();
    const repository = new SessionPolicyRepository(openSecurityDb(), gate);
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await held.promise;
    });
    await entered.promise;
    const principal = { id: harness.userId('security') };
    const act = {
      actor: principal.id,
      stamp: { at: 1, by: principal.id },
      auditId: 'queued-policy',
    };
    const pending =
      method === 'read'
        ? repository.read('org-a', principal)
        : repository.set('org-a', principal, policy, act);
    const before = policyRows();
    let settled = false;
    const observed = pending.finally(() => {
      settled = true;
    });
    try {
      await Bun.sleep(10);
      expect(settled).toBe(false);
      expect(policyRows()).toEqual(before);
      harness.sqlite.run('DELETE FROM access_grant WHERE subject_id = ?', [principal.id]);
    } finally {
      held.resolve(undefined);
      await blocker;
    }
    expect(await observed).toBe('forbidden');
    expect(policyRows()).toEqual(before);
  });

  it('throws when session-policy ' + method + ' cannot read grant state', async () => {
    harness.sqlite.run('ALTER TABLE access_grant RENAME TO unavailable_grants');
    const repository = new SessionPolicyRepository(openSecurityDb(), new WriteCoordinator());
    const principal = { id: harness.userId('security') };
    const before = policyRows();
    const pending =
      method === 'read'
        ? repository.read('org-a', principal)
        : repository.set('org-a', principal, policy, {
            actor: principal.id,
            stamp: { at: 1, by: principal.id },
            auditId: 'unreadable-policy',
          });
    expect((await rejectionOf(pending)).message).toContain('access_grant');
    expect(policyRows()).toEqual(before);
  });
}

it('retains the queued session-policy actor and policy independently of caller aliases', async () => {
  harness.grantPermissions('org-a', 'role-only', ['organization.manage_security']);
  const gate = new WriteCoordinator();
  const repository = new SessionPolicyRepository(openSecurityDb(), gate);
  const held = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const blocker = gate.enter(async () => {
    entered.resolve(undefined);
    await held.promise;
  });
  await entered.promise;
  const principal = { id: harness.userId('security') };
  const act = {
    actor: principal.id,
    stamp: { at: 1, by: principal.id },
    auditId: 'original-actor',
  };
  const draft = { ...policy };
  const pending = repository.set('org-a', principal, draft, act);
  principal.id = harness.userId('role-only');
  act.actor = principal.id;
  act.stamp.by = principal.id;
  act.auditId = 'replacement-actor';
  draft.maxSessionSeconds = 7_200;
  held.resolve(undefined);
  await blocker;
  expect(await pending).toBe('set');
  expect(
    harness.sqlite
      .query('SELECT created_by, max_session_seconds FROM organization_session_policy')
      .all(),
  ).toEqual([{ created_by: harness.userId('security'), max_session_seconds: 28_800 }]);
  expect(harness.sqlite.query('SELECT id, actor_id FROM organization_audit').all()).toEqual([
    { id: 'original-actor', actor_id: harness.userId('security') },
  ]);
});

it('rejects mismatched session-policy audit identity before acquiring the owner', () => {
  const repository = new SessionPolicyRepository(openSecurityDb(), {
    enter: () => {
      throw new Error('unexpected owner entry');
    },
  });
  const principal = { id: harness.userId('security') };
  const before = policyRows();
  expect(() =>
    repository.set('org-a', principal, policy, {
      actor: harness.userId('role-only'),
      stamp: { at: 1, by: principal.id },
      auditId: 'mismatched',
    }),
  ).toThrow('security principal differs from the audited actor');
  expect(() =>
    repository.set('org-a', principal, policy, {
      actor: principal.id,
      stamp: { at: 1, by: harness.userId('role-only') },
      auditId: 'mismatched',
    }),
  ).toThrow('security principal differs from the audited actor');
  expect(policyRows()).toEqual(before);
});

it('rolls session policy back when its audit write fails after the grant check', async () => {
  harness.sqlite.run(
    "CREATE TRIGGER fail_policy_audit BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'injected policy audit failure'); END",
  );
  const db = openSecurityDb();
  const repository = new SessionPolicyRepository(db, new WriteCoordinator());
  const principal = { id: harness.userId('security') };
  const before = policyRows();
  expect(
    await rejectionOf(
      repository.set('org-a', principal, policy, {
        actor: principal.id,
        stamp: { at: 1, by: principal.id },
        auditId: 'failed-policy',
      }),
    ),
  ).toMatchObject({ cause: { message: 'injected policy audit failure' } });
  expect(policyRows()).toEqual(before);
  expect(db.all('SELECT * FROM organization_session_policy')).toEqual([]);
});

for (const method of ['GET', 'PUT'] as const) {
  it('throws on corrupt grant permissions before session-policy ' + method, async () => {
    harness.sqlite.run('PRAGMA ignore_check_constraints = ON');
    harness.sqlite.run(
      "UPDATE access_role_permission SET permission = 'organization.unknown' WHERE permission = 'organization.manage_security'",
    );
    const before = policyRows();
    expect(
      (
        await harness.call(
          'security',
          method,
          '/api/organization/session-policy',
          method === 'GET' ? undefined : policy,
        )
      ).status,
    ).toBe(500);
    expect(policyRows()).toEqual(before);
  });
}

for (const kind of ['machine', 'consent'] as const) {
  it(
    'retains queued ' +
      kind +
      ' authentication for the security cap independently of caller aliases',
    async () => {
      const accountId = harness.userId('security');
      addAgentPerson(harness.sqlite, 'agent', 'org-a', accountId);
      const credential = await issueApiKey(harness.sqlite, {
        organizationId: 'org-a',
        personId: 'agent',
        issuedBy: accountId,
      });
      grantCredential(
        harness.sqlite,
        'org-a',
        credential.id,
        'org-super-admin',
        'organization',
        'org-a',
      );
      const gate = new WriteCoordinator();
      const repository = new SessionPolicyRepository(openSecurityDb(), gate);
      const held = Promise.withResolvers<undefined>();
      const entered = Promise.withResolvers<undefined>();
      const blocker = gate.enter(async () => {
        entered.resolve(undefined);
        await held.promise;
      });
      await entered.promise;
      const authentication: CredentialAuthentication =
        kind === 'machine'
          ? { kind, credentialId: credential.id, personId: 'agent' }
          : {
              kind,
              credentialId: credential.id,
              personId: 'agent',
              issuer: 'https://issuer.test',
              subject: 'subject',
            };
      const principal = { id: accountId, authentication };
      const before = policyRows();
      const pending = repository.set('org-a', principal, policy, {
        actor: accountId,
        stamp: { at: 1, by: accountId },
        auditId: 'capped-policy',
      });
      Object.assign(authentication, { kind: 'first_party', issuedAt: 1 });
      held.resolve(undefined);
      await blocker;
      expect(await pending).toBe('forbidden');
      expect(policyRows()).toEqual(before);
    },
  );
}

it('refuses a delegated human security grant at the direct session-policy writer', async () => {
  const principal = {
    id: harness.userId('security'),
    delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' as const },
  };
  const repository = new SessionPolicyRepository(openSecurityDb(), new WriteCoordinator());
  const before = policyRows();
  expect(
    await repository.set('org-a', principal, policy, {
      actor: principal.id,
      stamp: { at: 1, by: principal.id },
      auditId: 'delegated-policy',
    }),
  ).toBe('forbidden');
  expect(policyRows()).toEqual(before);
  expect(
    await repository.set('org-a', { id: principal.id }, policy, {
      actor: principal.id,
      stamp: { at: 1, by: principal.id },
      auditId: 'personal-policy',
    }),
  ).toBe('set');
});

it('preserves both session-policy and rollback failures from the current owner', async () => {
  harness.sqlite.run(
    "CREATE TRIGGER fail_policy_audit BEFORE INSERT ON organization_audit BEGIN SELECT RAISE(ABORT, 'injected policy audit failure'); END",
  );
  const db = openSecurityDb();
  const originalRun = db.run.bind(db);
  let statements = 0;
  const run = spyOn(db, 'run').mockImplementation((query) => {
    statements += 1;
    if (statements === 2) throw new Error('injected rollback failure');
    return originalRun(query);
  });
  const repository = new SessionPolicyRepository(db, new WriteCoordinator());
  const principal = { id: harness.userId('security') };
  try {
    expect(
      await rejectionOf(
        repository.set('org-a', principal, policy, {
          actor: principal.id,
          stamp: { at: 1, by: principal.id },
          auditId: 'paired-failure',
        }),
      ),
    ).toMatchObject({
      errors: [
        { cause: { message: 'injected policy audit failure' } },
        { message: 'injected rollback failure' },
      ],
    });
  } finally {
    run.mockRestore();
    db.run('ROLLBACK');
  }
  expect(policyRows()).toEqual([[], []]);
});

async function rejectionOf(pending: Promise<unknown>): Promise<Error> {
  const failure: unknown = await pending.then(
    () => null,
    (failure: unknown) => failure,
  );
  if (!(failure instanceof Error))
    throw new Error('expected the production operation to reject with an Error', {
      cause: failure,
    });
  return failure;
}

function openSecurityDb(logger?: Parameters<typeof openConnection>[1]): Drizzle {
  const connection = openConnection(harness.sqlite.filename, logger);
  ownedConnections.push(connection);
  return connection.db;
}

async function duringSecurityResolution<T>(mutate: string, call: () => Promise<T>): Promise<T> {
  const observer = spyOn(SqliteOrganizationAccess.prototype, 'resolve');
  const resolve = observer.getMockImplementation();
  if (resolve === undefined) throw new Error('security resolver spy lost its real implementation');
  let substitutions = 0;
  observer.mockImplementation(async function (this: SqliteOrganizationAccess, principal) {
    const admitted = await resolve.call(this, principal);
    if (mutate === 'id') Object.assign(principal, { id: harness.userId('role-only') });
    if (mutate === 'authentication')
      Object.assign(principal, {
        authentication: { kind: 'machine', credentialId: 'replacement', personId: 'agent' },
      });
    if (mutate === 'delegation')
      Object.assign(principal, { delegation: { organizationId: 'org-a' } });
    substitutions += 1;
    return admitted;
  });
  try {
    const answered = await call();
    expect(substitutions).toBe(1);
    return answered;
  } finally {
    observer.mockRestore();
  }
}

for (const method of ['GET', 'PUT'] as const) {
  for (const mutate of ['id', 'authentication', 'delegation']) {
    it(
      'retains the route security principal across organization resolution at session-' +
        method +
        ': ' +
        mutate,
      async () => {
        const answered = await duringSecurityResolution(mutate, () =>
          harness.call(
            'security',
            method,
            '/api/organization/session-policy',
            method === 'GET' ? undefined : policy,
          ),
        );
        expect(answered).toEqual({
          status: 200,
          body: { policy: method === 'GET' ? null : policy },
        });
      },
    );
  }
}
