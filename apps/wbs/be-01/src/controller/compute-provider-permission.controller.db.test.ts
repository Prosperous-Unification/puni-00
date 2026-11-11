import type { CredentialAuthentication } from '@wbs/contracts';
import type { OrganizationAccess } from '@wbs/core';
import type {
  AuditedAct,
  ComputeProviderAdministration,
  ComputeProviderDraft,
  SecurityPrincipal,
} from '@wbs/core';
import { computeProviderRoutes } from '@wbs/core/http/compute-provider.routes';
import type { CapacityOutcome } from '@wbs/domain/compute-provider';
import { AccessDecisionRepository } from '@wbs/store-sqlite/access-decisions';
import { ComputeProviderRepository } from '@wbs/store-sqlite/compute-provider';
import { openConnection } from '@wbs/store-sqlite/db';
import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import { SqliteOrganizationAccess } from '@wbs/store-sqlite/organization-access';
import { afterEach, beforeEach, expect, it, spyOn } from 'bun:test';

import {
  addAgentPerson,
  grantCredential,
  issueApiKey,
} from '../testing/machine-credential-fixture';
import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness;
const path = '/api/organization/compute-providers';

async function openProviderOrganization(isActivated: boolean) {
  harness = OrganizationHarness.openComposed();
  for (const username of ['granted', 'role-only']) await harness.register(username);
  harness.organization('org-a');
  harness.member('org-a', 'granted', 'viewer');
  harness.grantPermissions('org-a', 'granted', ['organization.manage_directory']);
  harness.member('org-a', 'role-only', 'super_admin');
  harness.bind('granted', 'org-a');
  harness.bind('role-only', 'org-a');
  if (isActivated) harness.activate();
  harness.sqlite.run(
    "INSERT INTO compute_provider(id,organization_id,kind,name,locator,created_at,created_by) VALUES ('provider','org-a','ssh_host','existing','host',1,?)",
    [harness.userId('granted')],
  );
}
beforeEach(() => openProviderOrganization(true));
afterEach(() => {
  harness.close();
});

for (const operation of ['list', 'register', 'update', 'remove'] as const) {
  const request = (username: string) =>
    operation === 'list'
      ? harness.call(username, 'GET', path)
      : operation === 'register'
        ? harness.call(username, 'POST', path, {
            kind: 'ssh_host',
            name: 'new',
            locator: 'host-new',
          })
        : operation === 'update'
          ? harness.call(username, 'PATCH', path + '/provider', { name: 'renamed' })
          : harness.call(username, 'DELETE', path + '/provider');
  it(
    'uses a minimal directory grant for compute-provider ' + operation + ' despite viewer storage',
    async () => {
      const answer = await request('granted');
      expect(answer.status).toBe(
        operation === 'register' ? 201 : operation === 'remove' ? 204 : 200,
      );
    },
  );
  it(
    'names manage_directory for a role-only compute-provider ' +
      operation +
      ' refusal without effects',
    async () => {
      const snapshot = () =>
        ['compute_provider', 'organization_audit', 'event_log', 'command_journal'].map((table) =>
          harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
        );
      const before = snapshot();
      expect(await request('role-only')).toEqual({
        status: 403,
        body: { error: 'forbidden', permission: 'organization.manage_directory' },
      });
      expect(snapshot()).toEqual(before);
    },
  );
}

const snapshotProviders = () =>
  ['compute_provider', 'organization_audit', 'event_log', 'command_journal'].map((table) =>
    harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
  );
function invokeProvider(
  administration: ComputeProviderAdministration,
  operation: 'list' | 'register' | 'update' | 'remove',
  principal: SecurityPrincipal,
  draft: ComputeProviderDraft,
  act: AuditedAct,
): Promise<unknown> {
  switch (operation) {
    case 'list':
      return administration.list('org-a', principal);
    case 'register':
      return administration.register('org-a', principal, draft, act);
    case 'update':
      return administration.update('org-a', principal, 'provider', draft, act);
    case 'remove':
      return administration.remove('org-a', principal, 'provider', false, act);
  }
}
for (const operation of ['list', 'register', 'update', 'remove'] as const) {
  it('rechecks queued compute-provider ' + operation + ' grants before effects', async () => {
    const connection = openConnection(harness.sqlite.filename);
    const gate = new WriteCoordinator();
    const providers = new ComputeProviderRepository(connection.db, gate);
    const held = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const blocker = gate.enter(async () => {
      entered.resolve(undefined);
      await held.promise;
    });
    await entered.promise;
    const principal = { id: harness.userId('granted') };
    const act = { actor: principal.id, stamp: { by: principal.id, at: 10 }, auditId: 'queued' };
    const pending = invokeProvider(
      providers,
      operation,
      principal,
      { id: 'queued-provider', kind: 'ssh_host', name: 'queued', locator: 'queued' },
      act,
    );
    harness.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [principal.id]);
    const before = snapshotProviders();
    held.resolve(undefined);
    await blocker;
    try {
      expect(await pending).toEqual({
        kind: 'forbidden',
        permission: 'organization.manage_directory',
      });
      expect(snapshotProviders()).toEqual(before);
    } finally {
      connection.close();
    }
  });
  it(
    'retains queued compute-provider ' + operation + ' actual identity and mutable inputs',
    async () => {
      const connection = openConnection(harness.sqlite.filename);
      const gate = new WriteCoordinator();
      const providers = new ComputeProviderRepository(connection.db, gate);
      const held = Promise.withResolvers<undefined>();
      const entered = Promise.withResolvers<undefined>();
      const blocker = gate.enter(async () => {
        entered.resolve(undefined);
        await held.promise;
      });
      await entered.promise;
      const originalId = harness.userId('granted');
      const principal = { id: originalId };
      const act = { actor: originalId, stamp: { by: originalId, at: 10 }, auditId: 'queued' };
      const draft = {
        id: 'queued-provider',
        kind: 'ssh_host' as const,
        name: 'queued',
        locator: 'queued-host',
      };
      const pending = invokeProvider(providers, operation, principal, draft, act);
      principal.id = harness.userId('role-only');
      act.actor = principal.id;
      act.stamp.by = principal.id;
      act.stamp.at = 99;
      act.auditId = 'substitute';
      draft.name = 'substitute';
      draft.locator = 'substitute-host';
      draft.id = 'substitute-provider';
      held.resolve(undefined);
      await blocker;
      try {
        const outcome = await pending;
        if (operation === 'list') expect(outcome).toMatchObject([{ id: 'provider' }]);
        else {
          if (operation === 'remove') expect(outcome).toBe('removed');
          else
            expect(outcome).toMatchObject({
              kind: operation === 'register' ? 'registered' : 'updated',
              provider: { name: 'queued', locator: 'queued-host' },
            });
          expect(
            harness.sqlite.query('SELECT id,actor_id,created_at FROM organization_audit').all(),
          ).toEqual([{ id: 'queued', actor_id: originalId, created_at: 10 }]);
        }
      } finally {
        connection.close();
      }
    },
  );
  for (const changed of ['id', 'authentication', 'delegation'] as const) {
    it(
      'retains the compute-provider ' +
        operation +
        ' route principal before resolution: ' +
        changed,
      async () => {
        const observer = spyOn(SqliteOrganizationAccess.prototype, 'resolve');
        const resolve = observer.getMockImplementation();
        if (resolve === undefined) throw new Error('resolver implementation absent');
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
              : operation === 'register'
                ? await harness.call('granted', 'POST', path, {
                    kind: 'ssh_host',
                    name: 'new',
                    locator: 'new-host',
                  })
                : operation === 'update'
                  ? await harness.call('granted', 'PATCH', path + '/provider', { name: 'renamed' })
                  : await harness.call('granted', 'DELETE', path + '/provider');
          expect(answer.status).toBe(
            operation === 'register' ? 201 : operation === 'remove' ? 204 : 200,
          );
          expect(substitutions).toBe(1);
        } finally {
          observer.mockRestore();
        }
      },
    );
  }
}

for (const operation of ['register', 'update', 'remove'] as const) {
  it(
    'retains compute-provider ' + operation + ' route payload before its resolver await',
    async () => {
      const connection = openConnection(harness.sqlite.filename);
      const repository = new ComputeProviderRepository(connection.db, new WriteCoordinator());
      const held = Promise.withResolvers<undefined>();
      const entered = Promise.withResolvers<undefined>();
      const accountId = harness.userId('granted');
      const organizations: OrganizationAccess = {
        resolve: async () => {
          entered.resolve(undefined);
          await held.promise;
          return {
            ok: true,
            access: {
              kind: 'scoped',
              scope: { organizationId: 'org-a', userId: accountId, role: 'viewer', cap: null },
              principal: { id: accountId },
            },
          };
        },
      };
      const endpoints = computeProviderRoutes(organizations, repository, repository, {
        now: () => 10,
      });
      const principal = { id: accountId, username: 'granted', scopes: ['read', 'write'] as const };
      const request = {
        method: operation === 'register' ? 'POST' : operation === 'update' ? 'PATCH' : 'DELETE',
        url: new URL('http://localhost'),
        headers: new Headers(),
        signal: new AbortController().signal,
      };
      const body = {
        kind: 'ssh_host' as const,
        name: 'original-payload',
        locator: 'original-host',
      };
      const params = { id: 'provider' };
      const query: { cascade?: 'true' } = {};
      const pending =
        operation === 'register'
          ? endpoints[1].handle({ principal, params: {}, query: undefined, body, request })
          : operation === 'update'
            ? endpoints[2].handle({ principal, params, query: undefined, body, request })
            : endpoints[3].handle({ principal, params, query, body: undefined, request });
      await entered.promise;
      body.name = 'substitute-payload';
      body.locator = 'substitute-host';
      params.id = 'absent';
      query.cascade = 'true';
      held.resolve(undefined);
      try {
        const answer = await pending;
        expect(answer.status).toBe(
          operation === 'register' ? 201 : operation === 'update' ? 200 : 204,
        );
        if (operation !== 'remove')
          expect(answer.body).toMatchObject({ name: 'original-payload', locator: 'original-host' });
        else expect(harness.sqlite.query('SELECT id FROM compute_provider').all()).toEqual([]);
      } finally {
        connection.close();
      }
    },
  );
}

for (const operation of ['list', 'register', 'update', 'remove'] as const) {
  it(
    'refuses delegated personal authority at compute-provider ' + operation + ' owner',
    async () => {
      const connection = openConnection(harness.sqlite.filename);
      const providers = new ComputeProviderRepository(connection.db, new WriteCoordinator());
      const accountId = harness.userId('granted');
      const before = snapshotProviders();
      try {
        expect(
          await invokeProvider(
            providers,
            operation,
            {
              id: accountId,
              delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' },
            },
            { id: 'created-provider', kind: 'ssh_host', name: 'created', locator: 'created-host' },
            { actor: accountId, stamp: { by: accountId, at: 10 }, auditId: 'delegated' },
          ),
        ).toEqual({ kind: 'forbidden', permission: 'organization.manage_directory' });
        expect(snapshotProviders()).toEqual(before);
      } finally {
        connection.close();
      }
    },
  );
  it('refuses inactive compute-provider ' + operation + ' at its direct owner', async () => {
    harness.close();
    await openProviderOrganization(false);
    const connection = openConnection(harness.sqlite.filename);
    const providers = new ComputeProviderRepository(connection.db, new WriteCoordinator());
    const accountId = harness.userId('granted');
    const before = snapshotProviders();
    try {
      expect(
        await invokeProvider(
          providers,
          operation,
          { id: accountId },
          { id: 'created-provider', kind: 'ssh_host', name: 'created', locator: 'created-host' },
          { actor: accountId, stamp: { by: accountId, at: 10 }, auditId: 'inactive' },
        ),
      ).toEqual(
        operation === 'register' || operation === 'update' ? { kind: 'inactive' } : 'inactive',
      );
      expect(snapshotProviders()).toEqual(before);
    } finally {
      connection.close();
    }
  });
  it(
    'throws on missing compute-provider ' + operation + ' grant state without effects',
    async () => {
      harness.sqlite.run('ALTER TABLE access_grant RENAME TO unreadable_access_grant');
      const connection = openConnection(harness.sqlite.filename);
      const providers = new ComputeProviderRepository(connection.db, new WriteCoordinator());
      const accountId = harness.userId('granted');
      const before = snapshotProviders();
      try {
        const failure = await readProviderFailure(
          invokeProvider(
            providers,
            operation,
            { id: accountId },
            { id: 'created-provider', kind: 'ssh_host', name: 'created', locator: 'created-host' },
            { actor: accountId, stamp: { by: accountId, at: 10 }, auditId: 'missing' },
          ),
        );
        expect(failure.message).toMatch(/access_grant/);
        expect(snapshotProviders()).toEqual(before);
      } finally {
        connection.close();
      }
    },
  );
  if (operation === 'list') continue;
  for (const mismatch of ['actor', 'stamp'] as const) {
    it(
      'rejects compute-provider ' + operation + ' ' + mismatch + ' mismatch before taking its turn',
      async () => {
        const connection = openConnection(harness.sqlite.filename);
        let turns = 0;
        const providers = new ComputeProviderRepository(connection.db, {
          enter: (work) => {
            turns += 1;
            return work();
          },
        });
        const accountId = harness.userId('granted');
        const before = snapshotProviders();
        try {
          const failure = await readProviderFailure(
            Promise.resolve().then(() =>
              invokeProvider(
                providers,
                operation,
                { id: accountId },
                {
                  id: 'created-provider',
                  kind: 'ssh_host',
                  name: 'created',
                  locator: 'created-host',
                },
                {
                  actor: mismatch === 'actor' ? harness.userId('role-only') : accountId,
                  stamp: {
                    by: mismatch === 'stamp' ? harness.userId('role-only') : accountId,
                    at: 10,
                  },
                  auditId: 'mismatch',
                },
              ),
            ),
          );
          expect(failure.message).toBe('security principal differs from the audited actor');
          expect(turns).toBe(0);
          expect(snapshotProviders()).toEqual(before);
        } finally {
          connection.close();
        }
      },
    );
  }
  it('rolls compute-provider ' + operation + ' back on its late audit failure', async () => {
    const action =
      operation === 'register' ? 'registered' : operation === 'update' ? 'updated' : 'removed';
    harness.sqlite.run(
      "CREATE TRIGGER refuse_provider_audit BEFORE INSERT ON organization_audit WHEN NEW.action='compute_provider_" +
        action +
        "' BEGIN SELECT RAISE(ABORT,'injected provider audit failure'); END",
    );
    const before = snapshotProviders();
    const answer =
      operation === 'register'
        ? await harness.call('granted', 'POST', path, {
            kind: 'ssh_host',
            name: 'created',
            locator: 'created-host',
          })
        : operation === 'update'
          ? await harness.call('granted', 'PATCH', path + '/provider', { name: 'updated' })
          : await harness.call('granted', 'DELETE', path + '/provider');
    expect(answer.status).toBe(500);
    expect(snapshotProviders()).toEqual(before);
  });
}

function seedProviderReadings(): void {
  const accountId = harness.userId('granted');
  harness.sqlite.run(
    "INSERT INTO person(id,name,kind,account_id) VALUES ('reporter','Reporter','agent',?)",
    [accountId],
  );
  harness.sqlite.run(
    "INSERT INTO person_organization(resource_id,organization_id,name) VALUES ('reporter','org-a','Reporter')",
  );
  for (const id of ['r-a', 'r-b']) {
    harness.sqlite.run(
      "INSERT INTO resource(id,name,kind,unit_label,provider_id) VALUES (?,?,'divisible','GB','provider')",
      [id, id],
    );
    harness.sqlite.run(
      'INSERT INTO resource_organization(resource_id,organization_id,name) VALUES (?,?,?)',
      [id, 'org-a', id],
    );
    harness.sqlite.run(
      "INSERT INTO resource_capacity_report(resource_id,provider_id,observed_at,cadence_seconds,outcome,capacity_units,usage_units,reported_by_person_id,reported_at) VALUES (?,'provider',10,60,'measured',10,2,'reporter',10)",
      [id],
    );
  }
}
for (const fails of [false, true]) {
  it(
    'serializes provider readings behind an actual ' +
      (fails ? 'failed' : 'committed') +
      ' administration grant await',
    async () => {
      seedProviderReadings();
      let nativeOwners = 0;
      const connection = openConnection(harness.sqlite.filename, undefined, () => {
        nativeOwners += 1;
      });
      const providers = new ComputeProviderRepository(connection.db, new WriteCoordinator());
      const held = Promise.withResolvers<undefined>();
      const entered = Promise.withResolvers<undefined>();
      const observer = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
      const original = observer.getMockImplementation();
      if (original === undefined) throw new Error('decision implementation absent');
      observer.mockImplementation(async function (
        this: AccessDecisionRepository,
        principal,
        target,
      ) {
        entered.resolve(undefined);
        await held.promise;
        return original.call(this, principal, target);
      });
      if (fails)
        harness.sqlite.run(
          "CREATE TRIGGER refuse_provider_update_audit BEFORE INSERT ON organization_audit WHEN NEW.action='compute_provider_updated' BEGIN SELECT RAISE(ABORT,'injected provider audit failure'); END",
        );
      const accountId = harness.userId('granted');
      const updating = providers
        .update(
          'org-a',
          { id: accountId },
          'provider',
          { name: 'committed-provider' },
          { actor: accountId, stamp: { by: accountId, at: 20 }, auditId: 'update' },
        )
        .then(
          (value) => value,
          (failure: unknown) => failure,
        );
      await entered.promise;
      let readingsSettled = false;
      const reading = providers.readingsOf(['r-a']).finally(() => {
        readingsSettled = true;
      });
      try {
        await Bun.sleep(10);
        expect(readingsSettled).toBe(false);
        expect(nativeOwners).toBe(0);
        held.resolve(undefined);
        observer.mockRestore();
        const updated = await updating;
        if (fails) expect(updated).toBeInstanceOf(Error);
        else expect(updated).toMatchObject({ kind: 'updated' });
        const read = await reading;
        expect(nativeOwners).toBe(1);
        expect(read.get('r-a')).toMatchObject({
          provider: { id: 'provider', name: fails ? 'existing' : 'committed-provider' },
          report: {
            providerId: 'provider',
            outcome: { kind: 'measured', capacityUnits: 10, usageUnits: 2 },
          },
          hostJobs: [],
        });
      } finally {
        held.resolve(undefined);
        observer.mockRestore();
        try {
          await Promise.all([updating, reading]);
        } finally {
          connection.close();
        }
      }
    },
  );
}
it('retains queued provider reading resource IDs without caller aliases', async () => {
  seedProviderReadings();
  const connection = openConnection(harness.sqlite.filename);
  const gate = new WriteCoordinator();
  const providers = new ComputeProviderRepository(connection.db, gate);
  const held = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const blocker = gate.enter(async () => {
    entered.resolve(undefined);
    await held.promise;
  });
  await entered.promise;
  const resourceIds = ['r-a'];
  const pending = providers.readingsOf(resourceIds);
  resourceIds[0] = 'r-b';
  held.resolve(undefined);
  await blocker;
  try {
    expect([...(await pending).keys()]).toEqual(['r-a']);
  } finally {
    connection.close();
  }
});

for (const operation of ['list', 'register', 'update', 'remove'] as const) {
  it(
    'retains compute-provider ' +
      operation +
      ' queued machine cap beside its own grant and account authority',
    async () => {
      const accountId = harness.userId('granted');
      addAgentPerson(harness.sqlite, 'provider-agent', 'org-a', accountId);
      const credential = await issueApiKey(harness.sqlite, {
        organizationId: 'org-a',
        personId: 'provider-agent',
        issuedBy: accountId,
      });
      grantCredential(harness.sqlite, 'org-a', credential.id, 'org-admin', 'organization', 'org-a');
      const connection = openConnection(harness.sqlite.filename);
      const gate = new WriteCoordinator();
      const providers = new ComputeProviderRepository(connection.db, gate);
      const held = Promise.withResolvers<undefined>();
      const entered = Promise.withResolvers<undefined>();
      const blocker = gate.enter(async () => {
        entered.resolve(undefined);
        await held.promise;
      });
      await entered.promise;
      const principal: { id: string; authentication?: CredentialAuthentication } = {
        id: accountId,
        authentication: {
          kind: 'machine',
          credentialId: credential.id,
          personId: 'provider-agent',
        },
      };
      const before = snapshotProviders();
      const pending = invokeProvider(
        providers,
        operation,
        principal,
        { id: 'created-provider', kind: 'ssh_host', name: 'created', locator: 'created-host' },
        { actor: accountId, stamp: { by: accountId, at: 10 }, auditId: 'capped' },
      );
      delete principal.authentication;
      held.resolve(undefined);
      await blocker;
      try {
        expect(await pending).toEqual({
          kind: 'forbidden',
          permission: 'organization.manage_directory',
        });
        expect(snapshotProviders()).toEqual(before);
      } finally {
        connection.close();
      }
    },
  );
  it(
    'uses the actual composed compute-provider ' + operation + ' gate and current grant',
    async () => {
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
          : operation === 'register'
            ? harness.call('granted', 'POST', path, {
                kind: 'ssh_host',
                name: 'created',
                locator: 'created-host',
              })
            : operation === 'update'
              ? harness.call('granted', 'PATCH', path + '/provider', { name: 'updated' })
              : harness.call('granted', 'DELETE', path + '/provider')
      ).finally(() => {
        settled = true;
      });
      const before = snapshotProviders();
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
      expect(await pending).toEqual({
        status: 403,
        body: { error: 'forbidden', permission: 'organization.manage_directory' },
      });
      expect(snapshotProviders()).toEqual(before);
    },
  );
}

it('keeps the compute-provider list grant await inside its immediate owner', async () => {
  const connection = openConnection(harness.sqlite.filename);
  const providers = new ComputeProviderRepository(connection.db, new WriteCoordinator());
  const held = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const observer = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
  const original = observer.getMockImplementation();
  if (original === undefined) throw new Error('decision implementation absent');
  observer.mockImplementation(async function (this: AccessDecisionRepository, principal, target) {
    entered.resolve(undefined);
    await held.promise;
    return original.call(this, principal, target);
  });
  const pending = providers.list('org-a', { id: harness.userId('granted') });
  await entered.promise;
  harness.sqlite.run('PRAGMA busy_timeout=0');
  try {
    expect(() =>
      harness.sqlite.run("UPDATE organization SET name='concurrent' WHERE id='org-a'"),
    ).toThrow(/busy|locked/);
    held.resolve(undefined);
    expect(await pending).toMatchObject([{ id: 'provider' }]);
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

for (const outcomeKind of ['measured-absent', 'measured-zero', 'unreachable'] as const) {
  it(
    'retains queued capacity report ' + outcomeKind + ' request fields and nested outcome',
    async () => {
      seedProviderReadings();
      harness.sqlite.run(
        "INSERT INTO person(id,name,kind) VALUES ('substitute-agent','Substitute','agent')",
      );
      const connection = openConnection(harness.sqlite.filename);
      const gate = new WriteCoordinator();
      const providers = new ComputeProviderRepository(connection.db, gate);
      const held = Promise.withResolvers<undefined>();
      const entered = Promise.withResolvers<undefined>();
      const blocker = gate.enter(async () => {
        entered.resolve(undefined);
        await held.promise;
      });
      await entered.promise;
      const outcome =
        outcomeKind === 'unreachable'
          ? { kind: 'unreachable' as const, reason: 'offline' }
          : {
              kind: 'measured' as const,
              capacityUnits: 15,
              usageUnits: 4,
              ...(outcomeKind === 'measured-zero'
                ? { reservedUnits: 0, reservedDimension: 'memoryGib' }
                : {}),
            };
      const request = {
        organizationId: 'org-a',
        personId: 'reporter',
        providerId: 'provider',
        resourceId: 'r-a',
        now: 30,
        body: { observedAt: 20, cadenceSeconds: 60, outcome },
      };
      const pending = providers.put(request);
      request.organizationId = 'foreign';
      request.personId = 'substitute-agent';
      request.providerId = 'foreign-provider';
      request.resourceId = 'r-b';
      request.now = 99;
      request.body.observedAt = 40;
      request.body.cadenceSeconds = 120;
      if (request.body.outcome.kind === 'measured') {
        request.body.outcome.capacityUnits = 99;
        request.body.outcome.usageUnits = 90;
        request.body.outcome.reservedUnits = 88;
        request.body.outcome.reservedDimension = 'substitute';
      } else request.body.outcome.reason = 'substitute';
      held.resolve(undefined);
      await blocker;
      try {
        const expectedOutcome: CapacityOutcome =
          outcomeKind === 'unreachable'
            ? { kind: 'unreachable', reason: 'offline' }
            : {
                kind: 'measured',
                capacityUnits: 15,
                usageUnits: 4,
                ...(outcomeKind === 'measured-zero'
                  ? { reservedUnits: 0, reservedDimension: 'memoryGib' }
                  : {}),
              };
        expect(await pending).toEqual({
          kind: 'store',
          report: {
            providerId: 'provider',
            reportedBy: 'reporter',
            reportedAt: 30,
            observedAt: 20,
            cadenceSeconds: 60,
            outcome: expectedOutcome,
          },
        });
        expect(
          harness.sqlite
            .query("SELECT observed_at FROM resource_capacity_report WHERE resource_id='r-b'")
            .get(),
        ).toEqual({ observed_at: 10 });
      } finally {
        connection.close();
      }
    },
  );
}
it('retains the capacity report clock so a queued alias cannot admit a future report', async () => {
  seedProviderReadings();
  const connection = openConnection(harness.sqlite.filename);
  const gate = new WriteCoordinator();
  const providers = new ComputeProviderRepository(connection.db, gate);
  const held = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const blocker = gate.enter(async () => {
    entered.resolve(undefined);
    await held.promise;
  });
  await entered.promise;
  const request = {
    organizationId: 'org-a',
    personId: 'reporter',
    providerId: 'provider',
    resourceId: 'r-a',
    now: 30,
    body: {
      observedAt: 600_030,
      cadenceSeconds: 60,
      outcome: { kind: 'measured' as const, capacityUnits: 15, usageUnits: 4 },
    },
  };
  const before = harness.sqlite
    .query('SELECT * FROM resource_capacity_report ORDER BY resource_id')
    .all();
  const pending = providers.put(request);
  request.now = 600_030;
  held.resolve(undefined);
  await blocker;
  try {
    expect(await pending).toEqual({
      kind: 'refused',
      refusal: { kind: 'observedAt_in_future', skewMs: 600_000 },
    });
    expect(
      harness.sqlite.query('SELECT * FROM resource_capacity_report ORDER BY resource_id').all(),
    ).toEqual(before);
  } finally {
    connection.close();
  }
});
for (const changed of ['targets', 'measured', 'unreachable', 'clock'] as const) {
  it(
    changed === 'clock'
      ? 'keeps the capacity report clock at post-resolution admission'
      : 'retains capacity report ' + changed + ' payload before the bound route resolver await',
    async () => {
      seedProviderReadings();
      if (changed === 'targets') {
        harness.organization('org-b');
        harness.sqlite.run(
          "INSERT INTO compute_provider(id,organization_id,kind,name,locator,created_at) VALUES ('foreign-provider','org-b','ssh_host','Foreign','foreign',1)",
        );
        harness.sqlite.run(
          "INSERT INTO resource(id,name,kind,unit_label,provider_id) VALUES ('foreign-resource','Foreign RAM','divisible','GB','foreign-provider')",
        );
        harness.sqlite.run(
          "INSERT INTO resource_organization(resource_id,organization_id,name) VALUES ('foreign-resource','org-b','Foreign RAM')",
        );
      }
      const connection = openConnection(harness.sqlite.filename);
      const providers = new ComputeProviderRepository(connection.db, new WriteCoordinator());
      const held = Promise.withResolvers<undefined>();
      const entered = Promise.withResolvers<undefined>();
      const accountId = harness.userId('granted');
      const organizations: OrganizationAccess = {
        resolve: async () => {
          entered.resolve(undefined);
          await held.promise;
          return {
            ok: true,
            access: {
              kind: 'scoped',
              scope: { organizationId: 'org-a', userId: accountId, role: 'viewer', cap: null },
              principal: {
                id: accountId,
                authentication: {
                  kind: 'machine',
                  credentialId: 'verified-machine',
                  personId: 'reporter',
                },
              },
            },
          };
        },
      };
      let now = 30;
      let clockReads = 0;
      const endpoint = computeProviderRoutes(organizations, providers, providers, {
        now: () => {
          clockReads += 1;
          return now;
        },
      })[4];
      const params = { providerId: 'provider', resourceId: 'r-a' };
      const body = {
        observedAt: 20,
        cadenceSeconds: 60,
        outcome:
          changed === 'unreachable'
            ? { kind: 'unreachable' as const, reason: 'offline' }
            : {
                kind: 'measured' as const,
                capacityUnits: 15,
                usageUnits: 4,
                reservedUnits: 0,
                reservedDimension: 'memoryGib',
              },
      };
      const pending = endpoint.handle({
        principal: {
          id: accountId,
          username: 'granted',
          scopes: ['read', 'write'],
          authentication: {
            kind: 'machine',
            credentialId: 'verified-machine',
            personId: 'reporter',
          },
        },
        params,
        query: undefined,
        body,
        request: {
          method: 'PUT',
          url: new URL('http://localhost'),
          headers: new Headers(),
          signal: new AbortController().signal,
        },
      });
      await entered.promise;
      now = 50;
      if (changed === 'targets') {
        params.providerId = 'foreign-provider';
        params.resourceId = 'foreign-resource';
      } else if (changed !== 'clock') {
        body.observedAt = 40;
        body.cadenceSeconds = 120;
        if (body.outcome.kind === 'measured') {
          body.outcome.capacityUnits = 99;
          body.outcome.usageUnits = 90;
          body.outcome.reservedUnits = 88;
          body.outcome.reservedDimension = 'substitute';
        } else body.outcome.reason = 'substitute';
      }
      held.resolve(undefined);
      try {
        const answered = await pending;
        expect(answered.status).toBe(200);
        expect(clockReads).toBe(1);
        expect(answered.body).toMatchObject({
          providerId: 'provider',
          reportedBy: 'reporter',
          reportedAt: 50,
          observedAt: 20,
          cadenceSeconds: 60,
          outcome:
            changed === 'unreachable'
              ? { kind: 'unreachable', reason: 'offline' }
              : {
                  kind: 'measured',
                  capacityUnits: 15,
                  usageUnits: 4,
                  reservedUnits: 0,
                  reservedDimension: 'memoryGib',
                },
        });
        expect(
          harness.sqlite
            .query("SELECT observed_at FROM resource_capacity_report WHERE resource_id='r-b'")
            .get(),
        ).toEqual({ observed_at: 10 });
        if (changed === 'targets') {
          expect(
            harness.sqlite
              .query("SELECT provider_id FROM resource WHERE id='foreign-resource'")
              .get(),
          ).toEqual({ provider_id: 'foreign-provider' });
          expect(
            harness.sqlite
              .query("SELECT * FROM resource_capacity_report WHERE resource_id='foreign-resource'")
              .all(),
          ).toEqual([]);
        }
      } finally {
        connection.close();
      }
    },
  );
}

async function readProviderFailure(pending: Promise<unknown>): Promise<Error> {
  const failure = await pending.then(
    () => null,
    (failure: unknown) => failure,
  );
  if (!(failure instanceof Error))
    throw new Error('expected production provider rejection', { cause: failure });
  return failure;
}

it('retains parsed provider cascade intent before the bound resolver await', async () => {
  seedProviderReadings();
  const connection = openConnection(harness.sqlite.filename);
  const providers = new ComputeProviderRepository(connection.db, new WriteCoordinator());
  const held = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const accountId = harness.userId('granted');
  const organizations: OrganizationAccess = {
    resolve: async () => {
      entered.resolve(undefined);
      await held.promise;
      return {
        ok: true,
        access: {
          kind: 'scoped',
          scope: { organizationId: 'org-a', userId: accountId, role: 'viewer', cap: null },
          principal: { id: accountId },
        },
      };
    },
  };
  const endpoint = computeProviderRoutes(organizations, providers, providers, { now: () => 30 })[3];
  const query: { cascade?: 'true' } = {};
  const before = [
    'compute_provider',
    'resource',
    'resource_capacity_report',
    'organization_audit',
  ].map((table) => harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
  const pending = endpoint.handle({
    principal: { id: accountId, username: 'granted', scopes: ['read', 'write'] },
    params: { id: 'provider' },
    query,
    body: undefined,
    request: {
      method: 'DELETE',
      url: new URL('http://localhost'),
      headers: new Headers(),
      signal: new AbortController().signal,
    },
  });
  await entered.promise;
  query.cascade = 'true';
  held.resolve(undefined);
  try {
    const answer = await pending;
    expect(answer).toMatchObject({
      ok: false,
      status: 409,
      body: { error: 'in_use', resources: [{ id: 'r-a' }, { id: 'r-b' }] },
    });
    expect(
      ['compute_provider', 'resource', 'resource_capacity_report', 'organization_audit'].map(
        (table) => harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
      ),
    ).toEqual(before);
  } finally {
    connection.close();
  }
});
