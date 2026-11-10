import { authorize, type ResourceAccess, type ResourceRuntimeActor } from '@wbs/core';
import { resourceUseActorOf } from '@wbs/core/http/resource-use.routes';
import { CONTRIBUTOR_CAP } from '@wbs/domain';
import { AccessDecisionRepository } from '@wbs/store-sqlite/access-decisions';
import { openConnection } from '@wbs/store-sqlite/db';
import { WriteCoordinator } from '@wbs/store-sqlite/gate';
import { SqliteResourceRuntime } from '@wbs/store-sqlite/resource-runtime';
import { SqliteResourceUses } from '@wbs/store-sqlite/resource-use';
import { afterEach, beforeAll, beforeEach, expect, it, spyOn } from 'bun:test';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import { type HarnessMachineGrants, OrganizationHarness } from '../testing/organization-harness';

type Logger = NonNullable<Parameters<typeof openConnection>[1]>;

let harness: OrganizationHarness;
let machineGrants: HarnessMachineGrants;
beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
});
let projectId: string;
let workItemId: string;
let resourceId: string;
let path: string;
beforeEach(async () => {
  harness = OrganizationHarness.openComposedWith({ machineGrants });
  for (const username of ['keeper', 'reporter', 'reader']) await harness.register(username);
  harness.organization('org-a');
  harness.organization('org-b');
  harness.member('org-a', 'keeper', 'admin', ['org-super-admin']);
  harness.member('org-a', 'reporter', 'super_admin');
  harness.member('org-a', 'reader', 'viewer', ['org-viewer']);
  for (const username of ['keeper', 'reporter', 'reader']) harness.bind(username, 'org-a');
  harness.activate();
  addAgentPerson(harness.sqlite, 'reporting-agent', 'org-a', harness.userId('keeper'));
  const created = await harness.call('keeper', 'POST', '/api/projects', {
    name: 'Permission plan',
  });
  expect(created.status).toBe(200);
  projectId = (created.body as { project: { id: string } }).project.id;
  const work = await harness.call('keeper', 'POST', '/api/projects/' + projectId + '/commands', {
    commands: [{ kind: 'createWorkItem', parentId: null, name: 'Tracked work' }],
  });
  expect(work.status).toBe(200);
  workItemId = (work.body as { results: { id: string }[] }).results[0].id;
  const directory = await harness.call('keeper', 'POST', '/api/directory/commands', {
    commands: [
      { kind: 'createResource', name: 'Tracked disk', resourceKind: 'divisible', unitLabel: 'GB' },
    ],
  });
  expect(directory.status).toBe(200);
  resourceId = (directory.body as { results: { id: string }[] }).results[0].id;
  path = '/api/projects/' + projectId + '/resource-uses';
});
afterEach(async () => harness.closeComposed());
function draft() {
  return {
    requestId: crypto.randomUUID(),
    resourceId,
    workItemId,
    agentRun: 'run-a',
    responsiblePersonId: 'reporting-agent',
    locator: '/tracked/checkout',
    units: 2,
  };
}
function captureState() {
  return [
    'resource_use',
    'resource_use_event',
    'resource_authority',
    'resource_runtime_use',
    'resource_runtime_event',
    'resource_host_job',
    'resource_cleanup_request',
    'organization_audit',
    'event_log',
  ].map((table) => harness.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
}
async function register() {
  const answer = await harness.call('keeper', 'POST', path, draft());
  expect(answer.status).toBe(201);
  return (answer.body as { use: { id: string } }).use.id;
}
it('hides a live package from role-only resource registration without effects', async () => {
  const before = captureState();
  const hidden = await harness.call('reporter', 'POST', path, draft());
  const absent = await harness.call(
    'reporter',
    'POST',
    '/api/projects/absent/resource-uses',
    draft(),
  );
  expect(hidden.status).toBe(404);
  expect(hidden.body).toEqual(absent.body);
  expect(captureState()).toEqual(before);
});
it('encodes package.write for a readable resource registration denial without effects', async () => {
  const before = captureState();
  const answer = await harness.call('reader', 'POST', path, draft());
  expect(answer.status).toBe(403);
  expect(answer.body).toEqual({ error: 'forbidden', permission: 'package.write' });
  expect(captureState()).toEqual(before);
});
it('encodes package.write for a readable resource event denial without effects', async () => {
  const useId = await register();
  const before = captureState();
  const answer = await harness.call('reader', 'POST', path + '/' + useId + '/events', {
    eventId: 'read-only-cleanup',
    expectedRevision: 1,
    kind: 'cleanup_requested',
    reason: 'Operator cleanup',
  });
  expect(answer.status).toBe(403);
  expect(answer.body).toEqual({ error: 'forbidden', permission: 'package.write' });
  expect(captureState()).toEqual(before);
});
it('uses minimal current resource grants instead of the compatibility viewer role', async () => {
  harness.sqlite.run("UPDATE organization_membership SET role='viewer' WHERE user_id=?", [
    harness.userId('reporter'),
  ]);
  harness.grantPermissions('org-a', 'reporter', ['package.read', 'package.write']);
  const created = await harness.call('reporter', 'POST', path, draft());
  expect(created.status).toBe(201);
  const useId = (created.body as { use: { id: string } }).use.id;
  expect((await harness.call('reporter', 'GET', path)).status).toBe(200);
  expect((await harness.call('reporter', 'GET', path + '/' + useId + '/history')).status).toBe(200);
  expect(
    (
      await harness.call('reporter', 'POST', path + '/' + useId + '/events', {
        eventId: 'custom-cleanup',
        expectedRevision: 1,
        kind: 'cleanup_requested',
        reason: 'Operator cleanup',
      })
    ).status,
  ).toBe(200);
});
it('hides live resource lists and history from role-only members', async () => {
  const useId = await register();
  const before = captureState();
  for (const suffix of ['', '/' + useId + '/history']) {
    const hidden = await harness.call('reporter', 'GET', path + suffix);
    const absent = await harness.call(
      'reporter',
      'GET',
      '/api/projects/absent/resource-uses' + suffix,
    );
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(absent.body);
  }
  expect(captureState()).toEqual(before);
});
async function binding() {
  const provider = await harness.call('keeper', 'POST', '/api/organization/compute-providers', {
    kind: 'ssh_host',
    name: 'Reporting host',
    locator: 'display-only',
  });
  expect(provider.status).toBe(201);
  const providerId = (provider.body as { id: string }).id;
  const credential = await issueApiKey(harness.sqlite, {
    organizationId: 'org-a',
    personId: 'reporting-agent',
    issuedBy: harness.userId('keeper'),
  });
  return { providerId, credentialId: credential.id, epoch: 'original-epoch' };
}
it('uses minimal manage_directory instead of the compatibility viewer role for authority bind and read', async () => {
  const body = await binding();
  harness.sqlite.run("UPDATE organization_membership SET role='viewer' WHERE user_id=?", [
    harness.userId('reporter'),
  ]);
  harness.grantPermissions('org-a', 'reporter', ['organization.manage_directory']);
  const endpoint = '/api/organization/resource-authorities/reporting-authority';
  expect((await harness.call('reporter', 'PUT', endpoint, body)).status).toBe(200);
  expect((await harness.call('reporter', 'GET', endpoint)).status).toBe(200);
});
it('encodes manage_directory for role-only runtime authority bind and read without effects', async () => {
  const body = await binding();
  const endpoint = '/api/organization/resource-authorities/reporting-authority';
  expect((await harness.call('keeper', 'PUT', endpoint, body)).status).toBe(200);
  const before = captureState();
  const put = await harness.call('reporter', 'PUT', endpoint, body);
  const get = await harness.call('reporter', 'GET', endpoint);
  expect(put.status).toBe(403);
  expect(put.body).toEqual({ error: 'forbidden', permission: 'organization.manage_directory' });
  expect(get.status).toBe(403);
  expect(get.body).toEqual({ error: 'forbidden', permission: 'organization.manage_directory' });
  expect(captureState()).toEqual(before);
});

function deletePlanningRows() {
  harness.sqlite.run('DELETE FROM work_item WHERE id=?', [workItemId]);
  harness.sqlite.run('DELETE FROM project_access WHERE project_id=?', [projectId]);
  harness.sqlite.run('DELETE FROM step WHERE project_id=?', [projectId]);
  harness.sqlite.run('DELETE FROM project WHERE id=?', [projectId]);
}
it('uses minimal manage_directory for immutable personal orphan reads and updates', async () => {
  const useId = await register();
  deletePlanningRows();
  harness.sqlite.run("UPDATE organization_membership SET role='viewer' WHERE user_id=?", [
    harness.userId('reporter'),
  ]);
  harness.grantPermissions('org-a', 'reporter', ['organization.manage_directory']);
  expect((await harness.call('reporter', 'GET', path)).status).toBe(200);
  expect((await harness.call('reporter', 'GET', path + '/' + useId + '/history')).status).toBe(200);
  expect(
    (
      await harness.call('reporter', 'POST', path + '/' + useId + '/events', {
        eventId: 'orphan-cleanup',
        expectedRevision: 1,
        kind: 'cleanup_requested',
        reason: 'Operator cleanup',
      })
    ).status,
  ).toBe(200);
});
it('conceals personal orphan history and updates from role-only administrators', async () => {
  const useId = await register();
  deletePlanningRows();
  const before = captureState();
  for (const suffix of ['', '/' + useId + '/history']) {
    const hidden = await harness.call('reporter', 'GET', path + suffix);
    const absent = await harness.call(
      'reporter',
      'GET',
      '/api/projects/absent/resource-uses' + suffix,
    );
    expect(hidden.status).toBe(404);
    expect(hidden.body).toEqual(absent.body);
  }
  const denied = await harness.call('reporter', 'POST', path + '/' + useId + '/events', {
    eventId: 'denied-orphan-cleanup',
    expectedRevision: 1,
    kind: 'cleanup_requested',
    reason: 'Operator cleanup',
  });
  expect(denied.status).toBe(404);
  expect(denied.body).toEqual({ error: 'not_found' });
  expect(captureState()).toEqual(before);
});

async function openManualMachine(logger?: Logger) {
  const credential = await issueApiKey(harness.sqlite, {
    organizationId: 'org-a',
    personId: 'reporting-agent',
    issuedBy: harness.userId('keeper'),
  });
  harness.sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('own-manual-grant','org-a','organization','org-a','machine_credential',?,'project-contributor','route',1)",
    [credential.id],
  );
  const principal = await harness.authenticatedMachinePrincipal(credential.key);
  const access: Extract<ResourceAccess, { kind: 'scoped' }> = {
    kind: 'scoped',
    scope: {
      organizationId: 'org-a',
      userId: principal.id,
      role: 'admin',
      cap: CONTRIBUTOR_CAP,
      delegated: true,
    },
    principal: { id: principal.id, authentication: structuredClone(principal.authentication) },
  };
  const connection = openConnection(harness.databasePath(), logger),
    gate = new WriteCoordinator();
  return {
    credential,
    principal,
    actor: resourceUseActorOf(principal, access),
    connection,
    gate,
    uses: new SqliteResourceUses(connection.db, gate),
  };
}
const manualOperations = ['register', 'append', 'list', 'history'] as const;
function invokeManual(
  boundary: Awaited<ReturnType<typeof openManualMachine>>,
  operation: (typeof manualOperations)[number],
  useId: string,
): Promise<unknown> {
  switch (operation) {
    case 'register':
      return boundary.uses.register(projectId, boundary.actor, draft(), 123);
    case 'append':
      return boundary.uses.append(
        projectId,
        useId,
        boundary.actor,
        {
          eventId: 'freshness-cleanup',
          expectedRevision: 1,
          kind: 'cleanup_requested',
          reason: 'Operator cleanup',
        },
        123,
      );
    case 'list':
      return boundary.uses.list(projectId, boundary.actor, { limit: 50 });
    case 'history':
      return boundary.uses.history(projectId, useId, boundary.actor, { limit: 50 });
  }
}
for (const operation of manualOperations) {
  for (const change of [
    'missing',
    'revoked',
    'unbound',
    'rebound',
    'person',
    'organization',
    'source',
    'kind',
  ] as const) {
    it(
      'rechecks queued manual resource ' +
        operation +
        ' current credential ' +
        change +
        ' despite a sufficient own grant',
      async () => {
        const useId = await register(),
          boundary = await openManualMachine();
        const held = Promise.withResolvers<undefined>(),
          entered = Promise.withResolvers<undefined>();
        const blocker = boundary.gate.enter(() => {
          entered.resolve(undefined);
          return held.promise;
        });
        await entered.promise;
        const pending = invokeManual(boundary, operation, useId);
        try {
          if (change === 'missing') {
            harness.sqlite.run('DELETE FROM machine_credential_secret WHERE credential_id=?', [
              boundary.credential.id,
            ]);
            harness.sqlite.run('DELETE FROM machine_credential WHERE id=?', [
              boundary.credential.id,
            ]);
          }
          if (change === 'revoked')
            harness.sqlite.run('UPDATE machine_credential SET revoked_at=9 WHERE id=?', [
              boundary.credential.id,
            ]);
          if (change === 'unbound')
            harness.sqlite.run("UPDATE person SET account_id=NULL WHERE id='reporting-agent'");
          if (change === 'rebound')
            harness.sqlite.run("UPDATE person SET account_id=? WHERE id='reporting-agent'", [
              harness.userId('reader'),
            ]);
          if (change === 'person') {
            addAgentPerson(harness.sqlite, 'other-agent', 'org-a', harness.userId('keeper'));
            harness.sqlite.run("UPDATE machine_credential SET person_id='other-agent' WHERE id=?", [
              boundary.credential.id,
            ]);
          }
          if (change === 'organization') {
            harness.member('org-b', 'keeper', 'viewer');
            harness.sqlite.run("UPDATE machine_credential SET organization_id='org-b' WHERE id=?", [
              boundary.credential.id,
            ]);
          }
          if (change === 'source')
            harness.sqlite.run(
              "UPDATE machine_credential SET source='mcp_consent',mcp_family_id='changed-family' WHERE id=?",
              [boundary.credential.id],
            );
          if (change === 'kind')
            harness.sqlite.run("UPDATE person SET kind='person' WHERE id='reporting-agent'");
          const before = captureState();
          expect(
            await authorize(
              new AccessDecisionRepository(boundary.connection.db),
              boundary.actor.principal,
              {
                kind: 'work_package',
                chain: { level: 'work_package', organizationId: 'org-a', workPackageId: projectId },
                restricted: false,
              },
              'package.write',
            ),
          ).toMatchObject({ ok: true });
          held.resolve(undefined);
          await blocker;
          expect(await pending).toEqual({ ok: false, reason: 'forbidden' });
          expect(captureState()).toEqual(before);
        } finally {
          held.resolve(undefined);
          try {
            await blocker;
            await pending;
          } finally {
            boundary.connection.close();
          }
        }
      },
    );
  }
  for (const corruption of [
    'missing table',
    'unreadable source',
    'malformed source',
    'malformed revoked_at',
  ] as const) {
    it(
      'throws on manual resource ' + operation + ' ' + corruption + ' with a sufficient own grant',
      async () => {
        const useId = await register(),
          boundary = await openManualMachine();
        if (corruption === 'missing table')
          harness.sqlite.run('ALTER TABLE machine_credential RENAME TO missing_machine_credential');
        if (corruption === 'unreadable source')
          harness.sqlite.run(
            'ALTER TABLE machine_credential RENAME COLUMN source TO unreadable_source',
          );
        if (corruption === 'malformed source' || corruption === 'malformed revoked_at') {
          harness.sqlite.run('PRAGMA ignore_check_constraints=ON');
          try {
            if (corruption === 'malformed source')
              harness.sqlite.run(
                "UPDATE machine_credential SET source='unknown_source' WHERE id=?",
                [boundary.credential.id],
              );
            else
              harness.sqlite.run(
                "UPDATE machine_credential SET revoked_at='unknown_time' WHERE id=?",
                [boundary.credential.id],
              );
          } finally {
            harness.sqlite.run('PRAGMA ignore_check_constraints=OFF');
          }
        }
        const before = captureState();
        expect(
          await authorize(
            new AccessDecisionRepository(boundary.connection.db),
            boundary.actor.principal,
            {
              kind: 'work_package',
              chain: { level: 'work_package', organizationId: 'org-a', workPackageId: projectId },
              restricted: false,
            },
            'package.write',
          ),
        ).toMatchObject({ ok: true });
        try {
          const failure = await invokeManual(boundary, operation, useId).then(
            () => null,
            (failure: unknown) => failure,
          );
          expect(failure).toBeInstanceOf(Error);
          if (!(failure instanceof Error))
            throw new Error('expected unreadable manual credential state');
          if (corruption.startsWith('malformed'))
            expect(failure.message).toMatch(/malformed|revoked_at|source/);
          else
            expect(String(failure) + ' ' + String(failure.cause)).toMatch(
              /machine_credential|source/,
            );
          expect(captureState()).toEqual(before);
        } finally {
          boundary.connection.close();
        }
      },
    );
  }
}

const infrastructureStages = [
  'admission replay',
  'live confirmation',
  'deleted confirmation',
  'event replay',
  'host job',
  'requests',
  'deleted cleanup',
] as const;
type InfrastructureStage = (typeof infrastructureStages)[number];
async function openInfrastructure(stage: InfrastructureStage, logger?: Logger) {
  const boundary = await openManualMachine(logger),
    runtime = new SqliteResourceRuntime(boundary.connection.db, boundary.gate);
  const provider = await harness.call('keeper', 'POST', '/api/organization/compute-providers', {
    kind: 'ssh_host',
    name: 'Runtime source host',
    locator: 'display-only',
  });
  expect(provider.status).toBe(201);
  const authorityId = 'current-source-runtime',
    providerId = (provider.body as { id: string }).id;
  expect(
    (
      await harness.call('keeper', 'PUT', '/api/organization/resource-authorities/' + authorityId, {
        providerId,
        credentialId: boundary.credential.id,
        epoch: 'source-epoch',
      })
    ).status,
  ).toBe(200);
  const runtimeActor = { ...boundary.actor, credentialId: boundary.credential.id };
  const admission = {
    eventId: crypto.randomUUID(),
    epoch: 'source-epoch',
    useId: crypto.randomUUID(),
    incarnation: 'source-incarnation',
    observedAt: 1,
    reason: 'Original admission',
    use: {
      projectId,
      resourceId,
      workItemId,
      agentRun: 'run-a',
      responsiblePersonId: 'reporting-agent',
      locator: '/original-runtime',
      units: 2,
      kind: 'temporary_directory' as const,
      reservedDiskUnits: 2,
      reservedWorkspaceUnits: 1,
    },
  };
  const event = { ...admission, kind: 'registered' as const, sequence: 1, revision: 1 };
  if (
    stage === 'admission replay' ||
    stage === 'live confirmation' ||
    stage === 'deleted confirmation'
  )
    expect(await runtime.admit(authorityId, runtimeActor, admission, 123)).toMatchObject({
      ok: true,
    });
  else if (stage !== 'host job')
    expect(await runtime.ingest(authorityId, runtimeActor, event, 123)).toMatchObject({ ok: true });
  if (stage === 'requests' || stage === 'deleted cleanup')
    expect(
      (
        await harness.call('keeper', 'POST', path + '/' + admission.useId + '/events', {
          eventId: 'pending-source-cleanup',
          expectedRevision: 1,
          kind: 'cleanup_requested',
          reason: 'Operator cleanup',
        })
      ).status,
    ).toBe(200);
  if (stage === 'deleted confirmation' || stage === 'deleted cleanup') deletePlanningRows();
  const invoke = (): Promise<unknown> => {
    switch (stage) {
      case 'admission replay':
        return runtime.admit(authorityId, runtimeActor, admission, 123);
      case 'live confirmation':
      case 'deleted confirmation':
      case 'event replay':
        return runtime.ingest(authorityId, runtimeActor, event, 123);
      case 'requests':
        return runtime.requests(authorityId, runtimeActor, 0, 50);
      case 'deleted cleanup':
        return runtime.ingest(
          authorityId,
          runtimeActor,
          {
            ...event,
            eventId: 'deleted-cleanup-progress',
            kind: 'cleanup_pending',
            sequence: 2,
            revision: 2,
          },
          123,
        );
      case 'host job':
        return runtime.ingest(
          authorityId,
          runtimeActor,
          {
            ...event,
            use: {
              kind: 'host_job',
              projectId,
              workItemId,
              responsiblePersonId: 'reporting-agent',
              type: 'source-check',
              label: 'Host-local job',
              host: 'test-host',
              launcherSha: null,
              reservations: [{ dimension: 'cpuCores', units: 1 }],
            },
          },
          123,
        );
    }
  };
  return { ...boundary, invoke, runtime, runtimeActor, admission, event, authorityId, providerId };
}
for (const stage of infrastructureStages) {
  for (const source of ['mcp_consent', 'unknown_source'] as const) {
    it(
      'rechecks queued runtime ' + stage + ' current source ' + source + ' before effects',
      async () => {
        const boundary = await openInfrastructure(stage),
          held = Promise.withResolvers<undefined>(),
          entered = Promise.withResolvers<undefined>();
        const blocker = boundary.gate.enter(() => {
          entered.resolve(undefined);
          return held.promise;
        });
        await entered.promise;
        const pending = boundary.invoke();
        let hasSettled = false;
        try {
          if (source === 'mcp_consent')
            harness.sqlite.run(
              "UPDATE machine_credential SET source='mcp_consent',mcp_family_id='changed-family' WHERE id=?",
              [boundary.credential.id],
            );
          else {
            harness.sqlite.run('PRAGMA ignore_check_constraints=ON');
            try {
              harness.sqlite.run(
                "UPDATE machine_credential SET source='unknown_source' WHERE id=?",
                [boundary.credential.id],
              );
            } finally {
              harness.sqlite.run('PRAGMA ignore_check_constraints=OFF');
            }
          }
          expect(
            harness.sqlite
              .query<{ role_id: string }, [string]>('SELECT role_id FROM access_grant WHERE id=?')
              .get('own-manual-grant'),
          ).toEqual({ role_id: 'project-contributor' });
          const before = captureState();
          held.resolve(undefined);
          await blocker;
          if (source === 'mcp_consent') {
            const outcome = await pending;
            hasSettled = true;
            expect(outcome).toEqual({ ok: false, reason: 'forbidden' });
          } else {
            const failure = await pending.then(
              () => null,
              (failure: unknown) => failure,
            );
            hasSettled = true;
            expect(failure).toBeInstanceOf(Error);
            if (!(failure instanceof Error))
              throw new Error('expected malformed runtime source failure');
            expect(failure.message).toContain('malformed source');
          }
          expect(captureState()).toEqual(before);
        } finally {
          held.resolve(undefined);
          try {
            await blocker;
            if (!hasSettled) await pending;
          } finally {
            boundary.connection.close();
          }
        }
      },
    );
  }
  it(
    'keeps runtime ' + stage + ' independent of grants and mutable planning references',
    async () => {
      const boundary = await openInfrastructure(stage);
      // Preparation proves fresh live admission separately; this invocation is infrastructure only.
      harness.sqlite.run('ALTER TABLE access_grant RENAME TO unavailable_access_grant');
      if (stage !== 'deleted cleanup')
        harness.sqlite.run('ALTER TABLE project RENAME TO unavailable_project');
      try {
        expect(await boundary.invoke()).toMatchObject({ ok: true });
      } finally {
        try {
          if (stage !== 'deleted cleanup')
            harness.sqlite.run('ALTER TABLE unavailable_project RENAME TO project');
          harness.sqlite.run('ALTER TABLE unavailable_access_grant RENAME TO access_grant');
        } finally {
          boundary.connection.close();
        }
      }
    },
  );
}

for (const operation of manualOperations) {
  for (const alias of [
    'authentication removal',
    'nested authentication',
    'scope organization',
  ] as const) {
    it(
      'retains manual resource ' + operation + ' queued ' + alias + ' before the writer',
      async () => {
        const useId = await register(),
          boundary = await openManualMachine();
        const alternative =
          alias === 'nested authentication'
            ? await issueApiKey(harness.sqlite, {
                organizationId: 'org-a',
                personId: 'reporting-agent',
                issuedBy: harness.userId('keeper'),
                name: 'Alternate reporting key',
              })
            : undefined;
        if (alternative !== undefined)
          harness.sqlite.run(
            "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('alternative-manual-grant','org-a','organization','org-a','machine_credential',?,'project-contributor','route',1)",
            [alternative.id],
          );
        const held = Promise.withResolvers<undefined>(),
          entered = Promise.withResolvers<undefined>();
        const blocker = boundary.gate.enter(() => {
          entered.resolve(undefined);
          return held.promise;
        });
        await entered.promise;
        const pending = invokeManual(boundary, operation, useId);
        try {
          if (alias === 'authentication removal') {
            Object.assign(boundary.actor.principal, {
              authentication: undefined,
              delegation: undefined,
            });
            Object.assign(boundary.actor, {
              personId: null,
              fingerprint: JSON.stringify([boundary.actor.id, 'account', null]),
            });
          } else if (alias === 'nested authentication') {
            if (
              alternative === undefined ||
              boundary.actor.principal.authentication?.kind !== 'machine'
            )
              throw new Error('expected alternate actual machine credential');
            Object.assign(boundary.actor.principal.authentication, {
              credentialId: alternative.id,
            });
          } else {
            if (boundary.actor.access.kind !== 'scoped')
              throw new Error('expected scoped manual actor');
            Object.assign(boundary.actor.access.scope, { organizationId: 'org-b' });
          }
          if (alias !== 'scope organization')
            harness.sqlite.run(
              "UPDATE machine_credential SET source='mcp_consent',mcp_family_id='changed-family' WHERE id=?",
              [boundary.credential.id],
            );
          const before = captureState();
          held.resolve(undefined);
          await blocker;
          if (alias === 'scope organization') expect(await pending).toMatchObject({ ok: true });
          else {
            expect(await pending).toEqual({ ok: false, reason: 'forbidden' });
            expect(captureState()).toEqual(before);
          }
        } finally {
          held.resolve(undefined);
          try {
            await blocker;
            await pending;
          } finally {
            boundary.connection.close();
          }
        }
      },
    );
  }
  it('retains manual resource ' + operation + ' queued payload before the writer', async () => {
    const useId = await register(),
      boundary = await openManualMachine();
    const body = draft(),
      event = {
        eventId: 'original-queued-event',
        expectedRevision: 1,
        kind: 'cleanup_requested' as const,
        reason: 'Original queued reason',
      },
      page: { limit: number; cursor?: string } = { limit: 50 };
    const held = Promise.withResolvers<undefined>(),
      entered = Promise.withResolvers<undefined>();
    const blocker = boundary.gate.enter(() => {
      entered.resolve(undefined);
      return held.promise;
    });
    await entered.promise;
    const pending: Promise<unknown> =
      operation === 'register'
        ? boundary.uses.register(projectId, boundary.actor, body, 123)
        : operation === 'append'
          ? boundary.uses.append(projectId, useId, boundary.actor, event, 123)
          : operation === 'list'
            ? boundary.uses.list(projectId, boundary.actor, page)
            : boundary.uses.history(projectId, useId, boundary.actor, page);
    Object.assign(body, { locator: '/substituted', units: 99 });
    event.reason = 'Substituted queued reason';
    Object.assign(page, { cursor: '999', limit: 1 });
    held.resolve(undefined);
    await blocker;
    try {
      if (operation === 'register')
        expect(await pending).toMatchObject({
          ok: true,
          value: { locator: '/tracked/checkout', units: 2 },
        });
      else if (operation === 'append') {
        expect(await pending).toMatchObject({ ok: true });
        expect(
          (await harness.call('keeper', 'GET', path + '/' + useId + '/history')).body,
        ).toMatchObject({
          events: [
            { kind: 'registered' },
            { kind: 'cleanup_requested', reason: 'Original queued reason' },
          ],
        });
      } else if (operation === 'list')
        expect(await pending).toMatchObject({ ok: true, value: { uses: [{ id: useId }] } });
      else
        expect(await pending).toMatchObject({
          ok: true,
          value: { events: [{ kind: 'registered' }] },
        });
    } finally {
      held.resolve(undefined);
      try {
        await pending;
      } finally {
        boundary.connection.close();
      }
    }
  });
}

const runtimeQueueOperations = ['bind', 'read', 'admit', 'ingest', 'requests'] as const;
type RuntimeQueueOperation = (typeof runtimeQueueOperations)[number];
async function openRuntimeQueue(operation: RuntimeQueueOperation, logger?: Logger) {
  const infrastructure = await openInfrastructure(
    operation === 'admit'
      ? 'admission replay'
      : operation === 'ingest'
        ? 'event replay'
        : operation === 'requests'
          ? 'requests'
          : 'host job',
    logger,
  );
  let requestedActor: ResourceRuntimeActor = infrastructure.runtimeActor;
  if (operation === 'bind' || operation === 'read') {
    const principal = await harness.authenticatedCommandPrincipal('keeper', '');
    requestedActor = {
      ...resourceUseActorOf(principal, {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: principal.id, role: 'admin', cap: null },
        principal: { id: principal.id, authentication: structuredClone(principal.authentication) },
      }),
      credentialId: null,
    };
  }
  const binding = {
    providerId: infrastructure.providerId,
    credentialId: infrastructure.credential.id,
    epoch: 'queued-original-epoch',
  };
  if (operation === 'bind') {
    const provider = await harness.call('keeper', 'POST', '/api/organization/compute-providers', {
      kind: 'ssh_host',
      name: 'Queued binding host',
      locator: 'display-only',
    });
    expect(provider.status).toBe(201);
    binding.providerId = (provider.body as { id: string }).id;
  }

  const invoke = (): Promise<unknown> => {
    switch (operation) {
      case 'bind':
        return infrastructure.runtime.bind('queued-admin-authority', requestedActor, binding, 123);
      case 'read':
        return infrastructure.runtime.read(infrastructure.authorityId, requestedActor);
      case 'admit':
        return infrastructure.runtime.admit(
          infrastructure.authorityId,
          requestedActor,
          infrastructure.admission,
          123,
        );
      case 'ingest':
        return infrastructure.runtime.ingest(
          infrastructure.authorityId,
          requestedActor,
          infrastructure.event,
          123,
        );
      case 'requests':
        return infrastructure.runtime.requests(infrastructure.authorityId, requestedActor, 0, 50);
    }
  };
  return { ...infrastructure, requestedActor, binding, invoke };
}
for (const operation of runtimeQueueOperations) {
  const aliases =
    operation === 'bind' || operation === 'read'
      ? (['id', 'scope organization', 'authentication', 'delegation'] as const)
      : ([
          'id',
          'scope organization',
          'authentication removal',
          'nested authentication',
          'credential',
          'person',
        ] as const);
  for (const alias of aliases) {
    it('retains runtime ' + operation + ' queued ' + alias + ' before the writer', async () => {
      const boundary = await openRuntimeQueue(operation);
      const alternative =
        alias === 'nested authentication' || alias === 'credential'
          ? await issueApiKey(harness.sqlite, {
              organizationId: 'org-a',
              personId: 'reporting-agent',
              issuedBy: harness.userId('keeper'),
              name: 'Runtime alternate key',
            })
          : undefined;
      if (alternative !== undefined)
        harness.sqlite.run(
          "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('runtime-alternate-grant','org-a','organization','org-a','machine_credential',?,'project-contributor','route',1)",
          [alternative.id],
        );
      if (alias === 'id')
        harness.grantPermissions('org-a', 'reporter', ['organization.manage_directory']);
      const actor = boundary.requestedActor,
        originalId = actor.id;
      const held = Promise.withResolvers<undefined>(),
        entered = Promise.withResolvers<undefined>();
      const blocker = boundary.gate.enter(() => {
        entered.resolve(undefined);
        return held.promise;
      });
      await entered.promise;
      const grant = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
      const pending = boundary.invoke();
      try {
        if (alias === 'id') {
          const substituted = harness.userId('reporter');
          Object.assign(actor, { id: substituted });
          Object.assign(actor.principal, { id: substituted });
          if (actor.access.kind !== 'scoped')
            throw new Error('expected queued scoped runtime actor');
          Object.assign(actor.access.scope, { userId: substituted });
          Object.assign(actor.access.principal, { id: substituted });
        } else if (alias === 'scope organization') {
          if (actor.access.kind !== 'scoped')
            throw new Error('expected queued scoped runtime actor');
          Object.assign(actor.access.scope, { organizationId: 'org-b' });
        } else if (alias === 'authentication') {
          if (actor.principal.authentication === undefined)
            throw new Error('expected actual personal authentication');
          Object.assign(actor.principal.authentication, {
            kind: 'machine',
            credentialId: boundary.credential.id,
            personId: 'reporting-agent',
          });
        } else if (alias === 'delegation')
          Object.assign(actor.principal, {
            delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' },
          });
        else if (alias === 'authentication removal')
          Object.assign(actor.principal, { authentication: undefined, delegation: undefined });
        else if (alias === 'nested authentication') {
          if (alternative === undefined || actor.principal.authentication?.kind !== 'machine')
            throw new Error('expected actual alternate machine authentication');
          Object.assign(actor.principal.authentication, { credentialId: alternative.id });
        } else if (alias === 'credential') {
          if (alternative === undefined) throw new Error('expected actual alternate key');
          actor.credentialId = alternative.id;
        } else actor.personId = 'substituted-person';
        if (alias === 'authentication removal' || alias === 'nested authentication')
          harness.sqlite.run(
            "UPDATE machine_credential SET source='mcp_consent',mcp_family_id='changed-family' WHERE id=?",
            [boundary.credential.id],
          );
        const before = captureState();
        held.resolve(undefined);
        await blocker;
        if (alias === 'authentication removal' || alias === 'nested authentication') {
          expect(await pending).toEqual({ ok: false, reason: 'forbidden' });
          expect(captureState()).toEqual(before);
        } else {
          expect(await pending).toMatchObject({ ok: true });
          if (operation === 'bind' || operation === 'read') {
            expect(grant).toHaveBeenCalledTimes(1);
            expect(grant.mock.calls[0]?.[0].id).toBe(originalId);
          }
          if (operation === 'bind')
            expect(
              harness.sqlite
                .query<{ created_by: string }, [string]>(
                  'SELECT created_by FROM resource_authority WHERE authority_id=?',
                )
                .get('queued-admin-authority'),
            ).toEqual({ created_by: originalId });
        }
      } finally {
        held.resolve(undefined);
        grant.mockRestore();
        try {
          await blocker;
          await pending;
        } finally {
          boundary.connection.close();
        }
      }
    });
  }
}
for (const operation of ['bind', 'admit', 'ingest'] as const) {
  it('retains runtime ' + operation + ' queued payload before the writer', async () => {
    const boundary = await openRuntimeQueue(operation),
      held = Promise.withResolvers<undefined>(),
      entered = Promise.withResolvers<undefined>();
    const blocker = boundary.gate.enter(() => {
      entered.resolve(undefined);
      return held.promise;
    });
    await entered.promise;
    const pending = boundary.invoke();
    if (operation === 'bind') boundary.binding.epoch = 'substituted-epoch';
    else if (operation === 'admit') boundary.admission.use.locator = '/substituted-admission';
    else boundary.event.use.locator = '/substituted-event';
    held.resolve(undefined);
    await blocker;
    try {
      expect(await pending).toMatchObject(
        operation === 'bind'
          ? { ok: true, value: { epoch: 'queued-original-epoch' } }
          : { ok: true },
      );
    } finally {
      held.resolve(undefined);
      try {
        await pending;
      } finally {
        boundary.connection.close();
      }
    }
  });
}
for (const field of ['retention', 'evidence', 'host reservations'] as const) {
  it('retains runtime ingest queued nested ' + field + ' before the writer', async () => {
    const boundary = await openRuntimeQueue('ingest');
    const base = boundary.event;
    const retention = { ownerPersonId: 'reporting-agent', reviewAt: 999 },
      evidence = {
        digest: 'a'.repeat(64),
        locator: '/original-proof',
        disposition: 'removed' as const,
        reclaimedBytes: null,
      };
    const retained = {
      ...base,
      eventId: 'retained-payload',
      sequence: 2,
      revision: 2,
      kind: 'retained' as const,
      retention,
    };
    const cleanup = {
      ...base,
      eventId: 'cleanup-payload',
      sequence: 2,
      revision: 2,
      kind: 'cleanup_pending' as const,
    };
    const released = {
      ...base,
      eventId: 'released-payload',
      sequence: 3,
      revision: 3,
      kind: 'release_verified' as const,
      evidence,
    };
    const hostUse = {
      kind: 'host_job' as const,
      type: 'snapshot-test',
      label: 'Host job',
      host: 'test-host',
      launcherSha: null,
      reservations: [{ dimension: 'cpuCores', units: 1 }],
    };
    const host = {
      ...base,
      eventId: 'host-payload',
      useId: crypto.randomUUID(),
      incarnation: 'host-payload-incarnation',
      sequence: 2,
      revision: 1,
      use: hostUse,
    };
    if (field === 'retention')
      expect(
        await boundary.runtime.ingest(boundary.authorityId, boundary.runtimeActor, retained, 123),
      ).toMatchObject({ ok: true });
    if (field === 'evidence') {
      expect(
        await boundary.runtime.ingest(boundary.authorityId, boundary.runtimeActor, cleanup, 123),
      ).toMatchObject({ ok: true });
      expect(
        await boundary.runtime.ingest(boundary.authorityId, boundary.runtimeActor, released, 123),
      ).toMatchObject({ ok: true });
    }
    const originalDeclaration = JSON.stringify(hostUse);
    const held = Promise.withResolvers<undefined>(),
      entered = Promise.withResolvers<undefined>();
    const blocker = boundary.gate.enter(() => {
      entered.resolve(undefined);
      return held.promise;
    });
    await entered.promise;
    const pending = boundary.runtime.ingest(
      boundary.authorityId,
      boundary.runtimeActor,
      field === 'retention' ? retained : field === 'evidence' ? released : host,
      123,
    );
    if (field === 'retention') retention.reviewAt = 9999;
    else if (field === 'evidence') evidence.digest = 'b'.repeat(64);
    else hostUse.reservations[0].units = 99;
    held.resolve(undefined);
    await blocker;
    try {
      expect(await pending).toMatchObject({ ok: true });
      if (field === 'host reservations')
        expect(
          harness.sqlite
            .query<{ declaration: string }, [string]>(
              'SELECT declaration FROM resource_host_job WHERE use_id=?',
            )
            .get(host.useId),
        ).toEqual({ declaration: originalDeclaration });
    } finally {
      held.resolve(undefined);
      try {
        await pending;
      } finally {
        boundary.connection.close();
      }
    }
  });
}

for (const point of ['authority', 'requests'] as const) {
  it(
    'fences a second connection at runtime request ' + point + ' read until settlement',
    async () => {
      let isActive = false,
        hasReadCredential = false,
        hasObservedLock = false;
      let credentialId = '';
      const previous = harness.sqlite.query<{ timeout: number }, []>('PRAGMA busy_timeout').get();
      if (previous === null) throw new Error('runtime read fixture busy timeout unavailable');
      harness.sqlite.run('PRAGMA busy_timeout=0');
      const logger: Logger = {
        logQuery(query) {
          if (!isActive) return;
          const sql = query.toLowerCase();
          if (sql.includes('from machine_credential c')) hasReadCredential = true;
          const selected =
            point === 'authority' ? 'from "resource_authority"' : 'from "resource_cleanup_request"';
          if (sql.includes(selected) && !hasObservedLock) {
            expect(hasReadCredential).toBe(true);
            hasObservedLock = true;
            let blocked: unknown;
            try {
              harness.sqlite.run(
                "UPDATE machine_credential SET source='mcp_consent',mcp_family_id='interleaved-family' WHERE id=?",
                [credentialId],
              );
            } catch (failure) {
              blocked = failure;
            }
            expect(blocked).toMatchObject({ code: 'SQLITE_BUSY' });
          }
        },
      };
      const boundary = await openInfrastructure('requests', logger);
      credentialId = boundary.credential.id;
      const before = captureState();
      isActive = true;
      try {
        expect(await boundary.invoke()).toMatchObject({ ok: true });
        expect(hasObservedLock).toBe(true);
        expect(captureState()).toEqual(before);
        expect(
          harness.sqlite.run(
            "UPDATE machine_credential SET source='mcp_consent',mcp_family_id='after-read-family' WHERE id=?",
            [credentialId],
          ).changes,
        ).toBe(1);
      } finally {
        isActive = false;
        try {
          harness.sqlite.run(
            "UPDATE machine_credential SET source='api_key',mcp_family_id=NULL WHERE id=?",
            [credentialId],
          );
        } finally {
          harness.sqlite.run('PRAGMA busy_timeout=' + String(previous.timeout));
          boundary.connection.close();
        }
      }
    },
  );
}
it('releases the runtime request transaction and gate after a late request SELECT failure', async () => {
  let isActive = false;
  const controls: string[] = [],
    fault = new Error('late runtime cleanup request SELECT');
  const logger: Logger = {
    logQuery(query) {
      const normalized = query.trim().toUpperCase();
      if (['BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK'].includes(normalized)) controls.push(normalized);
      if (isActive && query.toLowerCase().includes('from "resource_cleanup_request"')) throw fault;
    },
  };
  const boundary = await openInfrastructure('requests', logger),
    before = captureState();
  controls.length = 0;
  isActive = true;
  try {
    const failure = await boundary.invoke().then(
      () => null,
      (failure: unknown) => failure,
    );
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error))
      throw new Error('expected original late runtime request failure');
    expect(failure === fault || failure.cause === fault).toBe(true);
    expect(failure).not.toBeInstanceOf(AggregateError);
    expect(controls).toEqual(['BEGIN IMMEDIATE', 'ROLLBACK']);
    expect(captureState()).toEqual(before);
    isActive = false;
    let hasEntered = false;
    await boundary.gate.enter(() => {
      hasEntered = true;
      return Promise.resolve(undefined);
    });
    expect(hasEntered).toBe(true);
    expect(
      harness.sqlite.run("UPDATE machine_credential SET name='After request failure' WHERE id=?", [
        boundary.credential.id,
      ]).changes,
    ).toBe(1);
    expect(await boundary.invoke()).toMatchObject({ ok: true });
    expect(captureState()).toEqual(before);
  } finally {
    isActive = false;
    boundary.connection.close();
  }
});

it('throws on a misbound raw role before actual resource registration despite valid authority', async () => {
  await register();
  harness.sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('misbound-resource-role','org-a','work_package',?,'user',?,'project-contributor','route',1)",
    [projectId, harness.userId('keeper')],
  );
  const before = captureState();
  const answer = await harness.call('keeper', 'POST', path, draft());
  expect(answer.status).toBe(500);
  expect(captureState()).toEqual(before);
});
it('throws on a misbound nonorganization target grant before member summary filtering', async () => {
  harness.grantPermissions('org-a', 'reporter', ['organization.read']);
  expect((await harness.call('keeper', 'GET', '/api/organization/members')).status).toBe(200);
  harness.sqlite.run(
    "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('misbound-summary-role','org-a','work_package',?,'user',?,'project-contributor','route',1)",
    [projectId, harness.userId('reporter')],
  );
  const before = captureState();
  const answer = await harness.call('keeper', 'GET', '/api/organization/members');
  expect(answer.status).toBe(500);
  expect(captureState()).toEqual(before);
});

for (const operation of manualOperations) {
  it(
    'throws on malformed person kind before manual ' + operation + ' despite an own grant',
    async () => {
      const useId = await register(),
        boundary = await openManualMachine();
      try {
        harness.sqlite.run('PRAGMA ignore_check_constraints=ON');
        try {
          harness.sqlite.run("UPDATE person SET kind='unknown_kind' WHERE id='reporting-agent'");
        } finally {
          harness.sqlite.run('PRAGMA ignore_check_constraints=OFF');
        }
        const before = captureState();
        const failure = await invokeManual(boundary, operation, useId).then(
          () => null,
          (failure: unknown) => failure,
        );
        expect(failure).toBeInstanceOf(Error);
        expect(String(failure)).toContain('malformed kind');
        expect(captureState()).toEqual(before);
      } finally {
        boundary.connection.close();
      }
    },
  );
  it(
    'accepts current oidc source for generic machine manual ' + operation + ' with its own grant',
    async () => {
      const useId = await register(),
        boundary = await openManualMachine();
      try {
        harness.sqlite.run(
          "INSERT INTO organization_trusted_issuer(id,organization_id,issuer,jwks_uri,default_audience,created_at) VALUES('resource-issuer','org-a','https://issuer.test','https://issuer.test/jwks','resource-audience',1)",
        );
        harness.sqlite.run(
          "UPDATE machine_credential SET source='oidc',issuer='https://issuer.test',subject='subject-a',trusted_issuer_id='resource-issuer' WHERE id=?",
          [boundary.credential.id],
        );
        expect(await invokeManual(boundary, operation, useId)).toMatchObject({ ok: true });
      } finally {
        boundary.connection.close();
      }
    },
  );
  for (const change of ['family', 'source', 'missing context', 'direct context'] as const) {
    it(
      'rechecks trusted consent ' +
        change +
        ' before manual ' +
        operation +
        ' despite a sufficient own grant',
      async () => {
        const useId = await register(),
          boundary = await openManualMachine();
        // Port fixture: the account and credential are real; this finite descriptor represents already-verified consent evidence, not a verifier test.
        const principal = {
          id: boundary.principal.id,
          authentication: {
            kind: 'consent' as const,
            credentialId: boundary.credential.id,
            personId: 'reporting-agent',
            issuer: 'https://consent.test',
            subject: 'consent-subject',
          },
          delegation: {
            organizationId: 'org-a',
            audience: 'wbs-be-01/via-mcp-01' as const,
            client: 'consent-client',
            grant: 'original-family',
          },
        };
        boundary.actor = resourceUseActorOf(principal, {
          kind: 'scoped',
          scope: {
            organizationId: 'org-a',
            userId: principal.id,
            role: 'admin',
            cap: CONTRIBUTOR_CAP,
            delegated: true,
          },
          principal: {
            id: principal.id,
            authentication: structuredClone(principal.authentication),
          },
        });
        try {
          harness.sqlite.run(
            "UPDATE machine_credential SET source='mcp_consent',mcp_family_id='original-family' WHERE id=?",
            [boundary.credential.id],
          );
          expect(await boundary.uses.list(projectId, boundary.actor, { limit: 50 })).toMatchObject({
            ok: true,
          });
          if (change === 'family')
            harness.sqlite.run(
              "UPDATE machine_credential SET mcp_family_id='different-family' WHERE id=?",
              [boundary.credential.id],
            );
          if (change === 'source')
            harness.sqlite.run(
              "UPDATE machine_credential SET source='api_key',mcp_family_id=NULL WHERE id=?",
              [boundary.credential.id],
            );
          if (change === 'missing context')
            Object.assign(boundary.actor.principal, { delegation: undefined });
          if (change === 'direct context')
            Object.assign(boundary.actor.principal, {
              delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' },
            });
          const before = captureState();
          expect(
            await authorize(
              new AccessDecisionRepository(boundary.connection.db),
              boundary.actor.principal,
              {
                kind: 'work_package',
                chain: { level: 'work_package', organizationId: 'org-a', workPackageId: projectId },
                restricted: false,
              },
              'package.write',
            ),
          ).toMatchObject({ ok: true });
          expect(await invokeManual(boundary, operation, useId)).toEqual({
            ok: false,
            reason: 'forbidden',
          });
          expect(captureState()).toEqual(before);
        } finally {
          boundary.connection.close();
        }
      },
    );
  }
  for (const change of ['revoked grant', 'unreadable grants'] as const) {
    it(
      'rechecks ' + change + ' inside manual ' + operation + ' owner without effects',
      async () => {
        const useId = await register(),
          boundary = await openManualMachine();
        const release = Promise.withResolvers<undefined>(),
          entered = Promise.withResolvers<undefined>();
        const blocker = boundary.gate.enter(() => {
          entered.resolve(undefined);
          return release.promise;
        });
        await entered.promise;
        const pending = invokeManual(boundary, operation, useId);
        try {
          if (change === 'revoked grant')
            harness.sqlite.run("DELETE FROM access_grant WHERE id='own-manual-grant'");
          else harness.sqlite.run('ALTER TABLE access_grant RENAME TO unavailable_resource_grants');
          const before = captureState();
          release.resolve(undefined);
          await blocker;
          if (change === 'revoked grant')
            expect(await pending).toEqual({ ok: false, reason: 'not_found' });
          else {
            const failure = await pending.then(
              () => null,
              (failure: unknown) => failure,
            );
            expect(failure).toBeInstanceOf(Error);
            expect(
              String(failure) + ' ' + String(failure instanceof Error ? failure.cause : ''),
            ).toContain('access_grant');
          }
          expect(captureState()).toEqual(before);
        } finally {
          release.resolve(undefined);
          try {
            await blocker;
            await pending.then(
              () => undefined,
              () => undefined,
            );
          } finally {
            if (change === 'unreadable grants')
              harness.sqlite.run('ALTER TABLE unavailable_resource_grants RENAME TO access_grant');
            boundary.connection.close();
          }
        }
      },
    );
  }
}
for (const operation of ['bind', 'read'] as const) {
  it(
    'rechecks queued manage_directory revocation before runtime ' + operation + ' without effects',
    async () => {
      const boundary = await openRuntimeQueue(operation);
      const release = Promise.withResolvers<undefined>(),
        entered = Promise.withResolvers<undefined>();
      const blocker = boundary.gate.enter(() => {
        entered.resolve(undefined);
        return release.promise;
      });
      await entered.promise;
      const pending = boundary.invoke();
      try {
        harness.sqlite.run("DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=?", [
          harness.userId('keeper'),
        ]);
        const before = captureState();
        release.resolve(undefined);
        await blocker;
        expect(await pending).toEqual({
          ok: false,
          reason: 'forbidden',
          permission: 'organization.manage_directory',
        });
        expect(captureState()).toEqual(before);
      } finally {
        release.resolve(undefined);
        try {
          await blocker;
          await pending;
        } finally {
          boundary.connection.close();
        }
      }
    },
  );
}
for (const stage of ['fresh admission', 'fresh registration', 'live followup'] as const) {
  it(
    'requires the credential own package.write for runtime ' + stage + ' despite account authority',
    async () => {
      const boundary = await openInfrastructure(
        stage === 'live followup' ? 'event replay' : 'host job',
      );
      try {
        harness.sqlite.run(
          "UPDATE access_grant SET role_id='project-viewer' WHERE id='own-manual-grant'",
        );
        const before = captureState();
        const answer =
          stage === 'fresh admission'
            ? await boundary.runtime.admit(
                boundary.authorityId,
                boundary.runtimeActor,
                boundary.admission,
                123,
              )
            : await boundary.runtime.ingest(
                boundary.authorityId,
                boundary.runtimeActor,
                stage === 'live followup'
                  ? {
                      ...boundary.event,
                      eventId: 'write-refused-followup',
                      kind: 'cleanup_pending',
                      sequence: 2,
                      revision: 2,
                    }
                  : boundary.event,
                123,
              );
        expect(answer).toEqual({ ok: false, reason: 'forbidden', permission: 'package.write' });
        expect(captureState()).toEqual(before);
      } finally {
        boundary.connection.close();
      }
    },
  );
}

const allOwnedOperations = [...manualOperations, ...runtimeQueueOperations] as const;
async function openOwnedOperation(operation: (typeof allOwnedOperations)[number], logger: Logger) {
  if (
    operation === 'register' ||
    operation === 'append' ||
    operation === 'list' ||
    operation === 'history'
  ) {
    const useId = await register(),
      boundary = await openManualMachine(logger);
    return { ...boundary, invoke: () => invokeManual(boundary, operation, useId) };
  }
  return openRuntimeQueue(operation, logger);
}
for (const operation of allOwnedOperations) {
  it(
    'serializes and fences the actual resource ' +
      operation +
      ' owner on the shared Gate connection',
    async () => {
      let isActive = false,
        queries = 0,
        hasProbed = false;
      const controls: string[] = [];
      const previous = harness.sqlite.query<{ timeout: number }, []>('PRAGMA busy_timeout').get();
      if (previous === null) throw new Error('missing busy timeout');
      const logger: Logger = {
        logQuery(query) {
          if (!isActive) return;
          queries++;
          const normalized = query.trim().toUpperCase();
          if (['BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK'].includes(normalized)) {
            controls.push(normalized);
            return;
          }
          if (!hasProbed) {
            hasProbed = true;
            let failure: unknown;
            try {
              harness.sqlite.run('UPDATE users SET username=username WHERE id=?', [
                harness.userId('keeper'),
              ]);
            } catch (caught) {
              failure = caught;
            }
            expect(failure).toMatchObject({ code: 'SQLITE_BUSY' });
          }
        },
      };
      const boundary = await openOwnedOperation(operation, logger);
      harness.sqlite.run('PRAGMA busy_timeout=0');
      const held = Promise.withResolvers<undefined>(),
        entered = Promise.withResolvers<undefined>(),
        blocker = boundary.gate.enter(() => {
          entered.resolve(undefined);
          return held.promise;
        });
      await entered.promise;
      isActive = true;
      const pending = boundary.invoke();
      let hasSettled = false;
      const observed = pending.then((value) => {
        hasSettled = true;
        return value;
      });
      try {
        await Promise.resolve(undefined);
        await Promise.resolve(undefined);
        expect(hasSettled).toBe(false);
        expect(queries).toBe(0);
        held.resolve(undefined);
        await blocker;
        expect(await observed).toMatchObject({ ok: true });
        expect(hasProbed).toBe(true);
        expect(controls).toEqual(['BEGIN IMMEDIATE', 'COMMIT']);
        expect(
          harness.sqlite.run('UPDATE users SET username=username WHERE id=?', [
            harness.userId('keeper'),
          ]).changes,
        ).toBe(1);
      } finally {
        held.resolve(undefined);
        try {
          await blocker;
          await observed;
        } finally {
          isActive = false;
          harness.sqlite.run('PRAGMA busy_timeout=' + String(previous.timeout));
          boundary.connection.close();
        }
      }
    },
  );
  it(
    'rolls back late settlement failure and releases the actual resource ' + operation + ' owner',
    async () => {
      let isActive = false;
      const fault = new Error('late ' + operation + ' owner settlement');
      const controls: string[] = [];
      const logger: Logger = {
        logQuery(query) {
          if (!isActive) return;
          const normalized = query.trim().toUpperCase();
          if (['BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK'].includes(normalized))
            controls.push(normalized);
          if (normalized === 'COMMIT') throw fault;
        },
      };
      const boundary = await openOwnedOperation(operation, logger),
        before = captureState();
      isActive = true;
      try {
        const failure = await boundary.invoke().then(
          () => null,
          (caught: unknown) => caught,
        );
        expect(failure).toBeInstanceOf(Error);
        if (!(failure instanceof Error)) throw new Error('missing late owner failure');
        expect(failure === fault || failure.cause === fault).toBe(true);
        expect(failure).not.toBeInstanceOf(AggregateError);
        expect(controls).toEqual(['BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK']);
        expect(captureState()).toEqual(before);
        isActive = false;
        let hasEntered = false;
        await boundary.gate.enter(() => {
          hasEntered = true;
          return Promise.resolve(undefined);
        });
        expect(hasEntered).toBe(true);
        expect(
          harness.sqlite.run('UPDATE users SET username=username WHERE id=?', [
            harness.userId('keeper'),
          ]).changes,
        ).toBe(1);
        expect(await boundary.invoke()).toMatchObject({ ok: true });
      } finally {
        isActive = false;
        boundary.connection.close();
      }
    },
  );
}

for (const stage of ['fresh admission', 'fresh registration', 'live followup'] as const) {
  it(
    'encodes actual runtime ' + stage + ' package.write denial over HTTP without effects',
    async () => {
      const boundary = await openInfrastructure(
        stage === 'live followup' ? 'event replay' : 'host job',
      );
      try {
        harness.sqlite.run(
          "UPDATE access_grant SET role_id='project-viewer' WHERE id='own-manual-grant'",
        );
        const before = captureState();
        const endpoint = '/api/resource-authorities/' + boundary.authorityId;
        const answer = await callForwarded(
          harness,
          boundary.credential.key,
          'PUT',
          endpoint + (stage === 'fresh admission' ? '/admissions' : '/events'),
          stage === 'fresh admission'
            ? boundary.admission
            : stage === 'live followup'
              ? {
                  ...boundary.event,
                  eventId: 'http-write-refused-followup',
                  kind: 'cleanup_pending',
                  sequence: 2,
                  revision: 2,
                }
              : boundary.event,
        );
        expect(answer.status).toBe(403);
        expect(answer.body).toEqual({ error: 'forbidden', permission: 'package.write' });
        expect(captureState()).toEqual(before);
      } finally {
        boundary.connection.close();
      }
    },
  );
}

it('projects actual resource grant authority without binding or secret-shaped extras', async () => {
  const boundary = await openManualMachine();
  Object.assign(boundary.actor.principal, {
    organizationBinding: { cookie: 'resource-cookie-sentinel', digest: 'resource-digest-sentinel' },
    token: 'resource-token-sentinel',
  });
  if (boundary.actor.access.kind !== 'scoped')
    throw new Error('missing resource projection fixture');
  Object.assign(boundary.actor.access.principal, {
    organizationBinding: { cookie: 'scoped-cookie-sentinel' },
    rawSecret: 'resource-secret-sentinel',
  });
  // The spy calls this captured method with its actual transaction-bound receiver below.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = AccessDecisionRepository.prototype.effectiveRoleAt,
    seen: unknown[] = [];
  const observer = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt').mockImplementation(
    async function (this: AccessDecisionRepository, principal, target) {
      seen.push(structuredClone(principal));
      return original.call(this, principal, target);
    },
  );
  try {
    const answer = await boundary.uses.register(projectId, boundary.actor, draft(), 123);
    expect(answer).toMatchObject({ ok: true });
    expect(seen).toHaveLength(1);
    const projection = seen[0];
    expect(projection).toBeDefined();
    expect(Object.keys(projection as object).sort()).toEqual([
      'authentication',
      'delegation',
      'id',
    ]);
    expect(JSON.stringify({ seen, answer, persisted: captureState() })).not.toMatch(
      /resource-cookie-sentinel|resource-digest-sentinel|resource-token-sentinel|scoped-cookie-sentinel|resource-secret-sentinel/,
    );
  } finally {
    observer.mockRestore();
    boundary.connection.close();
  }
});

for (const stage of ['manual registration', 'runtime admission'] as const) {
  it('honors an explicitly named restricted package grant for ' + stage, async () => {
    const boundary = await openInfrastructure('host job');
    try {
      harness.sqlite.run('UPDATE project SET restricted=1 WHERE id=?', [projectId]);
      harness.sqlite.run(
        "UPDATE access_grant SET scope_kind='work_package',scope_id=?,role_id='package-viewer' WHERE id='own-manual-grant'",
        [projectId],
      );
      const before = captureState();
      const invoke = () =>
        stage === 'runtime admission'
          ? boundary.runtime.admit(
              boundary.authorityId,
              boundary.runtimeActor,
              boundary.admission,
              123,
            )
          : boundary.uses.register(projectId, boundary.actor, draft(), 123);
      expect(await invoke()).toEqual({
        ok: false,
        reason: 'forbidden',
        permission: 'package.write',
      });
      expect(captureState()).toEqual(before);
      harness.sqlite.run(
        "UPDATE access_grant SET role_id='package-contributor' WHERE id='own-manual-grant'",
      );
      expect(await invoke()).toMatchObject({ ok: true });
    } finally {
      boundary.connection.close();
    }
  });
}
for (const operation of ['bind', 'read'] as const) {
  it(
    'throws on unavailable grants before runtime ' + operation + ' instead of falling back to role',
    async () => {
      const boundary = await openRuntimeQueue(operation);
      harness.sqlite.run('ALTER TABLE access_grant RENAME TO unavailable_runtime_grants');
      const before = captureState();
      try {
        const failure = await boundary.invoke().then(
          () => null,
          (failure: unknown) => failure,
        );
        expect(failure).toBeInstanceOf(Error);
        expect(
          String(failure) + ' ' + String(failure instanceof Error ? failure.cause : ''),
        ).toContain('access_grant');
        expect(captureState()).toEqual(before);
      } finally {
        try {
          harness.sqlite.run('ALTER TABLE unavailable_runtime_grants RENAME TO access_grant');
        } finally {
          boundary.connection.close();
        }
      }
    },
  );
}
it('conceals delegated personal orphan access even with effective manage_directory', async () => {
  const useId = await register(),
    boundary = await openRuntimeQueue('read');
  deletePlanningRows();
  Object.assign(boundary.requestedActor.principal, {
    delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' },
  });
  const before = captureState();
  try {
    for (const invoke of [
      () => boundary.uses.list(projectId, boundary.requestedActor, { limit: 50 }),
      () => boundary.uses.history(projectId, useId, boundary.requestedActor, { limit: 50 }),
      () =>
        boundary.uses.append(
          projectId,
          useId,
          boundary.requestedActor,
          {
            eventId: 'delegated-orphan',
            kind: 'cleanup_requested',
            expectedRevision: 1,
            reason: 'denied',
          },
          123,
        ),
    ])
      expect(await invoke()).toEqual({ ok: false, reason: 'not_found' });
    expect(captureState()).toEqual(before);
  } finally {
    boundary.connection.close();
  }
});
it('conceals immutable orphan uses of a foreign organization despite own directory authority', async () => {
  const useId = await register();
  deletePlanningRows();
  harness.member('org-b', 'reporter', 'viewer');
  harness.grantPermissions('org-b', 'reporter', ['organization.manage_directory']);
  harness.bind('reporter', 'org-b');
  const before = captureState();
  for (const suffix of ['', '/' + useId + '/history']) {
    const hidden = await harness.call('reporter', 'GET', path + suffix),
      absent = await harness.call('reporter', 'GET', '/api/projects/absent/resource-uses' + suffix);
    expect(hidden.status).toBe(404);
    expect(hidden).toEqual(absent);
  }
  expect(
    (
      await harness.call('reporter', 'POST', path + '/' + useId + '/events', {
        eventId: 'foreign-orphan',
        kind: 'cleanup_requested',
        expectedRevision: 1,
        reason: 'denied',
      })
    ).status,
  ).toBe(404);
  expect(captureState()).toEqual(before);
});

for (const operation of manualOperations) {
  it(
    'throws on a missing stored consent family before manual ' +
      operation +
      ' despite an own grant',
    async () => {
      const useId = await register(),
        boundary = await openManualMachine();
      try {
        harness.sqlite.run('PRAGMA ignore_check_constraints=ON');
        try {
          harness.sqlite.run(
            "UPDATE machine_credential SET source='mcp_consent',mcp_family_id=NULL WHERE id=?",
            [boundary.credential.id],
          );
        } finally {
          harness.sqlite.run('PRAGMA ignore_check_constraints=OFF');
        }
        const before = captureState();
        const failure = await invokeManual(boundary, operation, useId).then(
          () => null,
          (failure: unknown) => failure,
        );
        expect(failure).toBeInstanceOf(Error);
        expect(String(failure)).toContain('malformed consent family');
        expect(captureState()).toEqual(before);
      } finally {
        boundary.connection.close();
      }
    },
  );
}

for (const operation of allOwnedOperations) {
  it(
    'rechecks current membership inside resource ' + operation + ' owner after queueing',
    async () => {
      const boundary = await openOwnedOperation(operation, {
          logQuery() {
            return undefined;
          },
        }),
        release = Promise.withResolvers<undefined>(),
        entered = Promise.withResolvers<undefined>();
      const blocker = boundary.gate.enter(() => {
        entered.resolve(undefined);
        return release.promise;
      });
      await entered.promise;
      const pending = boundary.invoke();
      try {
        harness.sqlite.run(
          "DELETE FROM organization_membership WHERE organization_id='org-a' AND user_id=?",
          [harness.userId('keeper')],
        );
        const before = captureState();
        release.resolve(undefined);
        await blocker;
        expect(await pending).toEqual({ ok: false, reason: 'forbidden' });
        expect(captureState()).toEqual(before);
      } finally {
        release.resolve(undefined);
        try {
          await blocker;
          await pending;
        } finally {
          boundary.connection.close();
        }
      }
    },
  );
}

for (const operation of ['bind', 'read'] as const) {
  it(
    'refuses a delegated human runtime ' + operation + ' with effective manage_directory',
    async () => {
      const boundary = await openRuntimeQueue(operation);
      Object.assign(boundary.requestedActor.principal, {
        delegation: { organizationId: 'org-a', audience: 'wbs-be-01/direct' },
      });
      const before = captureState();
      try {
        expect(
          await authorize(
            new AccessDecisionRepository(boundary.connection.db),
            boundary.requestedActor.principal,
            { kind: 'organization', organizationId: 'org-a' },
            'organization.manage_directory',
          ),
        ).toMatchObject({ ok: true });
        expect(await boundary.invoke()).toEqual({
          ok: false,
          reason: 'forbidden',
          permission: 'organization.manage_directory',
        });
        expect(captureState()).toEqual(before);
      } finally {
        boundary.connection.close();
      }
    },
  );
}

for (const operation of ['bind', 'read'] as const) {
  it(
    'caps a runtime ' +
      operation +
      ' port machine own administrator grant without account fallback',
    async () => {
      const boundary = await openRuntimeQueue(operation);
      Object.assign(boundary.requestedActor, boundary.runtimeActor);
      // Direct-port cap control: retain real machine authentication but omit delegation so the separate nondelegation guard cannot mask the cap.
      Object.assign(boundary.requestedActor.principal, { delegation: undefined });
      harness.sqlite.run("UPDATE access_grant SET role_id='org-admin' WHERE id='own-manual-grant'");
      const before = captureState();
      try {
        expect(await boundary.invoke()).toEqual({
          ok: false,
          reason: 'forbidden',
          permission: 'organization.manage_directory',
        });
        expect(captureState()).toEqual(before);
      } finally {
        boundary.connection.close();
      }
    },
  );
}
