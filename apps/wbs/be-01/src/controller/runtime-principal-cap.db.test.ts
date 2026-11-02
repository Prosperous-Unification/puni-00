import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CredentialAuthentication, RuntimeReply, RuntimeState } from '@wbs/contracts';
import { servicesOver } from '@wbs/core/compose';
import { AuthService } from '@wbs/core/module/authentication/authentication.feature';
import {
  createPlanCommandRunner,
  createRuntimeReceiver,
} from '@wbs/core/module/plan-commands/composition';
import type { RuntimeContext } from '@wbs/core/module/plan-commands/runtime-state';
import { NO_ADMISSION } from '@wbs/core/ports/edit-admission';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { openSqliteSource } from '@wbs/store-sqlite/source';
import { openSpaceDatabase } from '@wbs/store-sqlite/testing/space-database';
import { afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';

import { nodeDigest } from '../runtime/bun-runtime';
import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import { type HarnessMachineGrants, OrganizationHarness } from '../testing/organization-harness';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from '../testing/organization-limits-fixture';

const cleanups: (() => Promise<void>)[] = [];
let machineGrants: HarnessMachineGrants;
beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/**
 * The composed harness with a restricted-role runtime fixture. A machine key
 * reaches it as an agent's does, through mcp-01's forwarded grant
 * ({@link callForwarded}).
 */
async function mountRuntime() {
  const harness = OrganizationHarness.openComposedWith({ machineGrants });
  cleanups.push(() => harness.closeComposed());
  for (const username of ['creator', 'super']) await harness.register(username);
  harness.organization('org-a');
  harness.member('org-a', 'creator', 'admin');
  harness.member('org-a', 'super', 'super_admin');
  harness.bind('creator', 'org-a');
  harness.bind('super', 'org-a');
  harness.activate();
  const created = await harness.call('creator', 'POST', '/api/projects', { name: 'Principal cap' });
  expect(created.status).toBe(200);
  const projectId = (created.body as { project: { id: string } }).project.id;
  addAgentPerson(harness.sqlite, 'agent', 'org-a', harness.userId('super'));
  addAgentPerson(harness.sqlite, 'unbound', 'org-a', null);
  addAgentPerson(harness.sqlite, 'other-account', 'org-a', harness.userId('creator'));
  const observed = await harness.call(
    'creator',
    'GET',
    `/api/projects/${projectId}/runtime-state?personId=agent`,
  );
  expect(observed.status).toBe(200);
  const state = observed.body as RuntimeState;
  const acquisition = {
    schemaVersion: 1,
    commandId: 'cap-authority',
    personId: 'agent',
    expectedLedgerId: state.ledgerId,
    ownerId: 'owner',
    expectedGeneration: null,
  };
  const history = () => ({
    authorities: harness.sqlite.query('SELECT * FROM runtime_authority').all(),
    receipts: harness.sqlite.query('SELECT * FROM runtime_command_receipt').all(),
  });
  return { harness, projectId, acquisition, history };
}

async function restrictProject() {
  const fixture = await mountRuntime();
  expect(
    (
      await fixture.harness.call('creator', 'PATCH', `/api/projects/${fixture.projectId}`, {
        restricted: true,
      })
    ).status,
  ).toBe(200);
  return fixture;
}

function stubConsent(harness: OrganizationHarness) {
  // Consumer seam only: cryptography and consent-family verification are outside this test.
  const authentication: CredentialAuthentication = {
    kind: 'consent',
    issuer: 'https://human.test',
    subject: 'human',
    credentialId: 'verified-consent',
    personId: 'agent',
  };
  const principal = spyOn(AuthService.prototype, 'authenticateOrRefuse').mockImplementation(
    (token) => {
      if (token !== 'verified-consent') throw new Error('unexpected consent fixture token');
      return Promise.resolve({
        id: harness.userId('super'),
        username: 'super',
        scopes: ['read', 'write'],
        authentication,
        delegation: {
          organizationId: 'org-a',
          audience: 'wbs-be-01/via-mcp-01',
          client: 'test-mcp',
          grant: 'verified-family',
        },
      });
    },
  );
  cleanups.push(() => {
    principal.mockRestore();
    return Promise.resolve();
  });
  return 'verified-consent';
}

describe('runtime principal role cap', () => {
  for (const operation of ['read', 'acquire'] as const) {
    test(`refuses real machine key restricted-project ${operation} for the correctly pinned noncreator super-admin`, async () => {
      const { harness, projectId, acquisition, history } = await restrictProject();
      const credential = await issueApiKey(harness.sqlite, {
        organizationId: 'org-a',
        personId: 'agent',
        issuedBy: harness.userId('super'),
      });
      const before = history();
      const answer =
        operation === 'read'
          ? await callForwarded(
              harness,
              credential.key,
              'GET',
              `/api/projects/${projectId}/runtime-state?personId=agent`,
            )
          : await callForwarded(
              harness,
              credential.key,
              'POST',
              `/api/projects/${projectId}/runtime-authority`,
              acquisition,
            );
      expect(answer).toEqual({ status: 403, body: { error: 'forbidden' } });
      expect(history()).toEqual(before);
    });
    test(`refuses verified consent restricted-project ${operation} for its correctly pinned noncreator super-admin`, async () => {
      const { harness, projectId, acquisition, history } = await restrictProject();
      const token = stubConsent(harness);
      const before = history();
      const answer =
        operation === 'read'
          ? await harness.callWith(
              token,
              'GET',
              `/api/projects/${projectId}/runtime-state?personId=agent`,
            )
          : await harness.callWith(
              token,
              'POST',
              `/api/projects/${projectId}/runtime-authority`,
              acquisition,
            );
      expect(answer).toEqual({ status: 403, body: { error: 'forbidden' } });
      expect(history()).toEqual(before);
    });
  }

  for (const kind of ['machine', 'consent'] as const) {
    for (const personId of ['unbound', 'other-account']) {
      test(`keeps person_not_bound precedence for ${kind} runtime read and acquisition as ${personId}`, async () => {
        const { harness, projectId, acquisition, history } = await mountRuntime();
        const token =
          kind === 'machine'
            ? (
                await issueApiKey(harness.sqlite, {
                  organizationId: 'org-a',
                  personId: 'agent',
                  issuedBy: harness.userId('super'),
                })
              ).key
            : stubConsent(harness);
        const before = history();
        // A machine key's call is forwarded as mcp-01 sends it; consent is a Bearer.
        const call = (method: string, path: string, body?: unknown) =>
          kind === 'machine'
            ? callForwarded(harness, token, method, path, body)
            : harness.callWith(token, method, path, body);
        expect(
          await call('GET', `/api/projects/${projectId}/runtime-state?personId=${personId}`),
        ).toEqual({ status: 403, body: { error: 'person_not_bound' } });
        expect(
          await call('POST', `/api/projects/${projectId}/runtime-authority`, {
            ...acquisition,
            personId,
          }),
        ).toEqual({ status: 403, body: { error: 'person_not_bound' } });
        expect(history()).toEqual(before);
      });
    }
  }

  test('preserves human super-admin recovery and binding bypass for unbound and other-account runtime persons', async () => {
    const { harness, projectId, acquisition } = await restrictProject();
    for (const personId of ['unbound', 'other-account']) {
      expect(
        (
          await harness.call(
            'super',
            'GET',
            `/api/projects/${projectId}/runtime-state?personId=${personId}`,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await harness.call('super', 'POST', `/api/projects/${projectId}/runtime-authority`, {
            ...acquisition,
            commandId: `human-${personId}`,
            personId,
          })
        ).status,
      ).toBe(200);
    }
  });
});

function acceptReply<T>(reply: RuntimeReply<T>): T {
  if (!reply.ok) throw new Error('runtime fixture refused: ' + JSON.stringify(reply));
  return reply.value;
}

async function createQueuedFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-runtime-cap-'));
  const dbPath = await openSpaceDatabase(directory);
  const sqlite = openSqliteSource({
    dbPath,
    organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
  });
  const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
  cleanups.push(async () => {
    await source.close();
    rmSync(directory, { recursive: true, force: true });
  });
  sqlite.db.run(
    "INSERT INTO organization_membership (organization_id,user_id,role,created_at) VALUES ('org-a','ada','super_admin',1)",
  );
  sqlite.db.run(
    "INSERT INTO users (id,username,password_hash,created_at) VALUES ('creator','creator','x',1)",
  );
  await source.stores.directory.addPerson({ id: 'agent', name: 'Agent', kind: 'agent' }, [], {
    at: 2,
    by: 'ada',
  });
  await source.stores.directory.mapInOrganization('people', 'agent', 'org-a', 'Agent');
  expect(
    await source.stores.directory.patchPerson('agent', { accountId: 'ada' }, { at: 2, by: 'ada' }),
  ).toMatchObject({ ok: true });
  await source.stores.steps.add(
    {
      id: 'dev',
      projectId: 'a1',
      name: 'Dev',
      code: 'dev',
      allowancePercent: 0,
      estimateUnit: 'workdays',
    },
    { at: 2, by: 'ada' },
  );
  for (const id of ['leaf', 'other'])
    await source.stores.workItems.insert(
      workItemRow({ id, projectId: 'a1', readiness: 'ready' }),
      [],
      { at: 2, by: 'ada' },
    );
  const broadcast = recordingBroadcaster();
  const options = {
    admission: NO_ADMISSION,
    clock: testClock,
    broadcast,
    scheduler: fastScheduler,
  };
  const runner = createPlanCommandRunner(
    {
      uow: source.uow,
      announcements: broadcast,
      publicServices: servicesOver(source.stores, options),
      batchServices: (scope, announcements, admission) =>
        servicesOver(scope.stores, { ...options, broadcast: announcements, admission }),
    },
    nodeDigest,
  );
  const receiver = createRuntimeReceiver(source.uow, nodeDigest);
  const human: RuntimeContext = {
    actor: {
      id: 'ada',
      username: 'ada',
      scopes: ['read', 'write'],
      authentication: { kind: 'first_party', issuedAt: 1 },
    },
    projectId: 'a1',
    personId: 'agent',
    access: {
      kind: 'scoped',
      scope: { organizationId: 'org-a', userId: 'ada', role: 'super_admin' },
    },
  };
  const observed = acceptReply(await receiver.readRuntimeState(human, {}));
  const grant = {
    schemaVersion: 1 as const,
    commandId: 'grant',
    expectedLedgerId: observed.ledgerId,
    ownerId: 'owner',
    expectedGeneration: null,
  };
  const authority = acceptReply(await receiver.acquireRuntimeAuthority(human, grant)).acceptance
    .authority;
  const claimRequest = {
    schemaVersion: 1 as const,
    commandId: 'seed-claim',
    expectedLedgerId: observed.ledgerId,
    authority,
    expectedBasis: observed.basis,
    action: {
      kind: 'claim' as const,
      workItemId: 'leaf',
      stepId: 'dev',
      parentClaimId: null,
      execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' },
    },
  };
  const claimed = acceptReply(await runner.claimRuntime(human, claimRequest));
  const writeRequest = {
    schemaVersion: 1 as const,
    commandId: 'seed-write',
    expectedLedgerId: observed.ledgerId,
    authority,
    expectedBasis: acceptReply(await receiver.readRuntimeState(human, {})).basis,
    action: {
      kind: 'write' as const,
      claim: claimed.acceptance.claim,
      commands: [
        { kind: 'setProgress' as const, workItemId: 'leaf', stepId: 'dev', state: 'done' as const },
      ],
    },
  };
  acceptReply(await runner.writeRuntime(human, writeRequest));
  sqlite.db.run("UPDATE project SET restricted=1, owner_id='creator' WHERE id='a1'");
  const freshBasis = acceptReply(await receiver.readRuntimeState(human, {})).basis;
  const history = () => ({
    authorities: sqlite.db.all('SELECT * FROM runtime_authority'),
    receipts: sqlite.db.all('SELECT * FROM runtime_command_receipt'),
    bindings: sqlite.db.all('SELECT * FROM runtime_claim_binding'),
    progress: sqlite.db.all('SELECT * FROM step_progress'),
    claims: sqlite.db.all('SELECT * FROM claim'),
  });
  return {
    source,
    receiver,
    runner,
    human,
    grant,
    claimRequest,
    writeRequest,
    basis: freshBasis,
    history,
  };
}

describe('queued runtime authentication detachment', () => {
  for (const kind of ['machine', 'consent'] as const) {
    for (const operation of [
      'read',
      'acquire',
      'lookup',
      'claim',
      'write',
      'claim-replay',
      'write-replay',
    ] as const) {
      test(
        'retains verified ' +
          kind +
          ' cap during queued ' +
          operation +
          ' despite authentication alias mutation',
        async () => {
          const fixture = await createQueuedFixture();
          const { source, receiver, runner, human, grant, claimRequest, writeRequest, history } =
            fixture;
          const authentication = {
            kind: kind as CredentialAuthentication['kind'],
            credentialId: 'verified',
            personId: 'agent',
            issuer: 'https://human.test',
            subject: 'human',
            issuedAt: 1,
          };
          const identity: RuntimeContext = { ...human, actor: { ...human.actor, authentication } };
          const before = history();
          const entered = Promise.withResolvers<undefined>();
          const release = Promise.withResolvers<undefined>();
          const writing = source.uow.run(async () => {
            entered.resolve(undefined);
            await release.promise;
            return { commit: true, value: undefined };
          });
          await entered.promise;
          // Each public consumer snapshots synchronously before its real UoW queues.
          const pending = (() => {
            switch (operation) {
              case 'read':
                return receiver.readRuntimeState(identity, {});
              case 'acquire':
                return receiver.acquireRuntimeAuthority(identity, {
                  ...grant,
                  commandId: 'next-grant',
                  expectedGeneration: 1,
                });
              case 'lookup':
                return receiver.lookupRuntimeReceipt(identity, {
                  commandId: 'grant',
                  expectedLedgerId: grant.expectedLedgerId,
                });
              case 'claim':
                return runner.claimRuntime(identity, {
                  ...claimRequest,
                  commandId: 'next-claim',
                  expectedBasis: fixture.basis,
                  action: {
                    ...claimRequest.action,
                    workItemId: 'other',
                    execution: { ...claimRequest.action.execution, attemptId: 'other-attempt' },
                  },
                });
              case 'write':
                return runner.writeRuntime(identity, {
                  ...writeRequest,
                  commandId: 'next-write',
                  expectedBasis: fixture.basis,
                });
              case 'claim-replay':
                return runner.claimRuntime(identity, claimRequest);
              case 'write-replay':
                return runner.writeRuntime(identity, writeRequest);
            }
          })();
          try {
            authentication.kind = 'first_party';
          } finally {
            release.resolve(undefined);
          }
          await writing;
          expect(await pending).toEqual({ ok: false, reason: 'forbidden' });
          expect(history()).toEqual(before);
        },
      );
    }
  }
});
