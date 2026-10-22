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
  const directory = mkdtempSync(join(tmpdir(), 'wbs-runtime-write-'));
  const dbPath = await openSpaceDatabase(directory);
  let forbidCapture = false;
  let captures = 0;
  let turns = 0;
  const sqlite = openSqliteSource({
    dbPath,
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
    captures: () => captures,
    turns: () => turns,
    blockCapture: () => {
      forbidCapture = true;
    },
  };
}

async function held(shared = false) {
  const fixture = await seeded(shared);
  const accepted = value(await fixture.runner.claimRuntime(context, await fixture.request()));
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
