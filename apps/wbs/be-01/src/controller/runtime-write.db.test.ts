import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertRuntimeRejection } from '@wbs/conformance/runtime-command-conformance';
import type {
  AuthenticatedUser,
  RuntimeCommandRequest,
  RuntimePlanCommand,
  RuntimeReply,
  RuntimeWriteRequest,
} from '@wbs/contracts';
import type { ResourceRuntimeActor } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import {
  createPlanCommandRunner,
  createRuntimeReceiver,
} from '@wbs/core/module/plan-commands/composition';
import type { RuntimeContext } from '@wbs/core/module/plan-commands/runtime-state';
import { type Clock, clockOf } from '@wbs/core/ports/clock';
import type { CommittedProjectEvent } from '@wbs/core/ports/committed-fanout';
import type { EditAdmission } from '@wbs/core/ports/edit-admission';
import { NO_ADMISSION } from '@wbs/core/ports/edit-admission';
import type { Broadcaster } from '@wbs/core/ports/project-event';
import type { Scope } from '@wbs/core/ports/unit-of-work';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { CLAIM_LEASE_MS } from '@wbs/domain';
import { SqliteResourceRuntime } from '@wbs/store-sqlite/resource-runtime';
import { openSqliteSource } from '@wbs/store-sqlite/source';
import { openSpaceDatabase } from '@wbs/store-sqlite/testing/space-database';
import { afterEach, describe, expect, it } from 'bun:test';

import { nodeDigest } from '../runtime/bun-runtime';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from '../testing/organization-limits-fixture';

const actor: AuthenticatedUser = { id: 'ada', username: 'ada', scopes: ['read', 'write'] };
const context: RuntimeContext = {
  actor,
  access: { kind: 'scoped', scope: { organizationId: 'org-a', userId: 'ada', role: 'member' } },
  projectId: 'a1',
  personId: 'agent',
};
const stamp = { at: 2, by: 'ada' };
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
function value<T>(reply: RuntimeReply<T>): T {
  if (!reply.ok) throw new Error(`runtime refused: ${JSON.stringify(reply)}`);
  return reply.value;
}
async function seeded(shared = false, runtimeContext = context, clock: Clock = testClock) {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-runtime-write-'));
  const dbPath = await openSpaceDatabase(directory);
  let forbidCapture = false;
  let captures = 0;
  let turns = 0;
  const sqlite = openSqliteSource({
    dbPath,
    organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
    onBorrowedUnitOfWork: () => {
      turns++;
    },
    onFanoutCapture: () => {
      if (forbidCapture) throw new Error('replay performed capture');
      captures++;
    },
  });
  const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
  cleanups.push(async () => {
    await source.close();
    rmSync(directory, { recursive: true, force: true });
  });
  sqlite.db.run(
    "INSERT INTO organization_membership (organization_id,user_id,role,created_at) VALUES ('org-a','ada','member',1)",
  );
  await source.stores.directory.addPerson({ id: 'agent', name: 'Agent', kind: 'agent' }, [], stamp);
  await source.stores.directory.mapInOrganization('people', 'agent', 'org-a', 'Agent');
  await source.stores.directory.addPerson(
    { id: 'other-agent', name: 'Other Agent', kind: 'agent' },
    [],
    stamp,
  );
  await source.stores.directory.mapInOrganization('people', 'other-agent', 'org-a', 'Other Agent');
  expect(
    await source.stores.directory.patchPerson('other-agent', { accountId: 'ada' }, stamp),
  ).toMatchObject({ ok: true });
  await source.stores.directory.mapInOrganization(
    'externalSystems',
    'sys-github-pr',
    'org-a',
    'GitHub PR',
  );
  expect(
    await source.stores.directory.patchPerson('agent', { accountId: 'ada' }, stamp),
  ).toMatchObject({ ok: true });
  for (const id of ['dev', 'review'])
    await source.stores.steps.add(
      { id, projectId: 'a1', name: id, code: id, allowancePercent: 0, estimateUnit: 'workdays' },
      stamp,
    );
  await source.stores.workItems.insert(
    workItemRow({ id: 'leaf', projectId: 'a1', readiness: 'ready' }),
    [],
    stamp,
  );
  await source.stores.workItems.insert(
    workItemRow({ id: 'other', projectId: 'a1', readiness: 'ready' }),
    [],
    stamp,
  );
  const broadcast = recordingBroadcaster();
  const options = {
    admission: NO_ADMISSION,
    clock,
    broadcast,
    scheduler: fastScheduler,
  };
  const delivered: CommittedProjectEvent[] = [];
  const runnerSource = {
    committedFanout: {
      now: () => 10,
      deliverCommitted: (events: readonly CommittedProjectEvent[]) => {
        delivered.push(...events);
        return Promise.resolve();
      },
    },
    uow: source.uow,
    announcements: broadcast,
    publicServices: servicesOver(source.stores, options),
    batchServices: (scope: Scope, announcements: Broadcaster, admission: EditAdmission) =>
      servicesOver(scope.stores, { ...options, broadcast: announcements, admission }),
  };
  const runner = createPlanCommandRunner(runnerSource, nodeDigest);
  if (shared) {
    sqlite.db.run("UPDATE organization_activation SET state='activated', activated_at=1");
    sqlite.db.run("UPDATE organization SET shared_people=1 WHERE id='org-a'");
    sqlite.db.run("UPDATE project SET start_date='2026-10-05' WHERE id IN ('a1','a2')");
    await source.stores.steps.add(
      {
        id: 'dev2',
        projectId: 'a2',
        name: 'dev2',
        code: 'dev2',
        allowancePercent: 0,
        estimateUnit: 'workdays',
      },
      stamp,
    );
    await source.stores.workItems.insert(
      workItemRow({ id: 'leaf2', projectId: 'a2', readiness: 'ready' }),
      [],
      stamp,
    );
    for (const [projectId, workItemId, stepId] of [
      ['a1', 'leaf', 'dev'],
      ['a2', 'leaf2', 'dev2'],
    ] as const) {
      expect(
        await runner.runWithin(
          projectId,
          'ada',
          [
            {
              kind: 'setEstimate',
              workItemId,
              stepId,
              days: { optimistic: 1, realistic: 1, pessimistic: 1 },
            },
            { kind: 'setAssignee', workItemId, stepId, personId: 'agent' },
          ],
          runtimeContext.access,
          null,
          null,
        ),
      ).toMatchObject({ ok: true });
    }
  }
  const receiver = createRuntimeReceiver(source.uow, nodeDigest);
  const state = () => receiver.readRuntimeState(runtimeContext, {}).then(value);
  const ledger = await source.stores.runtimeCommands.inspectLedger();
  const authority = value(
    await receiver.acquireRuntimeAuthority(runtimeContext, {
      schemaVersion: 1,
      commandId: 'grant',
      expectedLedgerId: ledger.ledgerId,
      ownerId: 'owner',
      expectedGeneration: null,
    }),
  ).acceptance.authority;
  const request = async (
    commandId = 'claim',
    attemptId = 'attempt-a',
  ): Promise<
    RuntimeCommandRequest & { action: Extract<RuntimeCommandRequest['action'], { kind: 'claim' }> }
  > => ({
    schemaVersion: 1,
    commandId,
    expectedLedgerId: ledger.ledgerId,
    authority,
    expectedBasis: (await state()).basis,
    action: {
      kind: 'claim',
      workItemId: 'leaf',
      stepId: 'dev',
      parentClaimId: null,
      execution: { storeId: 'store', runId: 'runtime-run', attemptId, sessionId: 'sess-42' },
    },
  });
  const snapshot = async () => ({
    claims: await source.stores.claims.listByProject('a1'),
    claims2: await source.stores.claims.listByProject('a2'),
    claimRows: sqlite.db.all('SELECT * FROM claim ORDER BY id'),
    ledger: await source.stores.runtimeCommands.inspectLedger(),
    ledgerRows: sqlite.db.all('SELECT * FROM runtime_ledger'),
    authorities: sqlite.db.all('SELECT * FROM runtime_authority'),
    rows: await source.stores.workItems.listByProject('a1'),
    journal: sqlite.db.all('SELECT * FROM command_journal'),
    progress: sqlite.db.all('SELECT * FROM step_progress'),
    measures: sqlite.db.all('SELECT * FROM step_measure'),
    events: sqlite.db.all('SELECT * FROM event_log'),
    sequences: sqlite.db.all('SELECT * FROM event_sequencer'),
    published: [...broadcast.published],
    bindings: sqlite.db.all('SELECT * FROM runtime_claim_binding'),
    receipts: sqlite.db.all('SELECT * FROM runtime_command_receipt'),
    delivered: [...delivered],
    audit: sqlite.db.all('SELECT * FROM organization_audit'),
  });
  return {
    sqlite,
    source,
    runner,
    runnerSource,
    receiver,
    state,
    request,
    snapshot,
    dbPath,
    delivered,
    published: broadcast.published,
    captures: () => captures,
    turns: () => turns,
    blockCapture: () => {
      forbidCapture = true;
    },
  };
}

async function held(shared = false, runtimeContext = context, clock: Clock = testClock) {
  const fixture = await seeded(shared, runtimeContext, clock);
  const accepted = value(
    await fixture.runner.claimRuntime(runtimeContext, await fixture.request()),
  );
  const claim = accepted.acceptance.claim;
  const write = async (
    commands: readonly RuntimePlanCommand[] = [progress],
    commandId = 'write',
  ): Promise<RuntimeWriteRequest> => ({
    schemaVersion: 1,
    commandId,
    expectedLedgerId: accepted.ledgerId,
    authority: accepted.acceptance.authority,
    expectedBasis: (await fixture.state()).basis,
    action: { kind: 'write', claim, commands },
  });
  return { ...fixture, claim, write, accepted };
}
const progress = {
  kind: 'setProgress',
  workItemId: 'leaf',
  stepId: 'dev',
  state: 'in_progress',
} as const;
const release = {
  kind: 'releaseWorkItem',
  workItemId: 'leaf',
  personId: 'agent',
  steps: ['dev'],
} as const;
const measure = (amount: number) =>
  ({
    kind: 'setMeasure',
    workItemId: 'leaf',
    stepId: 'dev',
    metric: 'token_actual',
    value: amount,
  }) as const;
const refs = (url: string) =>
  ({
    kind: 'patchWorkItem',
    workItemId: 'leaf',
    patch: { externalRefs: [{ systemId: 'sys-github-pr', url, name: 'Code' }] },
  }) as const;

const T = 1_900_000_000_000;
// Verified-principal dependency seam: these runner tests do not exercise credential cryptography.
const machineContext: RuntimeContext = {
  ...context,
  actor: {
    ...actor,
    authentication: { kind: 'machine', credentialId: 'verified-machine', personId: 'agent' },
  },
};

async function leased() {
  let now = T;
  let identities = 0;
  const clock = clockOf({
    now: () => now,
    newId: () => `leased-runtime-${String(++identities)}`,
  });
  const fixture = await held(true, machineContext, clock);
  expect(
    await fixture.runner.runWithin(
      'a2',
      'ada',
      [
        {
          kind: 'claimWorkItem',
          workItemId: 'leaf2',
          personId: 'agent',
          steps: ['dev2'],
          runId: 'ordinary-second-project',
        },
      ],
      machineContext.access,
      { personId: 'agent' },
      null,
    ),
  ).toMatchObject({ ok: true });
  const leases = () =>
    fixture.sqlite.db.all<{ projectId: string; personId: string; leaseExpiresAt: number }>(
      'SELECT work_item.project_id AS projectId, claim.person_id AS personId, claim.lease_expires_at AS leaseExpiresAt FROM claim JOIN work_item ON work_item.id=claim.work_item_id ORDER BY work_item.project_id',
    );
  expect(leases()).toEqual([
    { projectId: 'a1', personId: 'agent', leaseExpiresAt: T + CLAIM_LEASE_MS },
    { projectId: 'a2', personId: 'agent', leaseExpiresAt: T + CLAIM_LEASE_MS },
  ]);
  return {
    ...fixture,
    leases,
    advanceTo: (at: number) => {
      now = at;
    },
  };
}

describe('leased runtime write transaction', () => {
  it('renews both project leases on acceptance and replays without renewal or effects', async () => {
    const fixture = await leased();
    fixture.advanceTo(T + 120_000);
    const request = await fixture.write([{ ...progress, state: 'done' }]);
    const publishedBefore = fixture.published.length;
    const accepted = value(await fixture.runner.writeRuntime(machineContext, request));
    expect(fixture.leases()).toEqual([
      { projectId: 'a1', personId: 'agent', leaseExpiresAt: T + 120_000 + CLAIM_LEASE_MS },
      { projectId: 'a2', personId: 'agent', leaseExpiresAt: T + 120_000 + CLAIM_LEASE_MS },
    ]);
    const published = fixture.published.slice(publishedBefore);
    expect(published.filter(({ event }) => event.type === 'claims_changed')).toEqual([
      { projectId: 'a2', event: { type: 'claims_changed' } },
    ]);
    expect(published.filter(({ event }) => event.type === 'tree_replaced')).toMatchObject([
      { projectId: 'a1', event: { type: 'tree_replaced' } },
    ]);
    expect(
      await fixture.receiver.lookupRuntimeReceipt(machineContext, {
        commandId: request.commandId,
        expectedLedgerId: request.expectedLedgerId,
      }),
    ).toEqual({ ok: true, value: accepted });
    const beforeReplay = await fixture.snapshot();
    fixture.advanceTo(T + 240_000);
    expect(await fixture.runner.writeRuntime(machineContext, request)).toEqual({
      ok: true,
      value: accepted,
    });
    expect(await fixture.snapshot()).toEqual(beforeReplay);
  });

  it('rolls back renewed leases and announcements after a late runtime receipt failure', async () => {
    const fixture = await leased();
    fixture.advanceTo(T + 120_000);
    const request = await fixture.write([{ ...progress, state: 'done' }]);
    const {
      published: publishedBefore,
      delivered: deliveredBefore,
      ...before
    } = await fixture.snapshot();
    const journalBefore = fixture.sqlite.db.get<{ count: number }>(
      'SELECT count(*) AS count FROM command_journal',
    );
    const expiry = T + 120_000 + CLAIM_LEASE_MS;
    fixture.sqlite.db.run(
      `CREATE TRIGGER reject_leased_runtime_receipt BEFORE INSERT ON runtime_command_receipt BEGIN SELECT CASE WHEN (SELECT count(*) FROM claim JOIN work_item ON work_item.id=claim.work_item_id WHERE work_item.project_id IN ('a1','a2') AND claim.person_id='agent' AND claim.lease_expires_at=${String(expiry)})=2 AND (SELECT count(*) FROM claim)=2 AND (SELECT count(*) FROM step_progress WHERE work_item_id='leaf' AND step_id='dev' AND state='done')=1 AND (SELECT count(*) FROM command_journal)>${String(journalBefore.count)} THEN RAISE(ABORT,'late runtime receipt after lease renewal') ELSE RAISE(ABORT,'late runtime receipt missing staged renewal or progress') END; END`,
    );
    try {
      await fixture.runner.writeRuntime(machineContext, request).then(
        () => {
          throw new Error('leased receipt INSERT unexpectedly resolved');
        },
        (fault: unknown) => {
          expect(fault).toBeInstanceOf(Error);
          if (!(fault instanceof Error)) throw fault;
          expect(fault.message).toContain('INSERT INTO runtime_command_receipt');
          expect(fault.cause).toMatchObject({
            message: 'late runtime receipt after lease renewal',
          });
        },
      );
      const { published, delivered, ...after } = await fixture.snapshot();
      expect(after).toEqual(before);
      expect(published).toEqual(publishedBefore);
      expect(delivered).toEqual(deliveredBefore);
    } finally {
      fixture.sqlite.db.run('DROP TRIGGER reject_leased_runtime_receipt');
    }
    const accepted = value(await fixture.runner.writeRuntime(machineContext, request));
    expect(fixture.leases()).toEqual([
      { projectId: 'a1', personId: 'agent', leaseExpiresAt: expiry },
      { projectId: 'a2', personId: 'agent', leaseExpiresAt: expiry },
    ]);
    expect(
      fixture.published
        .slice(publishedBefore.length)
        .filter(({ event }) => event.type === 'claims_changed'),
    ).toEqual([{ projectId: 'a2', event: { type: 'claims_changed' } }]);
    expect(
      await fixture.receiver.lookupRuntimeReceipt(machineContext, {
        commandId: request.commandId,
        expectedLedgerId: request.expectedLedgerId,
      }),
    ).toEqual({ ok: true, value: accepted });
  });
});

describe('conditional exact runtime write', () => {
  it('commits restricted ordered commands and retains the actual post-write basis', async () => {
    const { runner, write, state, source, claim } = await held();
    const request = await write([progress, measure(0), refs('https://example.com/a'), release]);
    const accepted = value(await runner.writeRuntime(context, request));
    expect(accepted.acceptance).toEqual({
      kind: 'write',
      authority: request.authority,
      claim,
      basisAfter: (await state()).basis,
      applied: request.action.commands.map(({ kind }, index) => ({ index, kind })),
    });
    expect(accepted.acceptance.basisAfter).not.toBe(request.expectedBasis);
    expect(await source.stores.claims.findById('a1', claim.claimId)).toBeNull();
    expect(await source.stores.runtimeCommands.readBinding(accepted.scope, claim.claimId)).toEqual(
      claim,
    );
  });

  it.each(['claimId', 'workItemId', 'stepId', 'parentClaimId'] as const)(
    'refuses requested exact claim mismatch on %s with a fresh basis',
    async (field) => {
      const { runner, write, snapshot } = await held();
      const request = await write();
      const before = await snapshot();
      expect(
        await runner.writeRuntime(context, {
          ...request,
          action: { ...request.action, claim: { ...request.action.claim, [field]: 'wrong' } },
        }),
      ).toEqual({ ok: false, reason: 'runtime_claim_mismatch' });
      expect(await snapshot()).toEqual(before);
    },
  );
  it.each(['storeId', 'runId', 'attemptId', 'sessionId'] as const)(
    'refuses immutable runtime identity mismatch on %s',
    async (field) => {
      const { runner, write, snapshot } = await held();
      const request = await write();
      const before = await snapshot();
      expect(
        await runner.writeRuntime(context, {
          ...request,
          action: {
            ...request.action,
            claim: {
              ...request.action.claim,
              execution: { ...request.action.claim.execution, [field]: 'wrong' },
            },
          },
        }),
      ).toEqual({ ok: false, reason: 'runtime_claim_mismatch' });
      expect(await snapshot()).toEqual(before);
    },
  );
  it.each(['id', 'workItemId', 'stepId', 'personId', 'runId', 'parentClaimId'] as const)(
    'refuses live identity mismatch on %s independently of immutable binding',
    async (field) => {
      const { runnerSource, write, snapshot } = await held();
      const request = await write();
      const before = await snapshot();
      const uow = runnerSource.uow;
      const runner = createPlanCommandRunner(
        {
          ...runnerSource,
          uow: {
            run: (act) =>
              uow.run((scope) =>
                act({
                  ...scope,
                  stores: {
                    ...scope.stores,
                    claims: new Proxy(scope.stores.claims, {
                      get(target, key) {
                        if (key === 'findById')
                          return async (projectId: string, claimId: string) => {
                            const live = await target.findById(projectId, claimId);
                            if (live === null) throw new Error('fixture live claim missing');
                            return { ...live, [field]: 'wrong' };
                          };
                        const member: unknown = Reflect.get(target, key);
                        const forwarded: unknown =
                          typeof member === 'function' ? member.bind(target) : member;
                        return forwarded;
                      },
                    }),
                  },
                }),
              ),
          },
        },
        nodeDigest,
      );
      expect(await runner.writeRuntime(context, request)).toEqual({
        ok: false,
        reason: 'runtime_claim_mismatch',
      });
      expect(await snapshot()).toEqual(before);
    },
  );

  it.each(
    [
      [{ ...progress, workItemId: 'other' }],
      [{ ...progress, stepId: 'review' }],
      [refs('https://example.com/a'), { ...measure(2), stepId: 'review' }],
      [{ ...refs('https://example.com/a'), workItemId: 'other' }],
      [{ ...release, personId: 'other-agent' }],
      [{ ...release, steps: ['review'] }],
      [{ ...release, steps: ['dev', 'review'] }],
    ].map((commands) => ({ commands })),
  )(
    'returns a typed target refusal for a valid-shape cross-target batch %#',
    async ({ commands }) => {
      const { runner, write, snapshot } = await held();
      const before = await snapshot();
      expect(await runner.writeRuntime(context, await write(commands))).toEqual({
        ok: false,
        reason: 'runtime_command_target_mismatch',
      });
      expect(await snapshot()).toEqual(before);
    },
  );
  it.each(
    [
      [release, progress],
      [release, release],
    ].map((commands) => ({ commands })),
  )('returns typed release-order refusal %#', async ({ commands }) => {
    const { runner, write, snapshot } = await held();
    const before = await snapshot();
    expect(await runner.writeRuntime(context, await write(commands))).toEqual({
      ok: false,
      reason: 'runtime_command_not_supported',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('omitted usage preserves a previous measure while explicit zero records measured zero', async () => {
    const { runner, write, sqlite } = await held();
    value(await runner.writeRuntime(context, await write([measure(17)], 'measured')));
    const before = sqlite.db.all('SELECT * FROM step_measure');
    value(await runner.writeRuntime(context, await write([progress], 'unknown')));
    expect(sqlite.db.all('SELECT * FROM step_measure')).toEqual(before);
    value(await runner.writeRuntime(context, await write([measure(0)], 'zero')));
    expect(sqlite.db.all('SELECT value FROM step_measure')).toEqual([{ value: 0 }]);
  });

  it('refuses stale ref replacement and preserves the concurrent refs', async () => {
    const { runner, write, snapshot } = await held();
    const stale = await write([refs('https://example.com/stale')]);
    expect(
      await runner.runWithin(
        'a1',
        'ada',
        [refs('https://example.com/current')],
        context.access,
        null,
        null,
      ),
    ).toMatchObject({ ok: true });
    const before = await snapshot();
    expect(await runner.writeRuntime(context, stale)).toEqual({
      ok: false,
      reason: 'runtime_revision_conflict',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses the old generation against the unchanged claim with a fresh basis', async () => {
    const { runner, receiver, write, snapshot } = await held();
    const request = await write();
    value(
      await receiver.acquireRuntimeAuthority(context, {
        schemaVersion: 1,
        commandId: 'takeover',
        expectedLedgerId: request.expectedLedgerId,
        ownerId: 'owner',
        expectedGeneration: 1,
      }),
    );
    const fresh = await write();
    const before = await snapshot();
    expect(await runner.writeRuntime(context, fresh)).toEqual({
      ok: false,
      reason: 'runtime_authority_stale',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('guarded release A then new attempt B refuses fresh-ID stale A release under the current grant and basis', async () => {
    const { runner, receiver, write, request, source, claim, snapshot, state } = await held();
    const stale = await write([release]);
    value(await runner.writeRuntime(context, { ...stale, commandId: 'release-a' }));
    const authority = value(
      await receiver.acquireRuntimeAuthority(context, {
        schemaVersion: 1,
        commandId: 'takeover',
        expectedLedgerId: stale.expectedLedgerId,
        ownerId: 'new-owner',
        expectedGeneration: 1,
      }),
    ).acceptance.authority;
    const next = await request('claim-b', 'attempt-b');
    const b = value(
      await runner.claimRuntime(context, {
        ...next,
        authority,
        action: { ...next.action, execution: { ...next.action.execution, sessionId: 'session-b' } },
      }),
    );
    const before = await snapshot();
    const replacementBefore = await source.stores.claims.findById('a1', b.acceptance.claim.claimId);
    const refused = await runner.writeRuntime(context, {
      ...stale,
      commandId: 'stale-a',
      authority,
      expectedBasis: (await state()).basis,
    });
    expect(await source.stores.claims.findById('a1', b.acceptance.claim.claimId)).toEqual(
      replacementBefore,
    );
    expect(refused).toEqual({ ok: false, reason: 'runtime_claim_mismatch' });
    expect(await snapshot()).toEqual(before);
    expect(await source.stores.claims.findById('a1', b.acceptance.claim.claimId)).not.toBeNull();
    expect(await source.stores.runtimeCommands.readBinding(b.scope, claim.claimId)).toEqual(claim);
    expect(
      await source.stores.runtimeCommands.readBinding(b.scope, b.acceptance.claim.claimId),
    ).toEqual(b.acceptance.claim);
  });

  it('preserves a competing holder in the release/reclaim gap with ordinary refusal details', async () => {
    const { runner, write, request, source, snapshot } = await held();
    value(await runner.writeRuntime(context, await write([release], 'release-a')));
    expect(
      await runner.runWithin(
        'a1',
        'ada',
        [
          {
            kind: 'claimWorkItem',
            workItemId: 'leaf',
            personId: 'agent',
            steps: ['dev'],
            runId: 'competitor',
          },
        ],
        context.access,
        null,
        null,
      ),
    ).toMatchObject({ ok: true });
    const live = (await source.stores.claims.listByProject('a1')).at(0);
    if (live === undefined) throw new Error('competing claim missing');
    const fresh = await request('claim-b', 'attempt-b');
    const before = await snapshot();
    expect(await runner.claimRuntime(context, fresh)).toEqual({
      ok: false,
      at: 0,
      kind: 'claimWorkItem',
      reason: 'already_claimed',
      detail: {
        holders: [{ claimId: live.id, personId: 'agent', name: 'Agent', runId: 'competitor' }],
      },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('replays the exact accepted release after takeover before ordinary effects or live checks', async () => {
    const { runner, runnerSource, receiver, write, blockCapture, snapshot } = await held();
    const request = await write([progress, release]);
    const accepted = await runner.writeRuntime(context, request);
    value(accepted);
    value(
      await receiver.acquireRuntimeAuthority(context, {
        schemaVersion: 1,
        commandId: 'takeover',
        expectedLedgerId: request.expectedLedgerId,
        ownerId: 'new-owner',
        expectedGeneration: 1,
      }),
    );
    blockCapture();
    const replay = createPlanCommandRunner(
      {
        ...runnerSource,
        batchServices: () => {
          throw new Error('replay built graph');
        },
      },
      nodeDigest,
    );
    const before = await snapshot();
    expect(await replay.writeRuntime(context, request)).toEqual(accepted);
    expect(await snapshot()).toEqual(before);
    for (const changed of [
      { ...request, authority: { ...request.authority, ownerId: 'changed' } },
      { ...request, expectedBasis: 'rb1:' + 'f'.repeat(64) },
      { ...request, action: { ...request.action, commands: [release, progress] } },
      {
        ...request,
        action: { ...request.action, commands: [{ ...progress, state: 'done' as const }, release] },
      },
    ])
      expect(await replay.writeRuntime(context, changed)).toEqual({
        ok: false,
        reason: 'runtime_command_conflict',
      });
    expect(await snapshot()).toEqual(before);
  });
});

describe('runtime write transaction boundaries', () => {
  it.each([
    'absent',
    'claimId',
    'workItemId',
    'stepId',
    'parentClaimId',
    'storeId',
    'runId',
    'attemptId',
    'sessionId',
  ] as const)(
    'refuses borrowed immutable binding mismatch on %s with the live claim unchanged',
    async (field) => {
      const { runnerSource, write, snapshot } = await held();
      const request = await write();
      const before = await snapshot();
      const uow = runnerSource.uow;
      const runner = createPlanCommandRunner(
        {
          ...runnerSource,
          uow: {
            run: (act) =>
              uow.run((scope) =>
                act({
                  ...scope,
                  stores: {
                    ...scope.stores,
                    runtimeCommands: new Proxy(scope.stores.runtimeCommands, {
                      get(target, key) {
                        if (key === 'readBinding')
                          return async (...args: Parameters<typeof target.readBinding>) => {
                            const binding = await target.readBinding(...args);
                            if (binding === null) throw new Error('fixture binding missing');
                            if (field === 'absent') return null;
                            if (['storeId', 'runId', 'attemptId', 'sessionId'].includes(field))
                              return {
                                ...binding,
                                execution: { ...binding.execution, [field]: 'wrong' },
                              };
                            return { ...binding, [field]: 'wrong' };
                          };
                        const member: unknown = Reflect.get(target, key);
                        const forwarded: unknown =
                          typeof member === 'function' ? member.bind(target) : member;
                        return forwarded;
                      },
                    }),
                  },
                }),
              ),
          },
        },
        nodeDigest,
      );
      expect(await runner.writeRuntime(context, request)).toEqual({
        ok: false,
        reason: 'runtime_claim_mismatch',
      });
      expect(await snapshot()).toEqual(before);
    },
  );

  it('checks current authorization and ledger before replay and uses fresh roles', async () => {
    const { runner, write, sqlite, source, snapshot } = await held();
    const request = await write();
    value(await runner.writeRuntime(context, request));
    expect(await runner.writeRuntime(context, { ...request, expectedLedgerId: 'wrong' })).toEqual({
      ok: false,
      reason: 'runtime_ledger_mismatch',
    });
    expect(
      await runner.writeRuntime({ ...context, actor: { ...actor, scopes: ['read'] } }, request),
    ).toEqual({ ok: false, error: 'insufficient_scope' });
    expect(await runner.writeRuntime({ ...context, access: { kind: 'legacy' } }, request)).toEqual({
      ok: false,
      reason: 'runtime_scope_unavailable',
    });
    sqlite.db.run("UPDATE organization_membership SET role='viewer' WHERE user_id='ada'");
    const before = await snapshot();
    expect(await runner.writeRuntime(context, request)).toEqual({ ok: false, reason: 'forbidden' });
    expect(await snapshot()).toEqual(before);
    sqlite.db.run("UPDATE organization_membership SET role='admin' WHERE user_id='ada'");
    expect(
      await source.stores.directory.patchPerson('agent', { accountId: null }, stamp),
    ).toMatchObject({ ok: true });
    expect(await runner.writeRuntime(context, await write([release], 'admin'))).toMatchObject({
      ok: true,
    });
    sqlite.db.run("UPDATE organization_membership SET role='member' WHERE user_id='ada'");
    expect(
      await runner.writeRuntime(
        {
          ...context,
          access: {
            kind: 'scoped',
            scope: { organizationId: 'org-a', userId: 'ada', role: 'admin' },
          },
        },
        request,
      ),
    ).toEqual({ ok: false, reason: 'person_not_bound' });
  });

  it('rejects malformed and unsupported shapes before queued admission', async () => {
    const { runner, write, turns, snapshot } = await held();
    const request = await write();
    const before = await snapshot();
    const turnsBefore = turns();
    for (const commands of [
      [],
      new Array(1),
      Array.from({ length: 201 }, () => progress),
      [{ kind: 'setProgress', workItemId: 'leaf', stepNodeId: 'dev', state: 'done' }],
      [{ kind: 'setMeasure', workItemId: 'leaf', stepId: 'dev', metric: 'money', value: 1 }],
      [{ kind: 'patchWorkItem', workItemId: 'leaf', patch: { name: 'changed' } }],
      [{ ...measure(1), value: Infinity }],
    ]) {
      // External malformed values intentionally cross the typed application boundary.
      await assertRuntimeRejection(
        runner.writeRuntime(context, {
          ...request,
          action: { ...request.action, commands },
        }),
      );
    }
    expect(turns()).toBe(turnsBefore);
    expect(await snapshot()).toEqual(before);
  });

  it('detaches nested commands, refs, release steps, claim identity and context before a real queued turn', async () => {
    const { runner, write, source, receiver } = await held();
    const original = await write([
      progress,
      measure(0),
      refs('https://example.com/original'),
      release,
    ]);
    const mutable = structuredClone(original);
    const identity = {
      projectId: 'a1',
      personId: 'agent',
      actor: { ...actor, scopes: [...actor.scopes] },
      access: {
        kind: 'scoped' as const,
        scope: { organizationId: 'org-a', userId: 'ada', role: 'member' as const },
      },
    };
    const entered = Promise.withResolvers<undefined>();
    const unblock = Promise.withResolvers<undefined>();
    const writer = source.uow.run(async () => {
      entered.resolve(undefined);
      await unblock.promise;
      return { commit: true, value: undefined };
    });
    await entered.promise;
    const writing = runner.writeRuntime(identity, mutable);
    Object.assign(identity, { projectId: 'b1', personId: 'wrong' });
    identity.actor.id = 'wrong';
    identity.actor.scopes.splice(0);
    identity.access.scope.organizationId = 'org-b';
    Object.assign(mutable, {
      commandId: 'wrong',
      expectedLedgerId: 'wrong',
      expectedBasis: 'rb1:' + 'f'.repeat(64),
    });
    Object.assign(mutable.authority, { ownerId: 'wrong', generation: 2 });
    Object.assign(mutable.action.claim, {
      claimId: 'wrong',
      workItemId: 'other',
      stepId: 'review',
      parentClaimId: 'wrong',
    });
    Object.assign(mutable.action.claim.execution, {
      storeId: 'wrong',
      runId: 'wrong',
      attemptId: 'wrong',
      sessionId: 'wrong',
    });
    for (const command of mutable.action.commands) {
      Object.assign(command, { workItemId: 'other' });
      if (command.kind === 'setProgress')
        Object.assign(command, { stepId: 'review', state: 'done' });
      if (command.kind === 'setMeasure') Object.assign(command, { stepId: 'review', value: 42 });
      if (command.kind === 'patchWorkItem') {
        const ref = command.patch.externalRefs[0];
        Object.assign(ref, { systemId: 'wrong', url: 'wrong', name: 'wrong' });
      }
      if (command.kind === 'releaseWorkItem') {
        Object.assign(command, { personId: 'wrong' });
        Object.assign(command.steps, { 0: 'review' });
      }
    }
    unblock.resolve(undefined);
    await writer;
    const accepted = value(await writing);
    expect(accepted).toMatchObject({
      commandId: 'write',
      actorId: 'ada',
      scope: { organizationId: 'org-a', projectId: 'a1', personId: 'agent' },
      acceptance: { claim: original.action.claim, authority: original.authority },
    });
    expect(await runner.writeRuntime(context, original)).toEqual({ ok: true, value: accepted });
    expect(
      await receiver.lookupRuntimeReceipt(context, {
        commandId: 'write',
        expectedLedgerId: original.expectedLedgerId,
      }),
    ).toEqual({ ok: true, value: accepted });
  });

  it('rolls a real late receipt INSERT failure back after progress, measure, refs, release and journal staging', async () => {
    const { runner, write, sqlite, snapshot, captures } = await held(true);
    const request = await write([
      { ...progress, state: 'done' },
      measure(23),
      refs('https://example.com/staged'),
      release,
    ]);
    const before = await snapshot();
    const capturedBefore = captures();
    const journalBefore = sqlite.db.get<{ count: number }>(
      'SELECT count(*) AS count FROM command_journal',
    );
    sqlite.db.run(
      `CREATE TRIGGER reject_write_receipt BEFORE INSERT ON runtime_command_receipt BEGIN SELECT CASE WHEN (SELECT count(*) FROM claim)=0 AND (SELECT count(*) FROM step_progress WHERE state='done')=1 AND (SELECT count(*) FROM step_measure WHERE value=23)=1 AND (SELECT count(*) FROM work_item_external_ref WHERE url='https://example.com/staged')=1 AND (SELECT count(*) FROM command_journal)>${String(journalBefore.count)} AND (SELECT binding_count FROM runtime_ledger)=1 THEN RAISE(ABORT,'write receipt fault') ELSE RAISE(ABORT,'write receipt missing staged mutations') END; END`,
    );
    await runner.writeRuntime(context, request).then(
      () => {
        throw new Error('receipt INSERT unexpectedly resolved');
      },
      (fault: unknown) => {
        expect(fault).toBeInstanceOf(Error);
        if (!(fault instanceof Error)) throw fault;
        expect(fault.message).toContain('INSERT INTO runtime_command_receipt');
        expect(fault.cause).toMatchObject({ message: 'write receipt fault' });
      },
    );
    expect(await snapshot()).toEqual(before);
    expect(captures()).toBe(capturedBefore + 1);
  });

  // Proof: the late receipt trigger required staged cleanup and then raised its distinct cause;
  // all six resource tables and the existing runtime/claim/journal/event snapshot rolled back.
  // Removing the trigger accepted the same release; exact replay preserved every row.
  it('rolls back claim-release cleanup on late receipt failure and replays its accepted request once', async () => {
    const fixture = await held(true);
    const { sqlite, runner, write, claim } = fixture;
    const runtime = new SqliteResourceRuntime(sqlite.db, sqlite.gate);
    const credentialId = '00000000-0000-4000-8000-000000000001';
    for (const statement of [
      "INSERT INTO compute_provider (id,organization_id,kind,name,locator,created_at,created_by) VALUES ('resource-provider','org-a','ssh_host','Release host','display-only',2,'ada')",
      "INSERT INTO resource (id,name,kind,unit_label,provider_id) VALUES ('release-disk','Release disk','divisible','GB','resource-provider')",
      "INSERT INTO resource_organization (resource_id,organization_id,name) VALUES ('release-disk','org-a','Release disk')",
      "INSERT INTO machine_credential (id,organization_id,person_id,issued_by,source,name,created_at,created_by) VALUES ('00000000-0000-4000-8000-000000000001','org-a','other-agent','ada','api_key','Release controller',2,'ada')",
      "UPDATE organization_membership SET role='admin' WHERE organization_id='org-a' AND user_id='ada'",
    ])
      sqlite.db.run(statement);
    const controller: ResourceRuntimeActor = {
      id: 'ada',
      personId: 'other-agent',
      credentialId,
      fingerprint: 'release-controller',
      access: { ...context.access },
    };
    expect(
      await runtime.bind(
        'release-runtime',
        { ...controller, credentialId: null, personId: null },
        { providerId: 'resource-provider', credentialId, epoch: 'release-epoch' },
        2,
      ),
    ).toMatchObject({ ok: true });
    sqlite.db.run(
      "UPDATE organization_membership SET role='member' WHERE organization_id='org-a' AND user_id='ada'",
    );
    expect(
      await runtime.ingest(
        'release-runtime',
        controller,
        {
          eventId: 'release-registration',
          epoch: 'release-epoch',
          sequence: 1,
          useId: 'release-runtime-use',
          incarnation: 'release-incarnation',
          revision: 1,
          kind: 'registered',
          observedAt: 2,
          reason: 'Track the exact runtime claim session',
          use: {
            projectId: 'a1',
            resourceId: 'release-disk',
            workItemId: claim.workItemId,
            agentRun: claim.execution.sessionId,
            responsiblePersonId: 'agent',
            locator: '/display/release-checkout',
            units: 1,
            kind: 'git_worktree',
            reservedDiskUnits: 1,
            reservedWorkspaceUnits: 1,
          },
        },
        2,
      ),
    ).toEqual({
      ok: true,
      value: { acceptedSequence: 1, useId: 'release-runtime-use', revision: 1 },
    });
    const snapshot = async () => ({
      ordinary: await fixture.snapshot(),
      uses: sqlite.db.all('SELECT * FROM resource_use ORDER BY id'),
      history: sqlite.db.all('SELECT * FROM resource_use_event ORDER BY use_id,revision'),
      requests: sqlite.db.all('SELECT * FROM resource_cleanup_request ORDER BY request_id'),
      occupancy: sqlite.db.all('SELECT * FROM claim_occupancy ORDER BY claim_id,resource_id'),
      allocation: sqlite.db.all(
        "SELECT * FROM sqlite_sequence WHERE name='resource_cleanup_request'",
      ),
      authorities: sqlite.db.all('SELECT * FROM resource_authority ORDER BY authority_id'),
      runtimeUses: sqlite.db.all('SELECT * FROM resource_runtime_use ORDER BY use_id'),
      runtimeEvents: sqlite.db.all(
        'SELECT * FROM resource_runtime_event ORDER BY authority_id,sequence',
      ),
    });
    const request = await write([{ ...progress, state: 'done' }, release], 'resource-release');
    const before = await snapshot();
    expect(
      sqlite.db.get<{
        source: string;
        state: string;
        revision: number;
        pending: number;
        runtimeRevision: number;
      }>(
        "SELECT json_extract(snapshot,'$.source') AS source,state,revision,json_extract(snapshot,'$.pendingCleanupRequest') AS pending,json_extract(snapshot,'$.runtimeRevision') AS runtimeRevision FROM resource_use WHERE id='release-runtime-use'",
      ),
    ).toEqual({ source: 'runtime', state: 'active', revision: 1, pending: 0, runtimeRevision: 1 });
    expect(before.history).toHaveLength(1);
    expect(before.requests).toEqual([]);
    expect(before.runtimeUses).toHaveLength(1);
    expect(before.runtimeEvents).toHaveLength(1);
    const journalBefore = sqlite.db.get<{ count: number }>(
      'SELECT count(*) AS count FROM command_journal',
    );
    sqlite.db.run(
      `CREATE TRIGGER reject_resource_release_receipt BEFORE INSERT ON runtime_command_receipt
      WHEN NEW.command_id='resource-release' BEGIN
        SELECT CASE WHEN
          (SELECT count(*) FROM claim)=0
          AND (SELECT count(*) FROM step_progress WHERE work_item_id='leaf' AND step_id='dev' AND state='done')=1
          AND (SELECT count(*) FROM command_journal)>${String(journalBefore.count)}
          AND (SELECT count(*) FROM resource_cleanup_request WHERE authority_id='release-runtime' AND use_id='release-runtime-use' AND incarnation='release-incarnation' AND expected_revision=1 AND acknowledged_sequence IS NULL)=1
          AND (SELECT count(*) FROM resource_authority WHERE authority_id='release-runtime' AND accepted_sequence=1)=1
          AND (SELECT count(*) FROM resource_use_event WHERE use_id='release-runtime-use' AND revision=2 AND json_extract(snapshot,'$.kind')='cleanup_requested')=1
          AND (SELECT count(*) FROM resource_use WHERE id='release-runtime-use' AND state='active' AND revision=2 AND json_extract(snapshot,'$.pendingCleanupRequest')=1 AND json_extract(snapshot,'$.runtimeRevision')=1)=1
        THEN RAISE(ABORT,'late receipt after exact resource cleanup staging')
        ELSE RAISE(ABORT,'late receipt missing exact resource cleanup staging') END;
      END`,
    );
    try {
      await runner.writeRuntime(context, request).then(
        () => {
          throw new Error('resource release receipt unexpectedly resolved');
        },
        (fault: unknown) => {
          expect(fault).toBeInstanceOf(Error);
          if (!(fault instanceof Error)) throw fault;
          expect(fault.message).toContain('INSERT INTO runtime_command_receipt');
          expect(fault.cause).toMatchObject({
            message: 'late receipt after exact resource cleanup staging',
          });
        },
      );
      expect(await snapshot()).toEqual(before);
    } finally {
      sqlite.db.run('DROP TRIGGER reject_resource_release_receipt');
    }
    const accepted = value(await runner.writeRuntime(context, request));
    expect(await fixture.source.stores.claims.findById('a1', claim.claimId)).toBeNull();
    expect(
      sqlite.db.get<{ state: string; revision: number; pending: number; runtimeRevision: number }>(
        "SELECT state,revision,json_extract(snapshot,'$.pendingCleanupRequest') AS pending,json_extract(snapshot,'$.runtimeRevision') AS runtimeRevision FROM resource_use WHERE id='release-runtime-use'",
      ),
    ).toEqual({ state: 'active', revision: 2, pending: 1, runtimeRevision: 1 });
    expect(await runtime.requests('release-runtime', controller, 0, 50)).toMatchObject({
      ok: true,
      value: {
        requests: [
          { useId: 'release-runtime-use', incarnation: 'release-incarnation', expectedRevision: 1 },
        ],
        nextCursor: null,
      },
    });
    expect(sqlite.db.all('SELECT * FROM resource_use_event')).toHaveLength(2);
    expect(sqlite.db.all('SELECT * FROM resource_cleanup_request')).toHaveLength(1);
    const committed = await snapshot();
    expect(await runner.writeRuntime(context, request)).toEqual({ ok: true, value: accepted });
    expect(await snapshot()).toEqual(committed);
  });

  it('recovers committed write after reply loss, close/reopen, lookup and exact retry without effects', async () => {
    const { runnerSource, write, source, dbPath, sqlite, delivered } = await held(true);
    const request = await write([measure(9), refs('https://example.com/committed'), release]);
    const announce = runnerSource.publicServices.workItems.announceTreeNow.bind(
      runnerSource.publicServices.workItems,
    );
    runnerSource.publicServices.workItems.announceTreeNow = async (projectId) => {
      await announce(projectId);
      throw new Error('write reply lost');
    };
    const losing = createPlanCommandRunner(runnerSource, nodeDigest);
    await assertRuntimeRejection(losing.writeRuntime(context, request), 'write reply lost');
    const before = {
      ledger: await source.stores.runtimeCommands.inspectLedger(),
      journal: sqlite.db.all('SELECT * FROM command_journal'),
      rows: await source.stores.workItems.listByProject('a1'),
      events: sqlite.db.all('SELECT * FROM event_log'),
      sequences: sqlite.db.all('SELECT * FROM event_sequencer'),
      delivered: [...delivered],
    };
    await source.close();
    const reopened = openSqliteSource({
      dbPath,
      organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
      onFanoutCapture: () => {
        throw new Error('retry captured fanout');
      },
    });
    const bound = reopened.bindLivePlans({ schedulerOf: () => fastScheduler });
    try {
      const receiver = createRuntimeReceiver(bound.uow, nodeDigest);
      const accepted = value(
        await receiver.lookupRuntimeReceipt(context, {
          commandId: request.commandId,
          expectedLedgerId: request.expectedLedgerId,
        }),
      );
      expect(accepted.acceptance.kind).toBe('write');
      if (accepted.acceptance.kind !== 'write') throw new Error('recovered write has wrong kind');
      const precise = { ...accepted, acceptance: accepted.acceptance };
      const retry = createPlanCommandRunner(
        {
          ...runnerSource,
          uow: bound.uow,
          batchServices: () => {
            throw new Error('retry built graph');
          },
        },
        nodeDigest,
      );
      expect(await retry.writeRuntime(context, request)).toEqual({ ok: true, value: precise });
      expect({
        ledger: await bound.stores.runtimeCommands.inspectLedger(),
        journal: reopened.db.all('SELECT * FROM command_journal'),
        rows: await bound.stores.workItems.listByProject('a1'),
        events: reopened.db.all('SELECT * FROM event_log'),
        sequences: reopened.db.all('SELECT * FROM event_sequencer'),
        delivered: [...delivered],
      }).toEqual(before);
    } finally {
      await bound.close();
    }
  });

  it('requires a real digest for write use', async () => {
    const { runnerSource, write } = await held();
    await assertRuntimeRejection(
      createPlanCommandRunner(runnerSource).writeRuntime(context, await write()),
      'runtime command digest is missing',
    );
  });
});

it('normalizes omitted external ref names through ordinary semantics while retaining original request bytes', async () => {
  const { runner, write, source, accepted } = await held();
  const request = await write([
    {
      kind: 'patchWorkItem',
      workItemId: 'leaf',
      patch: { externalRefs: [{ systemId: 'sys-github-pr', url: 'https://example.com/unnamed' }] },
    },
  ]);
  const receipt = value(await runner.writeRuntime(context, request));
  const row = (await source.stores.workItems.listByProject('a1')).find(({ id }) => id === 'leaf');
  expect(row?.externalRefs).toMatchObject([
    { systemId: 'sys-github-pr', url: 'https://example.com/unnamed', name: '' },
  ]);
  expect(
    (await source.stores.runtimeCommands.readAcceptance(accepted.scope, 'write'))?.canonicalRequest,
  ).toContain('"externalRefs":[{"systemId":"sys-github-pr","url":"https://example.com/unnamed"}]');
  expect(await runner.writeRuntime(context, request)).toEqual({ ok: true, value: receipt });
  const explicit = await write([
    {
      kind: 'patchWorkItem',
      workItemId: 'leaf',
      patch: {
        externalRefs: [{ systemId: 'sys-github-pr', url: 'https://example.com/unnamed', name: '' }],
      },
    },
  ]);
  expect(
    await runner.writeRuntime(context, { ...explicit, expectedBasis: request.expectedBasis }),
  ).toEqual({ ok: false, reason: 'runtime_command_conflict' });
});
it('rejects ordinary semantic invalid ref and measure inputs before admission', async () => {
  const { runner, write, turns, snapshot } = await held();
  const before = await snapshot();
  const turnsBefore = turns();
  for (const externalRefs of [
    [{ systemId: '', url: 'https://example.com' }],
    [{ systemId: 'sys-github-pr', url: '' }],
    [{ systemId: 'sys-github-pr', url: 'https://example.com', name: 'x'.repeat(301) }],
  ])
    await assertRuntimeRejection(
      runner.writeRuntime(
        context,
        await write([{ kind: 'patchWorkItem', workItemId: 'leaf', patch: { externalRefs } }]),
      ),
    );
  await assertRuntimeRejection(
    runner.writeRuntime(context, await write([measure(-1)])),
    'invalid_measure',
  );
  // write() reads state itself, so only its read turns are expected here.
  expect(turns()).toBe(turnsBefore + 4);
  expect(await snapshot()).toEqual(before);
});

it('pins fresh writes and requires the exact current owner independently of generation', async () => {
  const { runner, write, snapshot } = await held();
  const request = await write();
  const before = await snapshot();
  expect(await runner.writeRuntime(context, { ...request, expectedLedgerId: 'wrong' })).toEqual({
    ok: false,
    reason: 'runtime_ledger_mismatch',
  });
  expect(
    await runner.writeRuntime(context, {
      ...request,
      authority: { ...request.authority, ownerId: 'wrong' },
    }),
  ).toEqual({ ok: false, reason: 'runtime_authority_stale' });
  expect(await snapshot()).toEqual(before);
});

it('refuses releasing another held step independently of ordinary claim eligibility', async () => {
  const { runner, write, snapshot, source, claim } = await held();
  expect(
    await runner.runWithin(
      'a1',
      'ada',
      [
        {
          kind: 'claimWorkItem',
          workItemId: 'leaf',
          personId: 'agent',
          steps: ['review'],
          runId: 'review-session',
        },
      ],
      context.access,
      null,
      null,
    ),
  ).toMatchObject({ ok: true });
  const request = await write([{ ...release, steps: ['review'] }]);
  const before = await snapshot();
  expect(await runner.writeRuntime(context, request)).toEqual({
    ok: false,
    reason: 'runtime_command_target_mismatch',
  });
  expect(await snapshot()).toEqual(before);
  expect(await source.stores.claims.findById('a1', claim.claimId)).not.toBeNull();
});
it('requires a write action at the write boundary before admission', async () => {
  const { runner, request, turns, snapshot } = await held();
  const claimRequest = await request('wrong-action', 'another');
  const turnsBefore = turns();
  const before = await snapshot();
  await assertRuntimeRejection(
    runner.writeRuntime(context, claimRequest as unknown as RuntimeWriteRequest),
    'runtime write action is required',
  );
  expect(turns()).toBe(turnsBefore);
  expect(await snapshot()).toEqual(before);
});

describe('runtime writes on the acting person undo stack', () => {
  const journalPeople = (fixture: Awaited<ReturnType<typeof held>>) =>
    fixture.sqlite.db
      .all<{ personId: string | null }>(
        'SELECT person_id AS personId FROM command_journal ORDER BY seq',
      )
      .map(({ personId }) => personId);

  // Proof: with `null` for the acting person in `runRuntimeCommands`, the machine case
  // journalled on the account's stack (`[null, null]` for `['agent', 'agent']`) and the two
  // human cases still passed; watched 2026-10-26.
  it("journals a machine credential's runtime write on its agent person's stack", async () => {
    const fixture = await held(false, machineContext);
    value(await fixture.runner.writeRuntime(machineContext, await fixture.write()));
    // The runtime claim and the write are each one journal entry.
    expect(journalPeople(fixture)).toEqual(['agent', 'agent']);
  });

  it.each([
    ['first_party', { kind: 'first_party', issuedAt: 1 }],
    ['upstream', { kind: 'upstream', issuer: 'https://idp.example/', subject: 'ada' }],
  ] as const)("journals a %s human's runtime write on the account's stack", async (_, auth) => {
    const human: RuntimeContext = { ...context, actor: { ...actor, authentication: auth } };
    const fixture = await held(false, human);
    value(await fixture.runner.writeRuntime(human, await fixture.write()));
    expect(journalPeople(fixture)).toEqual([null, null]);
  });
});
