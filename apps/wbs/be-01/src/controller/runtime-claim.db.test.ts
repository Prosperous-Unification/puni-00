import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertRuntimeRejection } from '@wbs/conformance/runtime-command-conformance';
import type { AuthenticatedUser, RuntimeCommandRequest, RuntimeReply } from '@wbs/contracts';
import { servicesOver } from '@wbs/core/compose';
import {
  createPlanCommandRunner,
  createRuntimeReceiver,
} from '@wbs/core/module/plan-commands/composition';
import type { RuntimeContext } from '@wbs/core/module/plan-commands/runtime-state';
import type { CommittedProjectEvent } from '@wbs/core/ports/committed-fanout';
import type { EditAdmission } from '@wbs/core/ports/edit-admission';
import { NO_ADMISSION } from '@wbs/core/ports/edit-admission';
import type { Broadcaster } from '@wbs/core/ports/project-event';
import type { Scope } from '@wbs/core/ports/unit-of-work';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
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
async function seeded(shared = false) {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-runtime-claim-'));
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
    clock: testClock,
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
          context.access,
          null,
        ),
      ).toMatchObject({ ok: true });
    }
  }
  const receiver = createRuntimeReceiver(source.uow, nodeDigest);
  const state = () => receiver.readRuntimeState(context, {}).then(value);
  const ledger = await source.stores.runtimeCommands.inspectLedger();
  const authority = value(
    await receiver.acquireRuntimeAuthority(context, {
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
    ledger: await source.stores.runtimeCommands.inspectLedger(),
    rows: await source.stores.workItems.listByProject('a1'),
    journal: sqlite.db.all('SELECT * FROM command_journal'),
    progress: sqlite.db.all('SELECT * FROM step_progress'),
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
    captures: () => captures,
    turns: () => turns,
    blockCapture: () => {
      forbidCapture = true;
    },
  };
}

describe('conditional exact runtime claim', () => {
  it('binds precisely one step/session and stores the actual final basis', async () => {
    const { runner, request, source, state } = await seeded();
    const claimRequest = await request();
    const accepted = value(await runner.claimRuntime(context, claimRequest));
    expect(accepted.acceptance).toMatchObject({
      kind: 'claim',
      authority: claimRequest.authority,
      claim: {
        workItemId: 'leaf',
        stepId: 'dev',
        parentClaimId: null,
        execution: claimRequest.action.execution,
      },
      basisAfter: (await state()).basis,
    });
    expect(accepted.acceptance.basisAfter).not.toBe(claimRequest.expectedBasis);
    expect(await source.stores.claims.listByProject('a1')).toMatchObject([
      { id: accepted.acceptance.claim.claimId, stepId: 'dev', runId: 'sess-42', personId: 'agent' },
    ]);
    expect(
      await source.stores.runtimeCommands.readBinding(
        accepted.scope,
        accepted.acceptance.claim.claimId,
      ),
    ).toEqual(accepted.acceptance.claim);
  });

  it('requires current authority before allocating a claim', async () => {
    const { runner, request, snapshot } = await seeded();
    const claimRequest = await request();
    const before = await snapshot();
    expect(
      await runner.claimRuntime(context, {
        ...claimRequest,
        authority: { ownerId: 'other', generation: 1 },
      }),
    ).toEqual({ ok: false, reason: 'runtime_authority_stale' });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses stale basis after a real competing claim while ordinary claim semantics remain unchanged', async () => {
    const { runner, request, snapshot } = await seeded();
    const claimRequest = await request();
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
            runId: 'ordinary',
          },
        ],
        context.access,
        null,
      ),
    ).toMatchObject({ ok: true });
    const before = await snapshot();
    expect(await runner.claimRuntime(context, claimRequest)).toEqual({
      ok: false,
      reason: 'runtime_revision_conflict',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('never adopts an unbound ordinary alreadyHeld claim', async () => {
    const { runner, request, snapshot } = await seeded();
    expect(
      await runner.runWithin(
        'a1',
        'ada',
        [
          {
            kind: 'claimWorkItem',
            workItemId: 'leaf',
            personId: 'agent',
            steps: ['dev', 'review'],
            runId: 'sess-42',
          },
        ],
        context.access,
        null,
      ),
    ).toMatchObject({ ok: true });
    const claimRequest = await request();
    const before = await snapshot();
    expect(await runner.claimRuntime(context, claimRequest)).toEqual({
      ok: false,
      reason: 'runtime_claim_unmanaged',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('never reuses an attempt binding for another claim', async () => {
    const { runner, request, snapshot } = await seeded();
    value(await runner.claimRuntime(context, await request()));
    const next = await request('second');
    const before = await snapshot();
    expect(
      await runner.claimRuntime(context, {
        ...next,
        action: { ...next.action, workItemId: 'other' },
      }),
    ).toEqual({ ok: false, reason: 'runtime_attempt_bound' });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses a different attempt with the same person/session without altering the old binding', async () => {
    const { runner, request, snapshot } = await seeded();
    value(await runner.claimRuntime(context, await request()));
    const next = await request('second', 'attempt-b');
    const before = await snapshot();
    expect(await runner.claimRuntime(context, next)).toEqual({
      ok: false,
      reason: 'runtime_claim_mismatch',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('returns the original exact receipt after real ordinary progress without journal/revision/fanout', async () => {
    const { runner, request, snapshot } = await seeded();
    const claimRequest = await request();
    const accepted = await runner.claimRuntime(context, claimRequest);
    expect(value(accepted).acceptance.kind).toBe('claim');
    expect(
      await runner.runWithin(
        'a1',
        'ada',
        [{ kind: 'setProgress', workItemId: 'leaf', stepId: 'dev', state: 'done' }],
        context.access,
        null,
      ),
    ).toMatchObject({ ok: true });
    const before = await snapshot();
    expect(await runner.claimRuntime(context, claimRequest)).toEqual(accepted);
    expect(await snapshot()).toEqual(before);
  });

  it('checks current authorization before replay and preserves ledger/command conflict ordering', async () => {
    const { runner, request, sqlite, snapshot } = await seeded();
    const claimRequest = await request();
    value(await runner.claimRuntime(context, claimRequest));
    expect(
      await runner.claimRuntime(context, { ...claimRequest, expectedLedgerId: 'different' }),
    ).toEqual({ ok: false, reason: 'runtime_ledger_mismatch' });
    expect(
      await runner.claimRuntime(context, {
        ...claimRequest,
        action: { ...claimRequest.action, stepId: 'review' },
      }),
    ).toEqual({ ok: false, reason: 'runtime_command_conflict' });
    sqlite.db.run("UPDATE organization_membership SET role='viewer' WHERE user_id='ada'");
    const before = await snapshot();
    expect(await runner.claimRuntime(context, claimRequest)).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('rolls actual receipt INSERT failure back with claim, progress, binding, counters, journal and fanout', async () => {
    const { runner, request, sqlite, snapshot, captures } = await seeded(true);
    const claimRequest = await request();
    const before = await snapshot();
    const capturedBefore = captures();
    sqlite.db.run(
      "CREATE TRIGGER reject_claim_receipt BEFORE INSERT ON runtime_command_receipt BEGIN SELECT CASE WHEN (SELECT count(*) FROM claim)=1 AND (SELECT count(*) FROM step_progress)=1 AND (SELECT count(*) FROM runtime_claim_binding)=1 AND (SELECT binding_count FROM runtime_ledger)=1 AND (SELECT count(*) FROM command_journal)>2 THEN RAISE(ABORT, 'receipt fault') ELSE RAISE(ABORT, 'receipt fault missing staged writes') END; END",
    );
    await runner.claimRuntime(context, claimRequest).then(
      () => {
        throw new Error('receipt INSERT unexpectedly resolved');
      },
      (fault: unknown) => {
        expect(fault).toBeInstanceOf(Error);
        if (!(fault instanceof Error)) throw fault;
        expect(fault.message).toContain('INSERT INTO runtime_command_receipt');
        expect(fault.cause).toMatchObject({ message: 'receipt fault' });
      },
    );
    expect(await snapshot()).toEqual(before);
    expect(captures()).toBe(capturedBefore + 1);
  });

  it('requires the real digest capability for runtime use', async () => {
    const { runnerSource, request } = await seeded();
    const ordinary = createPlanCommandRunner(runnerSource);
    await assertRuntimeRejection(
      ordinary.claimRuntime(context, await request()),
      'runtime command digest is missing',
    );
  });

  it('selects the exact target after applying alongside another already-held step', async () => {
    const { runner, request, source } = await seeded();
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
            runId: 'sess-42',
          },
        ],
        context.access,
        null,
      ),
    ).toMatchObject({ ok: true });
    const previous = await source.stores.claims.listByProject('a1');
    const previousClaim = previous.at(0);
    if (previousClaim === undefined) throw new Error('previous claim missing');
    const accepted = value(await runner.claimRuntime(context, await request()));
    const claims = await source.stores.claims.listByProject('a1');
    const exact = claims.find(({ stepId }) => stepId === 'dev');
    expect(exact).toBeDefined();
    if (exact === undefined) throw new Error('exact claim missing');
    expect(accepted.acceptance.claim.claimId).toBe(exact.id);
    expect(accepted.acceptance.claim.claimId).not.toBe(previousClaim.id);
  });

  it('uses the freshly resolved role in actual command application', async () => {
    const { runner, request, sqlite, source } = await seeded();
    const claimRequest = await request();
    sqlite.db.run("UPDATE organization_membership SET role='admin' WHERE user_id='ada'");
    expect(
      await source.stores.directory.patchPerson('agent', { accountId: null }, stamp),
    ).toMatchObject({ ok: true });
    expect(await runner.claimRuntime(context, claimRequest)).toMatchObject({ ok: true });
  });

  it('preserves domain holder refusal details and re-evaluates an unaccepted ID', async () => {
    const { runner, request, source, snapshot } = await seeded();
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
            runId: 'different-session',
          },
        ],
        context.access,
        null,
      ),
    ).toMatchObject({ ok: true });
    const held = (await source.stores.claims.listByProject('a1')).at(0);
    if (held === undefined) throw new Error('ordinary claim missing');
    const claimRequest = await request();
    const before = await snapshot();
    const refusal = {
      ok: false as const,
      at: 0,
      kind: 'claimWorkItem' as const,
      reason: 'already_claimed' as const,
      detail: {
        holders: [
          { claimId: held.id, personId: 'agent', name: 'Agent', runId: 'different-session' },
        ],
      },
    };
    expect(await runner.claimRuntime(context, claimRequest)).toEqual(refusal);
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
            runId: 'sess-42',
          },
        ],
        context.access,
        null,
      ),
    ).toEqual(refusal);
    expect(await snapshot()).toEqual(before);
    expect(
      await runner.runWithin(
        'a1',
        'ada',
        [{ kind: 'releaseWorkItem', workItemId: 'leaf', personId: 'agent', steps: ['dev'] }],
        context.access,
        null,
      ),
    ).toMatchObject({ ok: true });
    const fresh = await request();
    expect(await runner.claimRuntime(context, fresh)).toMatchObject({ ok: true });
  });

  it('preserves person, parent and unknown-step refusals without accepted history', async () => {
    const { runner, request, source, snapshot } = await seeded();
    const claimRequest = await request();
    const before = await snapshot();
    expect(
      await runner.claimRuntime(context, {
        ...claimRequest,
        action: { ...claimRequest.action, stepId: 'absent' },
      }),
    ).toMatchObject({ ok: false, at: 0, kind: 'claimWorkItem', reason: 'unknown_step' });
    expect(
      await runner.claimRuntime(context, {
        ...claimRequest,
        action: { ...claimRequest.action, parentClaimId: 'absent' },
      }),
    ).toMatchObject({ ok: false, at: 0, kind: 'claimWorkItem', reason: 'parent_claim_unknown' });
    expect(await snapshot()).toEqual(before);
    expect(
      await source.stores.directory.patchPerson('agent', { accountId: null }, stamp),
    ).toMatchObject({ ok: true });
    expect(await runner.claimRuntime(context, claimRequest)).toEqual({
      ok: false,
      reason: 'person_not_bound',
    });
  });

  it('refuses read-only, legacy and malformed sessions before applying or replaying', async () => {
    const { runner, request, snapshot, turns } = await seeded();
    const claimRequest = await request();
    const before = await snapshot();
    const turnsBefore = turns();
    expect(
      await runner.claimRuntime(
        { ...context, actor: { ...actor, scopes: ['read'] } },
        claimRequest,
      ),
    ).toEqual({ ok: false, error: 'insufficient_scope' });
    expect(
      await runner.claimRuntime({ ...context, access: { kind: 'legacy' } }, claimRequest),
    ).toEqual({ ok: false, reason: 'runtime_scope_unavailable' });
    for (const sessionId of ['', 's'.repeat(257)])
      await assertRuntimeRejection(
        runner.claimRuntime(context, {
          ...claimRequest,
          action: {
            ...claimRequest.action,
            execution: { ...claimRequest.action.execution, sessionId },
          },
        }),
      );
    expect(await snapshot()).toEqual(before);
    expect(turns()).toBe(turnsBefore);
  });

  it('replays without ordinary admission, recovery audits, graph reads or capture', async () => {
    const { runner, runnerSource, request, sqlite, blockCapture } = await seeded();
    const claimRequest = await request();
    const accepted = await runner.claimRuntime(context, claimRequest);
    value(accepted);
    sqlite.db.run("UPDATE organization_membership SET role='super_admin' WHERE user_id='ada'");
    sqlite.db.run("UPDATE project SET restricted=1 WHERE id='a1'");
    sqlite.db.run(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES ('someone','someone','x',1)",
    );
    sqlite.db.run("UPDATE project SET owner_id='someone' WHERE id='a1'");
    const audits = sqlite.db.all('SELECT * FROM organization_audit');
    blockCapture();
    const replayOnly = createPlanCommandRunner(
      {
        ...runnerSource,
        batchServices: () => {
          throw new Error('replay opened command graph');
        },
        publicServices: {
          ...runnerSource.publicServices,
          workItems: new Proxy(runnerSource.publicServices.workItems, {
            get() {
              throw new Error('replay reached post-commit graph');
            },
          }),
        },
      },
      nodeDigest,
    );
    expect(await replayOnly.claimRuntime(context, claimRequest)).toEqual(accepted);
    expect(sqlite.db.all('SELECT * FROM organization_audit')).toEqual(audits);
  });

  it('recovers acceptance after a real post-commit delivery loss and database reopening', async () => {
    const { runnerSource, request, source, dbPath } = await seeded();
    const claimRequest = await request();
    const announce = runnerSource.publicServices.workItems.announceTreeNow.bind(
      runnerSource.publicServices.workItems,
    );
    runnerSource.publicServices.workItems.announceTreeNow = async (projectId) => {
      await announce(projectId);
      throw new Error('reply delivery lost');
    };
    const throwing = createPlanCommandRunner(runnerSource, nodeDigest);
    await assertRuntimeRejection(
      throwing.claimRuntime(context, claimRequest),
      'reply delivery lost',
    );
    const before = await source.stores.runtimeCommands.inspectLedger();
    await source.close();
    const reopened = openSqliteSource({
      dbPath,
      organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
    });
    const bound = reopened.bindLivePlans({ schedulerOf: () => fastScheduler });
    try {
      const receiver = createRuntimeReceiver(bound.uow, nodeDigest);
      const accepted = value(
        await receiver.lookupRuntimeReceipt(context, {
          commandId: claimRequest.commandId,
          expectedLedgerId: claimRequest.expectedLedgerId,
        }),
      );
      expect(accepted.acceptance.kind).toBe('claim');
      if (accepted.acceptance.kind !== 'claim') throw new Error('recovered receipt has wrong kind');
      const precise = { ...accepted, acceptance: accepted.acceptance };
      const retry = createPlanCommandRunner(
        {
          ...runnerSource,
          uow: bound.uow,
          batchServices: () => {
            throw new Error('reopened replay applied');
          },
        },
        nodeDigest,
      );
      expect(await retry.claimRuntime(context, claimRequest)).toEqual({ ok: true, value: precise });
      expect(await bound.stores.runtimeCommands.inspectLedger()).toEqual(before);
    } finally {
      await bound.close();
    }
  });

  it('captures committed shared observations and keeps replay silent', async () => {
    const { runner, request, snapshot, captures, delivered } = await seeded(true);
    const claimRequest = await request();
    const capturedBefore = captures();
    const deliveredBefore = delivered.length;
    const accepted = await runner.claimRuntime(context, claimRequest);
    value(accepted);
    expect(captures()).toBe(capturedBefore + 2);
    expect(delivered.length).toBe(deliveredBefore);
    const after = await snapshot();
    expect(await runner.claimRuntime(context, claimRequest)).toEqual(accepted);
    expect(await snapshot()).toEqual(after);
    expect(captures()).toBe(capturedBefore + 2);
  });

  it('retains resource exhaustion detail from existing default demand semantics', async () => {
    const { runner, request, source } = await seeded();
    const created = await runner.runDirectoryWithin(
      'ada',
      [{ kind: 'createResource', name: 'RAM', resourceKind: 'divisible', unitLabel: 'GB' }],
      context.access,
    );
    if (!created.ok) throw new Error('resource creation refused');
    const resourceId = created.results.at(0)?.id;
    if (resourceId === undefined) throw new Error('resource ID missing');
    expect(
      await runner.runWithin(
        'a1',
        'ada',
        [
          { kind: 'setResourceCapacity', resourceId, units: 1 },
          { kind: 'setDemand', workItemId: 'other', resourceId, units: 1 },
          { kind: 'setDemand', workItemId: 'leaf', resourceId, units: 1 },
          {
            kind: 'claimWorkItem',
            workItemId: 'other',
            personId: 'agent',
            steps: ['dev'],
            runId: 'ordinary',
          },
        ],
        context.access,
        null,
      ),
    ).toMatchObject({ ok: true });
    const claimRequest = await request();
    const refusal = {
      ok: false as const,
      at: 0,
      kind: 'claimWorkItem' as const,
      reason: 'resources_exhausted' as const,
      detail: {
        resourceId,
        asked: 1,
        free: 0,
        holders: [{ workItemId: 'other', personId: 'agent', name: 'Agent', runId: 'ordinary' }],
      },
    };
    expect(await runner.claimRuntime(context, claimRequest)).toEqual(refusal);
    expect(
      await source.stores.runtimeCommands.readAttemptBinding(
        { organizationId: 'org-a', projectId: 'a1', personId: 'agent' },
        'store',
        'attempt-a',
      ),
    ).toBeNull();
  });

  it('requires the current generation and pins a fresh command before applying', async () => {
    const { runner, request, snapshot } = await seeded();
    const claimRequest = await request();
    const before = await snapshot();
    expect(
      await runner.claimRuntime(context, {
        ...claimRequest,
        authority: { ...claimRequest.authority, generation: 2 },
      }),
    ).toEqual({ ok: false, reason: 'runtime_authority_stale' });
    expect(
      await runner.claimRuntime(context, { ...claimRequest, expectedLedgerId: 'different' }),
    ).toEqual({ ok: false, reason: 'runtime_ledger_mismatch' });
    expect(await snapshot()).toEqual(before);
  });

  it('detaches nested requests and current identity before a real queued admission', async () => {
    const { runner, request, source, receiver } = await seeded();
    const original = await request();
    const mutable = {
      ...original,
      authority: { ...original.authority },
      action: { ...original.action, execution: { ...original.action.execution } },
    };
    const identity = {
      projectId: 'a1',
      personId: 'agent',
      actor: { ...actor },
      access: {
        kind: 'scoped' as const,
        scope: { organizationId: 'org-a', userId: 'ada', role: 'member' as const },
      },
    };
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const writer = source.uow.run(async () => {
      entered.resolve(undefined);
      await release.promise;
      return { commit: true, value: undefined };
    });
    await entered.promise;
    const claiming = runner.claimRuntime(identity, mutable);
    identity.projectId = 'b1';
    identity.personId = 'unknown';
    identity.actor.id = 'unknown';
    identity.access.scope.organizationId = 'org-b';
    mutable.commandId = 'changed';
    mutable.expectedBasis = 'rb1:' + 'b'.repeat(64);
    mutable.authority.ownerId = 'changed';
    mutable.authority.generation = 2;
    mutable.action.workItemId = 'other';
    mutable.action.stepId = 'review';
    mutable.action.parentClaimId = 'changed';
    Object.assign(mutable.action.execution, {
      storeId: 'changed',
      runId: 'changed',
      attemptId: 'changed',
      sessionId: 'changed',
    });
    release.resolve(undefined);
    await writer;
    const accepted = value(await claiming);
    expect(accepted).toMatchObject({
      commandId: 'claim',
      actorId: 'ada',
      scope: { projectId: 'a1', personId: 'agent', organizationId: 'org-a' },
      acceptance: {
        authority: original.authority,
        claim: {
          workItemId: 'leaf',
          stepId: 'dev',
          parentClaimId: null,
          execution: original.action.execution,
        },
      },
    });
    expect(
      await receiver.lookupRuntimeReceipt(context, {
        commandId: 'claim',
        expectedLedgerId: original.expectedLedgerId,
      }),
    ).toEqual({ ok: true, value: accepted });
    expect(await runner.claimRuntime(context, original)).toEqual({ ok: true, value: accepted });
  });

  it.each(['workItemId', 'stepId', 'personId', 'runId', 'parentClaimId'] as const)(
    'throws if the borrowed post-apply exact claim disagrees on %s',
    async (field) => {
      const { runnerSource, request, snapshot } = await seeded();
      const claimRequest = await request();
      const before = await snapshot();
      const uow = runnerSource.uow;
      const broken = createPlanCommandRunner(
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
                        if (key === 'listByProject')
                          return async (projectId: string) =>
                            (await target.listByProject(projectId)).map((claim) => ({
                              ...claim,
                              [field]: 'broken',
                            }));
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
      await assertRuntimeRejection(
        broken.claimRuntime(context, claimRequest),
        'applied runtime claim target is missing or ambiguous',
      );
      expect(await snapshot()).toEqual(before);
    },
  );

  it('compiles the optional parent through existing delegated claim semantics', async () => {
    const { runner, request, source } = await seeded();
    expect(
      await runner.runWithin(
        'a1',
        'ada',
        [
          { kind: 'moveWorkItem', workItemId: 'leaf', parentId: 'other', afterId: null },
          {
            kind: 'claimWorkItem',
            workItemId: 'other',
            personId: 'agent',
            runId: 'parent-session',
          },
        ],
        context.access,
        null,
      ),
    ).toMatchObject({ ok: true });
    const parent = (await source.stores.claims.listByProject('a1')).find(
      ({ workItemId }) => workItemId === 'other',
    );
    if (parent === undefined) throw new Error('parent claim missing');
    const claimRequest = await request();
    const accepted = value(
      await runner.claimRuntime(context, {
        ...claimRequest,
        action: { ...claimRequest.action, parentClaimId: parent.id },
      }),
    );
    expect(accepted.acceptance.claim.parentClaimId).toBe(parent.id);
    expect(
      await source.stores.claims.findById('a1', accepted.acceptance.claim.claimId),
    ).toMatchObject({ parentClaimId: parent.id, runId: 'sess-42', stepId: 'dev' });
  });

  it('replays historical claim authority after takeover while refusing new old-owner IDs', async () => {
    const { runner, receiver, request, snapshot } = await seeded();
    const claimRequest = await request();
    const accepted = await runner.claimRuntime(context, claimRequest);
    value(accepted);
    value(
      await receiver.acquireRuntimeAuthority(context, {
        schemaVersion: 1,
        commandId: 'takeover',
        expectedLedgerId: claimRequest.expectedLedgerId,
        ownerId: 'next-owner',
        expectedGeneration: 1,
      }),
    );
    const before = await snapshot();
    expect(await runner.claimRuntime(context, claimRequest)).toEqual(accepted);
    const next = await request('new-command', 'new-attempt');
    expect(await runner.claimRuntime(context, next)).toEqual({
      ok: false,
      reason: 'runtime_authority_stale',
    });
    expect(await snapshot()).toEqual(before);
  });
});
