import type { CredentialAuthentication } from '@wbs/contracts';
import { createAgentPool, validateSchema } from '@wbs/contracts';
import {
  type AgentPoolDraft,
  type AgentPoolRenewal,
  type AgentPools,
  type AuditedAct,
  digestMachineSecret,
  type OrganizationAccess,
  type SecurityPrincipal,
} from '@wbs/core';
import { agentPoolRoutes } from '@wbs/core/http/agent-pool.routes';
import type { PlanCommandRunner } from '@wbs/core/module/plan-commands/plan-commands.feature';
import { AccessDecisionRepository } from '@wbs/store-sqlite/access-decisions';
import { AgentPoolRepository } from '@wbs/store-sqlite/agent-pool';
import { openConnection } from '@wbs/store-sqlite/db';
import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import {
  SqliteOrganizationAccess,
  userBoundOrganizationOf,
} from '@wbs/store-sqlite/organization-access';
import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';

import { grantCredential } from '../testing/machine-credential-fixture';
import { TEST_MCP_AUTHORIZATION_SERVER } from '../testing/machine-grant-fixture';
import { OrganizationHarness } from '../testing/organization-harness';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from '../testing/organization-limits-fixture';

const path = '/api/organization/agent-pools';
let harness: OrganizationHarness;
let poolId: string;

beforeEach(async () => {
  harness = OrganizationHarness.openComposed();
  for (const username of ['granted', 'role-only', 'keeper']) await harness.register(username);
  harness.organization('org-a');
  harness.member('org-a', 'granted', 'viewer');
  harness.grantPermissions('org-a', 'granted', ['organization.manage_directory']);
  harness.member('org-a', 'role-only', 'super_admin');
  harness.member('org-a', 'keeper', 'super_admin', ['org-super-admin']);
  for (const username of ['granted', 'role-only', 'keeper']) harness.bind(username, 'org-a');
  harness.activate();
  const created = await harness.call('keeper', 'POST', path, { name: 'seed-pool', size: 1 });
  if (created.status !== 201) throw new Error('the explicit keeper could not create the seed pool');
  const parsed = await validateSchema(createAgentPool.responses[0].schema, created.body);
  if (parsed.issues !== undefined)
    throw new Error('the seed pool response failed its keys contract');
  poolId = parsed.value.poolId;
});

afterEach(() => {
  harness.close();
});

const snapshot = () =>
  [
    'agent_pool',
    'person',
    'person_organization',
    'machine_credential',
    'machine_credential_secret',
    'access_grant',
    'organization_audit',
    'event_log',
    'command_journal',
  ].map((table) => harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());

for (const operation of ['list', 'create', 'rekey', 'revoke'] as const) {
  const request = (username: string) =>
    operation === 'list'
      ? harness.call(username, 'GET', path)
      : operation === 'create'
        ? harness.call(username, 'POST', path, { name: 'new-pool', size: 1 })
        : operation === 'rekey'
          ? harness.call(username, 'POST', path + '/' + poolId + '/rekey', {})
          : harness.call(username, 'DELETE', path + '/' + poolId);
  it(
    'uses a minimal directory grant for agent-pool ' + operation + ' despite viewer storage',
    async () => {
      expect((await request('granted')).status).toBe(
        operation === 'create' || operation === 'rekey' ? 201 : 200,
      );
    },
  );
  it(
    'names manage_directory for a role-only agent-pool ' + operation + ' refusal without effects',
    async () => {
      const before = snapshot();
      const answered = await request('role-only');
      expect(answered.status).toBe(403);
      expect(answered.body).toEqual({
        error: 'forbidden',
        permission: 'organization.manage_directory',
      });
      expect(snapshot()).toEqual(before);
    },
  );
}

async function seedPoolClaim(): Promise<void> {
  const created = await harness.call('keeper', 'POST', '/api/projects', {
    name: 'Pool claim plan',
  });
  if (created.status !== 200) throw new Error('pool claim project creation refused');
  const project = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM project WHERE name=?')
    .get('Pool claim plan');
  if (project === null) throw new Error('pool claim project missing');
  const added = await harness.call('keeper', 'POST', '/api/projects/' + project.id + '/commands', {
    commands: [{ kind: 'createWorkItem', name: 'Claimed pool work' }],
  });
  if (added.status !== 200) throw new Error('pool claim work creation refused');
  const leaf = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE project_id=?')
    .get(project.id);
  const step = harness.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id=? ORDER BY rowid')
    .get(project.id);
  const person = harness.sqlite
    .query<{ person_id: string }, [string]>(
      'SELECT person_id FROM machine_credential WHERE agent_pool_id=?',
    )
    .get(poolId);
  if (leaf === null || step === null || person === null)
    throw new Error('pool claim references missing');
  const claimed = await harness.call(
    'keeper',
    'POST',
    '/api/projects/' + project.id + '/commands',
    {
      commands: [
        {
          kind: 'claimWorkItem',
          workItemId: leaf.id,
          personId: person.person_id,
          steps: [step.id],
        },
      ],
    },
  );
  if (claimed.status !== 200) throw new Error('pool claim setup refused');
}
for (const form of ['admission', 'execution'] as const) {
  it(
    'keeps committed pool revocation and names the ' + form + ' cleanup grant refusal',
    async () => {
      await harness.register('clerk');
      harness.member('org-a', 'clerk', 'admin');
      harness.grantPermissions('org-a', 'clerk', ['organization.manage_directory']);
      harness.bind('clerk', 'org-a');
      await seedPoolClaim();
      const caller = await harness.authenticatedCommandPrincipal('clerk', '');
      const connection = openConnection(harness.sqlite.filename);
      const pools = new AgentPoolRepository(
        connection.db,
        new WriteCoordinator(),
        TEST_ORGANIZATION_DEFAULT_LIMITS,
      );
      const organizations = new SqliteOrganizationAccess(
        connection.db,
        userBoundOrganizationOf((userId) => Promise.resolve(userId === caller.id ? 'org-a' : null)),
        () => Date.now(),
      );
      let callbacks = 0;
      let cleanupCalls = 0;
      const actual = harness.publicCommands();
      const runner: Pick<PlanCommandRunner, 'runDirectoryWithin'> = {
        runDirectoryWithin: async (...args) => {
          cleanupCalls += 1;
          if (form === 'execution')
            return {
              ok: false,
              at: 0,
              kind: 'deletePerson',
              reason: 'forbidden',
              permission: 'package.write',
            };
          return actual.runDirectoryWithin(...args);
        },
      };
      const endpoint = agentPoolRoutes(
        organizations,
        pools,
        runner,
        TEST_MCP_AUTHORIZATION_SERVER,
        { now: () => Date.now() },
        () => {
          callbacks += 1;
          harness.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [caller.id]);
        },
      )[3];
      const claims = harness.sqlite.query('SELECT * FROM claim ORDER BY rowid').all();
      expect(claims.length).toBeGreaterThan(0);
      const people = harness.sqlite.query('SELECT * FROM person ORDER BY rowid').all();
      const events = harness.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all();
      const auditBefore = harness.sqlite
        .query<{ n: number }, []>('SELECT count(*) AS n FROM organization_audit')
        .get();
      if (auditBefore === null) throw new Error('pool audit count missing');
      const publication = spyOn(harness.publicWrites().announcements, 'publish');
      const revocations = spyOn(pools, 'revoke');
      try {
        const reply = await endpoint.handle({
          principal: caller,
          params: { id: poolId },
          query: { removePersons: 'true' },
          body: undefined,
          request: {
            method: 'DELETE',
            url: new URL('http://localhost'),
            headers: new Headers({ 'X-WBS-Expected-Organization': 'org-a' }),
            signal: new AbortController().signal,
          },
        });
        expect(reply).toEqual({
          ok: false,
          status: 409,
          body: {
            error: 'persons_not_removed',
            poolId,
            revokedCredentials: 1,
            cause: 'forbidden',
            permission: form === 'admission' ? 'organization.manage_directory' : 'package.write',
          },
        });
        expect(callbacks).toBe(1);
        expect(revocations).toHaveBeenCalledTimes(1);
        expect(cleanupCalls).toBe(1);
        expect(harness.sqlite.query('SELECT * FROM claim ORDER BY rowid').all()).toEqual(claims);
        expect(harness.sqlite.query('SELECT * FROM person ORDER BY rowid').all()).toEqual(people);
        expect(harness.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all()).toEqual(
          events,
        );
        expect(publication).not.toHaveBeenCalled();
        const revoked = harness.sqlite
          .query<{ revoked_at: number | null }, [string]>(
            'SELECT revoked_at FROM agent_pool WHERE id=?',
          )
          .get(poolId);
        if (revoked === null) throw new Error('revoked pool missing');
        expect(revoked.revoked_at).not.toBeNull();
        expect(
          harness.sqlite
            .query<{ n: number }, [string]>(
              'SELECT count(*) AS n FROM machine_credential WHERE agent_pool_id=? AND revoked_at IS NOT NULL',
            )
            .get(poolId),
        ).toEqual({ n: 1 });
        expect(
          harness.sqlite
            .query<{ n: number }, []>('SELECT count(*) AS n FROM organization_audit')
            .get(),
        ).toEqual({ n: auditBefore.n + 2 });
      } finally {
        revocations.mockRestore();
        publication.mockRestore();
        connection.close();
      }
    },
  );
}

type PoolOperation = 'list' | 'create' | 'personsOf' | 'rekey' | 'revoke';
async function poolChange(actorId: string) {
  const existing = harness.sqlite
    .query<{ person_id: string }, [string]>(
      'SELECT person_id FROM machine_credential WHERE agent_pool_id=?',
    )
    .get(poolId);
  if (existing === null) throw new Error('seed pool credential absent');
  const digest = await digestMachineSecret('replacement-' + crypto.randomUUID());
  const draft = {
    id: crypto.randomUUID(),
    name: 'queued-pool',
    expiresAt: null,
    agents: [
      {
        personId: crypto.randomUUID(),
        credentialId: crypto.randomUUID(),
        secretId: crypto.randomUUID(),
        digest,
      },
    ],
  };
  const renewal = {
    keys: [
      {
        personId: existing.person_id,
        credentialId: crypto.randomUUID(),
        secretId: crypto.randomUUID(),
        digest,
      },
    ],
  };
  const act = {
    actor: actorId,
    stamp: { by: actorId, at: Date.now() },
    auditId: crypto.randomUUID(),
  };
  return { draft, renewal, act, personId: existing.person_id };
}
function invokePool(
  pools: AgentPools,
  operation: PoolOperation,
  principal: SecurityPrincipal,
  draft: AgentPoolDraft,
  renewal: AgentPoolRenewal,
  act: AuditedAct,
): Promise<unknown> {
  switch (operation) {
    case 'list':
      return pools.list('org-a', principal, act.stamp.at);
    case 'create':
      return pools.create('org-a', principal, draft, act);
    case 'personsOf':
      return pools.personsOf('org-a', principal, poolId);
    case 'rekey':
      return pools.rekey('org-a', principal, poolId, renewal, act);
    case 'revoke':
      return pools.revoke('org-a', principal, poolId, act);
  }
}
for (const operation of ['list', 'create', 'personsOf', 'rekey', 'revoke'] as const) {
  for (const revoked of ['grant', 'membership'] as const) {
    it(
      'rechecks queued pool ' + operation + ' ' + revoked + ' before facts or effects',
      async () => {
        const connection = openConnection(harness.sqlite.filename);
        const gate = new WriteCoordinator();
        const pools = new AgentPoolRepository(
          connection.db,
          gate,
          TEST_ORGANIZATION_DEFAULT_LIMITS,
        );
        const actorId = harness.userId('granted');
        const changes = await poolChange(actorId);
        const held = Promise.withResolvers<undefined>();
        const entered = Promise.withResolvers<undefined>();
        const blocker = gate.enter(async () => {
          entered.resolve(undefined);
          await held.promise;
        });
        await entered.promise;

        let settled = false;
        const pending = invokePool(
          pools,
          operation,
          { id: actorId },
          changes.draft,
          changes.renewal,
          changes.act,
        ).finally(() => {
          settled = true;
        });
        try {
          await Bun.sleep(20);
          expect(settled).toBe(false);
          if (revoked === 'grant')
            harness.sqlite.run(
              "DELETE FROM access_grant WHERE organization_id='org-a' AND subject_kind='user' AND subject_id=?",
              [actorId],
            );
          else
            harness.sqlite.run(
              "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id=?",
              [actorId],
            );
          const before = snapshot();
          held.resolve(undefined);
          await blocker;
          expect(await pending).toEqual({
            kind: 'forbidden',
            permission: 'organization.manage_directory',
          });
          expect(snapshot()).toEqual(before);
        } finally {
          held.resolve(undefined);
          await blocker;
          try {
            await pending;
          } finally {
            connection.close();
          }
        }
      },
    );
  }
  it('retains queued pool ' + operation + ' actual principal and mutable act inputs', async () => {
    const connection = openConnection(harness.sqlite.filename);
    const gate = new WriteCoordinator();
    const pools = new AgentPoolRepository(connection.db, gate, TEST_ORGANIZATION_DEFAULT_LIMITS);
    const actorId = harness.userId('granted');
    const changes = await poolChange(actorId);
    const principal = { id: actorId };
    const auditId = changes.act.auditId;
    const at = changes.act.stamp.at;
    const originalPoolId = changes.draft.id;
    const newPersonId = changes.draft.agents[0]?.personId;
    const credentialId = changes.renewal.keys[0]?.credentialId;
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await held.promise;
    });
    await entered.promise;
    const pending = invokePool(
      pools,
      operation,
      principal,
      changes.draft,
      changes.renewal,
      changes.act,
    );
    principal.id = harness.userId('role-only');
    changes.act.actor = principal.id;
    changes.act.stamp.by = principal.id;
    changes.act.stamp.at = 1;
    changes.act.auditId = crypto.randomUUID();
    changes.draft.id = crypto.randomUUID();
    changes.draft.name = 'substitute-pool';
    const agent = changes.draft.agents[0];
    const key = changes.renewal.keys[0];
    agent.personId = crypto.randomUUID();
    agent.credentialId = crypto.randomUUID();
    agent.secretId = crypto.randomUUID();
    key.credentialId = crypto.randomUUID();
    key.secretId = crypto.randomUUID();
    held.resolve(undefined);
    await blocker;
    try {
      const answer = await pending;
      if (operation === 'list') expect(answer).toMatchObject([{ id: poolId }]);
      else if (operation === 'personsOf')
        expect(answer).toMatchObject([{ personId: changes.personId }]);
      else {
        expect(answer).toMatchObject(
          operation === 'create'
            ? {
                kind: 'created',
                issued: {
                  pool: { id: originalPoolId, name: 'queued-pool' },
                  agents: [{ personId: newPersonId }],
                },
              }
            : operation === 'rekey'
              ? { kind: 'rekeyed', issued: { agents: [{ credentialId }] } }
              : { kind: 'revoked', revokedCredentials: 1 },
        );
        expect(
          harness.sqlite
            .query<{ actor_id: string; created_at: number }, [string]>(
              'SELECT actor_id,created_at FROM organization_audit WHERE id=?',
            )
            .get(auditId),
        ).toEqual({ actor_id: actorId, created_at: at });
      }
    } finally {
      connection.close();
    }
  });
  it('refuses effective delegated personal authority at pool ' + operation + ' owner', async () => {
    const connection = openConnection(harness.sqlite.filename);
    const pools = new AgentPoolRepository(
      connection.db,
      new WriteCoordinator(),
      TEST_ORGANIZATION_DEFAULT_LIMITS,
    );
    const actorId = harness.userId('granted');
    const changes = await poolChange(actorId);
    const before = snapshot();
    try {
      expect(
        await invokePool(
          pools,
          operation,
          { id: actorId, delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' } },
          changes.draft,
          changes.renewal,
          changes.act,
        ),
      ).toEqual({ kind: 'forbidden', permission: 'organization.manage_directory' });
      expect(snapshot()).toEqual(before);
    } finally {
      connection.close();
    }
  });
  it(
    'throws on unreadable current pool ' + operation + ' grant state without effects',
    async () => {
      const connection = openConnection(harness.sqlite.filename);
      const pools = new AgentPoolRepository(
        connection.db,
        new WriteCoordinator(),
        TEST_ORGANIZATION_DEFAULT_LIMITS,
      );
      const actorId = harness.userId('granted');
      const changes = await poolChange(actorId);
      harness.sqlite.run('ALTER TABLE access_grant RENAME TO unreadable_access_grant');
      const before = snapshotWithoutGrants();
      const decision = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
      try {
        const failure = await capturePoolFailure(
          invokePool(
            pools,
            operation,
            { id: actorId },
            changes.draft,
            changes.renewal,
            changes.act,
          ),
        );
        expect(decision).toHaveBeenCalledTimes(1);
        expect(failure.message).toContain('access_grant');
        expect(snapshotWithoutGrants()).toEqual(before);
      } finally {
        decision.mockRestore();
        connection.close();
      }
    },
  );
}
const snapshotWithoutGrants = () =>
  [
    'agent_pool',
    'person',
    'person_organization',
    'machine_credential',
    'machine_credential_secret',
    'organization_audit',
    'event_log',
    'command_journal',
  ].map((table) => harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
async function capturePoolFailure(pending: Promise<unknown>): Promise<Error> {
  const failure = await pending.then(
    () => null,
    (failure: unknown) => failure,
  );
  if (!(failure instanceof Error))
    throw new Error('expected production pool rejection', { cause: failure });
  return failure;
}

for (const operation of ['list', 'create', 'personsOf', 'rekey', 'revoke'] as const) {
  it(
    'retains pool ' + operation + ' queued machine cap beside its own grant and account authority',
    async () => {
      const credential = harness.sqlite
        .query<{ id: string; person_id: string }, [string]>(
          'SELECT id,person_id FROM machine_credential WHERE agent_pool_id=?',
        )
        .get(poolId);
      if (credential === null) throw new Error('pool credential absent');
      const actorId = harness.userId('keeper');
      grantCredential(harness.sqlite, 'org-a', credential.id, 'org-admin', 'organization', 'org-a');
      const connection = openConnection(harness.sqlite.filename);
      const gate = new WriteCoordinator();
      const pools = new AgentPoolRepository(connection.db, gate, TEST_ORGANIZATION_DEFAULT_LIMITS);
      const changes = await poolChange(actorId);
      const held = Promise.withResolvers<undefined>();
      const entered = Promise.withResolvers<undefined>();
      const blocker = gate.enter(async () => {
        entered.resolve(undefined);
        await held.promise;
      });
      await entered.promise;
      const principal: { id: string; authentication?: CredentialAuthentication } = {
        id: actorId,
        authentication: {
          kind: 'machine',
          credentialId: credential.id,
          personId: credential.person_id,
        },
      };
      const before = snapshot();
      const pending = invokePool(
        pools,
        operation,
        principal,
        changes.draft,
        changes.renewal,
        changes.act,
      );
      delete principal.authentication;
      held.resolve(undefined);
      await blocker;
      try {
        expect(await pending).toEqual({
          kind: 'forbidden',
          permission: 'organization.manage_directory',
        });
        expect(snapshot()).toEqual(before);
      } finally {
        connection.close();
      }
    },
  );
  it('keeps pool ' + operation + ' current grant await inside its immediate owner', async () => {
    const connection = openConnection(harness.sqlite.filename);
    const pools = new AgentPoolRepository(
      connection.db,
      new WriteCoordinator(),
      TEST_ORGANIZATION_DEFAULT_LIMITS,
    );
    const changes = await poolChange(harness.userId('granted'));
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const observer = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
    const original = observer.getMockImplementation();
    if (original === undefined) throw new Error('pool decision implementation absent');
    observer.mockImplementation(async function (this: AccessDecisionRepository, principal, target) {
      entered.resolve(undefined);
      await held.promise;
      return original.call(this, principal, target);
    });
    const pending = invokePool(
      pools,
      operation,
      { id: harness.userId('granted') },
      changes.draft,
      changes.renewal,
      changes.act,
    );
    await entered.promise;
    harness.sqlite.run('PRAGMA busy_timeout=0');
    try {
      expect(() =>
        harness.sqlite.run("UPDATE organization SET name='concurrent' WHERE id='org-a'"),
      ).toThrow(/busy|locked/);
    } finally {
      held.resolve(undefined);
      observer.mockRestore();
      try {
        await pending;
      } finally {
        connection.close();
      }
    }
  });
}
for (const operation of ['list', 'create', 'rekey', 'revoke'] as const) {
  for (const changed of ['id', 'authentication', 'delegation'] as const) {
    it(
      'retains the pool ' + operation + ' route principal before resolution: ' + changed,
      async () => {
        const observer = spyOn(SqliteOrganizationAccess.prototype, 'resolve');
        const resolve = observer.getMockImplementation();
        if (resolve === undefined) throw new Error('pool resolver implementation absent');
        let substitutions = 0;
        observer.mockImplementation(async function (this: SqliteOrganizationAccess, principal) {
          const resolved = await resolve.call(this, principal);
          if (changed === 'id') Object.assign(principal, { id: harness.userId('role-only') });
          if (changed === 'authentication')
            Object.assign(principal, {
              authentication: { kind: 'machine', credentialId: 'substitute', personId: 'agent' },
            });
          if (changed === 'delegation')
            Object.assign(principal, {
              delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' },
            });
          substitutions += 1;
          return resolved;
        });
        try {
          const answer =
            operation === 'list'
              ? await harness.call('granted', 'GET', path)
              : operation === 'create'
                ? await harness.call('granted', 'POST', path, { name: 'new', size: 1 })
                : operation === 'rekey'
                  ? await harness.call('granted', 'POST', path + '/' + poolId + '/rekey', {})
                  : await harness.call('granted', 'DELETE', path + '/' + poolId);
          expect(answer.status).toBe(operation === 'create' || operation === 'rekey' ? 201 : 200);
          expect(substitutions).toBe(1);
        } finally {
          observer.mockRestore();
        }
      },
    );
  }
  it('uses the actual composed pool ' + operation + ' gate and current grant', async () => {
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = harness.holdWriteTurn(held.promise, () => {
      entered.resolve(undefined);
    });
    await entered.promise;
    let settled = false;
    const pending = (
      operation === 'list'
        ? harness.call('granted', 'GET', path)
        : operation === 'create'
          ? harness.call('granted', 'POST', path, { name: 'new', size: 1 })
          : operation === 'rekey'
            ? harness.call('granted', 'POST', path + '/' + poolId + '/rekey', {})
            : harness.call('granted', 'DELETE', path + '/' + poolId)
    ).finally(() => {
      settled = true;
    });
    try {
      await Bun.sleep(20);
      expect(settled).toBe(false);
      harness.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [
        harness.userId('granted'),
      ]);
    } finally {
      held.resolve(undefined);
      await blocker;
    }
    const before = snapshot();
    expect(await pending).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.manage_directory' },
    });
    expect(snapshot()).toEqual(before);
  });
}

for (const operation of ['create', 'rekey', 'revoke'] as const) {
  it('retains pool ' + operation + ' route payload and target before resolution', async () => {
    const caller = await harness.authenticatedCommandPrincipal('granted', '');
    const connection = openConnection(harness.sqlite.filename);
    const pools = new AgentPoolRepository(
      connection.db,
      new WriteCoordinator(),
      TEST_ORGANIZATION_DEFAULT_LIMITS,
    );
    const actual = new SqliteOrganizationAccess(
      connection.db,
      userBoundOrganizationOf(() => Promise.resolve('org-a')),
      () => Date.now(),
    );
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const organizations: OrganizationAccess = {
      resolve: async (principal) => {
        const resolved = await actual.resolve(principal);
        entered.resolve(undefined);
        await held.promise;
        return resolved;
      },
    };
    const endpoints = agentPoolRoutes(
      organizations,
      pools,
      harness.publicCommands(),
      TEST_MCP_AUTHORIZATION_SERVER,
      { now: () => Date.now() },
      () => undefined,
    );
    const originalExpiry = Date.now() + 60_000;
    const body = { name: 'original-route-payload', size: 1, expiresAt: originalExpiry };
    const params = { id: poolId };
    const query: { removePersons?: 'true' } = {};
    const request = {
      method: operation === 'revoke' ? 'DELETE' : 'POST',
      url: new URL('http://localhost'),
      headers: new Headers({ 'X-WBS-Expected-Organization': 'org-a' }),
      signal: new AbortController().signal,
    };
    const pending =
      operation === 'create'
        ? endpoints[1].handle({ principal: caller, body, params: {}, query: undefined, request })
        : operation === 'rekey'
          ? endpoints[2].handle({ principal: caller, body, params, query: undefined, request })
          : endpoints[3].handle({ principal: caller, body: undefined, params, query, request });
    await entered.promise;
    body.name = 'substitute-name';
    body.size = 2;
    body.expiresAt = 1;
    params.id = 'substitute-pool';
    query.removePersons = 'true';
    held.resolve(undefined);
    try {
      const reply = await pending;
      expect(reply.status).toBe(operation === 'revoke' ? 200 : 201);
      if (operation === 'create')
        expect(reply.body).toMatchObject({
          name: 'original-route-payload',
          expiresAt: originalExpiry,
          agents: [expect.anything()],
        });
      else if (operation === 'rekey')
        expect(reply.body).toMatchObject({ poolId, expiresAt: originalExpiry });
      else {
        expect(reply.body).toEqual({ poolId, revokedCredentials: 1, removedPersons: 0 });
        expect(
          harness.sqlite
            .query(
              'SELECT id FROM person WHERE id=(SELECT person_id FROM machine_credential WHERE agent_pool_id=?)',
            )
            .get(poolId),
        ).not.toBeNull();
      }
      expect(
        harness.sqlite
          .query("SELECT id FROM agent_pool WHERE id='substitute-pool' OR name='substitute-name'")
          .all(),
      ).toEqual([]);
    } finally {
      held.resolve(undefined);
      connection.close();
    }
  });
}
for (const mismatch of ['actor', 'stamp'] as const) {
  it('rejects pool create ' + mismatch + ' mismatch before taking its turn', async () => {
    const connection = openConnection(harness.sqlite.filename);
    const gate = new WriteCoordinator();
    const pools = new AgentPoolRepository(connection.db, gate, TEST_ORGANIZATION_DEFAULT_LIMITS);
    const changes = await poolChange(harness.userId('granted'));
    if (mismatch === 'actor') changes.act.actor = 'substitute';
    else changes.act.stamp.by = 'substitute';
    const entered = spyOn(gate, 'enter');
    const before = snapshot();
    try {
      expect(() =>
        pools.create('org-a', { id: harness.userId('granted') }, changes.draft, changes.act),
      ).toThrow('pool audit identity differs from its actor');
      expect(entered).not.toHaveBeenCalled();
      expect(snapshot()).toEqual(before);
    } finally {
      entered.mockRestore();
      connection.close();
    }
  });
}
it('rolls pool create back on a late lifecycle audit failure', async () => {
  const before = snapshot();
  harness.sqlite.run(
    "CREATE TRIGGER fail_pool_create_audit BEFORE INSERT ON organization_audit WHEN NEW.action='agent_pool_created' BEGIN SELECT RAISE(ABORT,'late pool create audit unavailable'); END",
  );
  expect(
    (await harness.call('granted', 'POST', path, { name: 'late-fault', size: 1 })).status,
  ).toBe(500);
  expect(snapshot()).toEqual(before);
});
for (const operation of ['list', 'create', 'personsOf', 'rekey', 'revoke'] as const) {
  it('refuses inactive pool ' + operation + ' before current grants or pool facts', async () => {
    const changes = await poolChange(harness.userId('granted'));
    const inactive = OrganizationHarness.openComposed();
    const connection = openConnection(inactive.sqlite.filename);
    const pools = new AgentPoolRepository(
      connection.db,
      new WriteCoordinator(),
      TEST_ORGANIZATION_DEFAULT_LIMITS,
    );
    try {
      expect(
        await invokePool(pools, operation, { id: 'not-a-member' }, changes.draft, changes.renewal, {
          ...changes.act,
          actor: 'not-a-member',
          stamp: { ...changes.act.stamp, by: 'not-a-member' },
        }),
      ).toEqual(
        operation === 'list' || operation === 'personsOf' ? 'inactive' : { kind: 'inactive' },
      );
    } finally {
      connection.close();
      inactive.close();
    }
  });
}

it('forwards the pool rekey writer permission after a successful persons preflight', async () => {
  const observer = spyOn(AgentPoolRepository.prototype, 'personsOf');
  const original = observer.getMockImplementation();
  if (original === undefined) throw new Error('pool persons implementation absent');
  let reads = 0;
  observer.mockImplementation(async function (this: AgentPoolRepository, ...args) {
    const persons = await original.apply(this, args);
    harness.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [harness.userId('granted')]);
    reads += 1;
    return persons;
  });
  const before = snapshotWithoutGrants();
  try {
    expect(await harness.call('granted', 'POST', path + '/' + poolId + '/rekey', {})).toEqual({
      status: 403,
      body: { error: 'forbidden', permission: 'organization.manage_directory' },
    });
    expect(reads).toBe(1);
    expect(snapshotWithoutGrants()).toEqual(before);
  } finally {
    observer.mockRestore();
  }
});

it('encodes the committed pool revocation and later grant refusal through HTTP', async () => {
  await seedPoolClaim();
  const claims = harness.sqlite.query('SELECT * FROM claim ORDER BY rowid').all();
  expect(claims.length).toBeGreaterThan(0);
  const people = harness.sqlite.query('SELECT * FROM person ORDER BY rowid').all();
  const events = harness.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all();
  const beforeAudit = harness.sqlite
    .query<{ n: number }, []>('SELECT count(*) AS n FROM organization_audit')
    .get();
  if (beforeAudit === null) throw new Error('pool audit count absent');
  const callback = spyOn(harness.claimLeaseSweep(), 'requestSweep').mockImplementation(() => {
    harness.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [harness.userId('granted')]);
  });
  const publication = spyOn(harness.publicWrites().announcements, 'publish');
  try {
    expect(
      await harness.call('granted', 'DELETE', path + '/' + poolId + '?removePersons=true'),
    ).toEqual({
      status: 409,
      body: {
        error: 'persons_not_removed',
        poolId,
        revokedCredentials: 1,
        cause: 'forbidden',
        permission: 'organization.manage_directory',
      },
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(publication).not.toHaveBeenCalled();
    expect(harness.sqlite.query('SELECT * FROM claim ORDER BY rowid').all()).toEqual(claims);
    expect(harness.sqlite.query('SELECT * FROM person ORDER BY rowid').all()).toEqual(people);
    expect(harness.sqlite.query('SELECT * FROM event_log ORDER BY rowid').all()).toEqual(events);
    expect(
      harness.sqlite
        .query<{ revoked_at: number | null }, [string]>(
          'SELECT revoked_at FROM agent_pool WHERE id=?',
        )
        .get(poolId)?.revoked_at,
    ).toBeNumber();
    expect(
      harness.sqlite
        .query<{ revoked_at: number | null }, [string]>(
          'SELECT revoked_at FROM machine_credential WHERE agent_pool_id=?',
        )
        .get(poolId)?.revoked_at,
    ).toBeNumber();
    expect(
      harness.sqlite.query<{ n: number }, []>('SELECT count(*) AS n FROM organization_audit').get()
        ?.n,
    ).toBe(beforeAudit.n + 2);
  } finally {
    callback.mockRestore();
    publication.mockRestore();
  }
});

for (const operation of ['list', 'create', 'rekey', 'revoke'] as const) {
  it('passes only the pool ' + operation + ' authority projection to its public port', async () => {
    const observer = spyOn(AgentPoolRepository.prototype, operation);
    try {
      const answered =
        operation === 'list'
          ? await harness.call('granted', 'GET', path)
          : operation === 'create'
            ? await harness.call('granted', 'POST', path, { name: 'projected', size: 1 })
            : operation === 'rekey'
              ? await harness.call('granted', 'POST', path + '/' + poolId + '/rekey', {})
              : await harness.call('granted', 'DELETE', path + '/' + poolId);
      expect(answered.status).toBe(operation === 'create' || operation === 'rekey' ? 201 : 200);
      expect(observer).toHaveBeenCalledTimes(1);
      const authority = observer.mock.calls[0][1];
      expect(Object.keys(authority).sort()).toEqual(['authentication', 'delegation', 'id']);
      expect(Object.hasOwn(authority, 'organizationBinding')).toBe(false);
      expect(Object.hasOwn(authority, 'username')).toBe(false);
      expect(Object.hasOwn(authority, 'scopes')).toBe(false);
    } finally {
      observer.mockRestore();
    }
  });
}
