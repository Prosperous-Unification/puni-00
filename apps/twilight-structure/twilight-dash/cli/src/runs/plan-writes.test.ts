import {
  canonicalRuntimeRequest,
  parseCanonicalRuntimeRequest,
  type RuntimeWriteRequest,
} from '@wbs/contracts';
import { expect, test } from 'bun:test';

import {
  planWriteAcceptance,
  planWriteStage,
  writeAcceptanceTransition,
  type WriteFacts,
  writeStageTransition,
} from './plan-writes';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { createWriteFixture } from './testing/write-fixture';
import { attemptId, executionCommandId, organizationId, ownerId, runId } from './value-codecs';
import type { WriteAcceptCommand, WriteStageCommand } from './write-records';

async function withFixture(
  run: (fixture: Awaited<ReturnType<typeof createWriteFixture>>) => void | Promise<void>,
) {
  const clock = new FixtureClock();
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 10000,
    clock,
  });
  try {
    await run(await createWriteFixture({ ...stores, clock }));
  } finally {
    await stores.close();
  }
}
function stageFixture(fixture: Awaited<ReturnType<typeof createWriteFixture>>) {
  const stage = planWriteStage(fixture.facts, fixture.guard, fixture.command);
  expect(stage.kind).toBe('applied');
  if (stage.kind !== 'applied') throw new Error('expected write stage plan');
  const facts: WriteFacts = {
    ...fixture.facts,
    run: { ...fixture.facts.run, revision: stage.value.runRevision },
    attempt: stage.value.ack.attempt,
    scope: {
      ...fixture.facts.scope,
      revision: stage.value.intent.stagedRevision,
      intents: [...fixture.facts.scope.intents, stage.value.intent],
      pendingCommandId: stage.value.intent.commandId,
    },
    runtime: {
      ...fixture.facts.runtime,
      intents: [...fixture.facts.runtime.intents, stage.value.intent],
    },
    writes: [stage.value.record],
    obligations: [stage.value.obligation],
  };
  const guard = {
    ...fixture.guard,
    expectedRevision: facts.run.revision,
    expectedAttemptRevision: facts.attempt.revision,
    expectedScopeRevision: facts.scope.revision,
  };
  const command: WriteAcceptCommand = {
    version: 1,
    kind: 'accept_write',
    commandId: executionCommandId('accept-write'),
    stageCommandId: fixture.command.commandId,
    intent: stage.value.intent,
    evidence: fixture.stateEvidence,
    projection: {
      version: 1,
      actorId: 'account',
      basisAfter: 'rb1:' + 'c'.repeat(64),
      applied: [
        { index: 0, kind: 'setProgress' },
        { index: 1, kind: 'releaseWorkItem' },
      ],
    },
  };
  return { stage: stage.value, facts, guard, command };
}
function changeRequest(
  command: WriteStageCommand,
  transform: (operation: RuntimeWriteRequest) => RuntimeWriteRequest,
) {
  const request = parseCanonicalRuntimeRequest(command.canonicalRequest);
  if ('kind' in request.operation || request.operation.action.kind !== 'write')
    throw new Error('fixture requires write operation');
  const operation: RuntimeWriteRequest = { ...request.operation, action: request.operation.action };
  return {
    ...command,
    canonicalRequest: canonicalRuntimeRequest(request.scope, transform(operation)),
  };
}

test('stage commits approved write and frees capacity once', async () =>
  withFixture((fixture) => {
    const before = structuredClone(fixture.facts);
    const { stage, facts, guard } = stageFixture(fixture);
    expect(stage.ack.attempt.holdsCapacity).toBe(false);
    expect(stage.ack.intent.canonicalRequest).toBe(fixture.canonicalRequest);
    expect(stage.ack.obligation.disposition).toEqual({ kind: 'pending' });
    expect(stage.runRevision).toBe(fixture.facts.run.revision + 1);
    expect(stage.ack.attempt.revision).toBe(fixture.facts.attempt.revision + 1);
    expect(stage.record.context.scopeRevision).toBe(fixture.guard.expectedScopeRevision);
    expect(fixture.facts).toEqual(before);
    const replay = planWriteStage(facts, guard, fixture.command);
    expect(replay.kind).toBe('duplicate');
    if (replay.kind === 'refused') throw new Error('expected original stage');
    expect(replay.value.ack).toEqual(stage.ack);
    expect(replay.value.record).toEqual(stage.record);
    expect(replay.value.ack).not.toBe(facts.writes[0].reply);
    expect(replay.value.ack.attempt).not.toBe(facts.writes[0].reply.attempt);
  }));

test('acceptance closes exact obligation once and original replays survive later facts', async () =>
  withFixture((fixture) => {
    const { stage, facts, guard, command } = stageFixture(fixture);
    const accepted = planWriteAcceptance(facts, guard, command);
    expect(accepted.kind).toBe('applied');
    if (accepted.kind !== 'applied') throw new Error('expected acceptance');
    expect(accepted.value.obligationKey).toBe(fixture.command.commandId);
    expect(accepted.value.ack.attempt.state.kind).toBe('write_terminal');
    expect(accepted.value.ack.attempt.holdsCapacity).toBe(false);
    expect(accepted.value.ack.attempt.revision).toBe(facts.attempt.revision + 1);
    expect(accepted.value.acceptance.acceptedRevision).toBe(facts.scope.revision + 1);
    const later = {
      ...facts,
      run: { ...facts.run, revision: facts.run.revision + 5 },
      attempt: { ...accepted.value.ack.attempt, revision: accepted.value.ack.attempt.revision + 5 },
      scope: { ...facts.scope, revision: facts.scope.revision + 9, pendingCommandId: null },
      obligations: [],
      writes: [...facts.writes, accepted.value.record],
      runtime: {
        ...facts.runtime,
        acceptances: [...facts.runtime.acceptances, accepted.value.acceptance],
      },
    };
    const replay = planWriteAcceptance(later, fixture.guard, command);
    expect(replay.kind).toBe('duplicate');
    if (replay.kind === 'refused') throw new Error('expected immutable acceptance');
    expect(replay.value.ack).toEqual(accepted.value.ack);
    expect(planWriteStage(later, fixture.guard, fixture.command)).toMatchObject({
      kind: 'duplicate',
      value: { ack: stage.ack },
    });
  }));

test('stage refuses stale scope run attempt revisions and independently mismatched target ownership', async () =>
  withFixture((fixture) => {
    for (const guard of [
      { ...fixture.guard, expectedRevision: 0 },
      { ...fixture.guard, expectedAttemptRevision: 0 },
      { ...fixture.guard, expectedScopeRevision: 0 },
    ])
      expect(planWriteStage(fixture.facts, guard, fixture.command)).toEqual({
        kind: 'refused',
        reason: 'revision_conflict',
      });
    for (const guard of [
      { ...fixture.guard, runId: 'other' },
      { ...fixture.guard, attemptId: attemptId('other') },
      { ...fixture.guard, ownership: { ...fixture.guard.ownership, ownerId: ownerId('other') } },
      { ...fixture.guard, ownership: { ...fixture.guard.ownership, storeId: 'other' } },
      { ...fixture.guard, scope: { ...fixture.guard.scope, personId: 'other' } },
    ])
      expect(
        planWriteStage(fixture.facts, guard as typeof fixture.guard, fixture.command).kind,
      ).toBe('refused');
  }));

test('stage refuses pending recovery reservation state operation and unsettled completion', async () =>
  withFixture((fixture) => {
    const { facts, guard, command } = fixture;
    for (const changed of [
      { ...facts, attempt: { ...facts.attempt, holdsCapacity: false } },
      {
        ...facts,
        attempt: {
          ...facts.attempt,
          state: {
            kind: 'interrupted',
            checkpoint: fixture.checkpoint,
            quiescence: fixture.quiescence,
          },
        },
      },
      { ...facts, scope: { ...facts.scope, pendingCommandId: 'pending' } },
      {
        ...facts,
        runtime: {
          ...facts.runtime,
          recovery: {
            ...facts.runtime.recovery,
            active: [{ scope: guard.scope, recoveryId: 'recovery' }],
          },
        },
      },
    ])
      expect(planWriteStage(changed as WriteFacts, guard, command).kind).toBe('refused');
    for (const effect of ['unknown', 'failed'])
      expect(
        planWriteStage(facts, guard, {
          ...command,
          completion: {
            ...command.completion,
            quiescence: { ...command.completion.quiescence, effect },
          },
        } as WriteStageCommand).kind,
      ).toBe('refused');
    expect(
      planWriteStage(facts, guard, {
        ...command,
        canonicalRequest: fixture.execution.binding.intent.canonicalRequest,
      }).kind,
    ).toBe('refused');
    expect(
      planWriteStage(facts, guard, {
        ...command,
        completion: {
          ...command.completion,
          quiescence: { ...command.completion.quiescence, operationKey: 'other' },
        },
      } as WriteStageCommand).kind,
    ).toBe('refused');
  }));

test('stage refuses coherent authority and every request target mismatch', async () =>
  withFixture((fixture) => {
    const { facts, guard, command } = fixture;
    const edits = [
      (operation: RuntimeWriteRequest) => ({
        ...operation,
        authority: { ...operation.authority, generation: 2 },
      }),
      (operation: RuntimeWriteRequest) => ({
        ...operation,
        authority: { ...operation.authority, ownerId: 'other' },
      }),
      (operation: RuntimeWriteRequest) => ({ ...operation, expectedLedgerId: 'other' }),
      (operation: RuntimeWriteRequest) => ({
        ...operation,
        expectedBasis: 'rb1:' + 'd'.repeat(64),
      }),
      ...['claimId', 'workItemId', 'stepId', 'parentClaimId'].map(
        (key) => (operation: RuntimeWriteRequest) => ({
          ...operation,
          action: { ...operation.action, claim: { ...operation.action.claim, [key]: 'other' } },
        }),
      ),
      ...['storeId', 'runId', 'attemptId', 'sessionId'].map(
        (key) => (operation: RuntimeWriteRequest) => ({
          ...operation,
          action: {
            ...operation.action,
            claim: {
              ...operation.action.claim,
              execution: { ...operation.action.claim.execution, [key]: 'other' },
            },
          },
        }),
      ),
      (operation: RuntimeWriteRequest) => ({
        ...operation,
        action: {
          ...operation.action,
          commands: [{ ...operation.action.commands[0], workItemId: 'other' }],
        },
      }),
      (operation: RuntimeWriteRequest) => ({
        ...operation,
        action: {
          ...operation.action,
          commands: [{ ...operation.action.commands[0], stepId: 'other' }],
        },
      }),
      (operation: RuntimeWriteRequest) => ({
        ...operation,
        action: {
          ...operation.action,
          commands: [{ ...operation.action.commands[1], personId: 'other' }],
        },
      }),
      (operation: RuntimeWriteRequest) => ({
        ...operation,
        action: {
          ...operation.action,
          commands: [{ ...operation.action.commands[1], steps: ['other'] }],
        },
      }),
      (operation: RuntimeWriteRequest) => ({
        ...operation,
        action: {
          ...operation.action,
          commands: [operation.action.commands[1], operation.action.commands[0]],
        },
      }),
    ];
    for (const edit of edits)
      expect(planWriteStage(facts, guard, changeRequest(command, edit)).kind).toBe('refused');
    for (const [key, value] of [
      ['workItemId', 'other'],
      ['stepId', 'other'],
      ['stepCode', 'other'],
      ['ledgerId', 'other'],
      ['basis', 'rb1:' + 'd'.repeat(64)],
    ])
      expect(
        planWriteStage(facts, guard, {
          ...command,
          observation: { ...command.observation, [key]: value },
        }).kind,
      ).toBe('refused');
    expect(
      planWriteStage(
        { ...facts, scope: { ...facts.scope, generationFloor: 2 } } as WriteFacts,
        guard,
        command,
      ).kind,
    ).toBe('refused');
    const acquisition = facts.scope.intents.find((intent) => intent.commandId === 'authority');
    if (acquisition === undefined) throw new Error('authority fixture missing');
    expect(
      planWriteStage(
        {
          ...facts,
          scope: {
            ...facts.scope,
            intents: facts.scope.intents.map((intent) =>
              intent.commandId === 'authority'
                ? { ...intent, localOwner: { ...intent.localOwner, epoch: 2 } }
                : intent,
            ),
          },
        },
        guard,
        command,
      ).kind,
    ).toBe('refused');
  }));

test('global submission and wire associations refuse borrowing while unrelated lexical equality remains valid', async () =>
  withFixture((fixture) => {
    const { facts, command, guard } = fixture;
    const foreign = structuredClone(facts.submissions.at(0));
    if (foreign === undefined) throw new Error('submission fixture missing');
    const localCollision = {
      ...foreign,
      command: { ...foreign.command, commandId: command.commandId },
    };
    expect(
      planWriteStage(
        { ...facts, submissions: [...facts.submissions, localCollision] } as WriteFacts,
        guard,
        command,
      ).kind,
    ).toBe('refused');
    expect(
      planWriteStage(
        {
          ...facts,
          runtime: {
            ...facts.runtime,
            intents: [
              ...facts.runtime.intents,
              { ...fixture.execution.binding.intent, commandId: 'wire-write' },
            ],
          },
        },
        guard,
        command,
      ).kind,
    ).toBe('refused');
    expect(
      planWriteStage(facts, guard, { ...command, commandId: executionCommandId('authority') }).kind,
    ).toBe('applied');
    expect(
      planWriteStage(
        facts,
        guard,
        changeRequest(command, (operation) => ({
          ...operation,
          commandId: facts.submissions[0].command.commandId,
        })),
      ).kind,
    ).toBe('applied');
    const { facts: staged, stage } = stageFixture(fixture);
    expect(
      planWriteStage(staged, guard, { ...command, commandId: executionCommandId('another-stage') })
        .kind,
    ).toBe('refused');
    expect(
      planWriteStage(staged, guard, {
        ...command,
        completion: {
          ...command.completion,
          outcome: { ...command.completion.outcome, summary: 'changed' },
        },
      }).kind,
    ).toBe('refused');
    const wrongTarget = { ...stage.record, runId: runId('foreign') };
    expect(planWriteStage({ ...staged, writes: [wrongTarget] }, guard, command).kind).toBe(
      'refused',
    );
  }));

test('acceptance independently rejects altered association obligation pending recovery revisions and projection', async () =>
  withFixture((fixture) => {
    const { facts, guard, command } = stageFixture(fixture);
    for (const changed of [
      { ...command, stageCommandId: executionCommandId('other') },
      { ...command, commandId: command.stageCommandId },
      {
        ...command,
        intent: { ...command.intent, localOwner: { ...command.intent.localOwner, epoch: 9 } },
      },
      {
        ...command,
        projection: { ...command.projection, applied: [{ index: 0, kind: 'patchWorkItem' }] },
      },
    ])
      expect(planWriteAcceptance(facts, guard, changed as WriteAcceptCommand).kind).toBe('refused');
    for (const changed of [
      { ...facts, scope: { ...facts.scope, pendingCommandId: null } },
      { ...facts, obligations: [] },
      {
        ...facts,
        obligations: facts.obligations.map((obligation) => ({
          ...obligation,
          disposition: { kind: 'fenced_nonaccepted', recoveryId: 'recovery' },
        })),
      },
      {
        ...facts,
        runtime: {
          ...facts.runtime,
          intents: facts.runtime.intents.filter(
            (intent) => intent.commandId !== command.intent.commandId,
          ),
        },
      },
      {
        ...facts,
        runtime: {
          ...facts.runtime,
          acceptances: [
            ...facts.runtime.acceptances,
            {
              version: 1,
              commandId: command.intent.commandId,
              requestDigest: command.intent.requestDigest,
              evidence: command.evidence,
              acceptedRevision: 99,
            },
          ],
        },
      },
      {
        ...facts,
        runtime: {
          ...facts.runtime,
          recovery: {
            ...facts.runtime.recovery,
            active: [{ scope: guard.scope, recoveryId: 'recovery' }],
          },
        },
      },
      { ...facts, attempt: { ...facts.attempt, holdsCapacity: true } },
      { ...facts, writes: [] },
    ])
      expect(planWriteAcceptance(changed as WriteFacts, guard, command).kind).toBe('refused');
    for (const changed of [
      { ...guard, expectedRevision: 0 },
      { ...guard, expectedAttemptRevision: 0 },
      { ...guard, expectedScopeRevision: 0 },
    ])
      expect(planWriteAcceptance(facts, changed, command)).toEqual({
        kind: 'refused',
        reason: 'revision_conflict',
      });
    expect(
      planWriteAcceptance(facts, guard, {
        ...command,
        commandId: executionCommandId(command.intent.commandId),
      }).kind,
    ).toBe('applied');
  }));

test('acceptance requires independent scope intent and original pending completion', async () =>
  withFixture((fixture) => {
    const { facts, guard, command } = stageFixture(fixture);
    expect(
      planWriteAcceptance(
        {
          ...facts,
          scope: {
            ...facts.scope,
            intents: facts.scope.intents.filter(
              (intent) => intent.commandId !== command.intent.commandId,
            ),
          },
        },
        guard,
        command,
      ).kind,
    ).toBe('refused');
    if (facts.attempt.version !== 4) throw new Error('fixture requires write attempt');
    const attempt = {
      ...facts.attempt,
      state: {
        ...facts.attempt.state,
        outcome: { ...facts.attempt.state.outcome, summary: 'changed' },
      },
    };
    expect(planWriteAcceptance({ ...facts, attempt }, guard, command).kind).toBe('refused');
  }));

test('replay refuses changed acceptance and independently wrong target while preserving detached original acknowledgements', async () =>
  withFixture((fixture) => {
    const { facts, guard, command } = stageFixture(fixture);
    const accepted = planWriteAcceptance(facts, guard, command);
    if (accepted.kind !== 'applied') throw new Error('fixture requires acceptance');
    const later = {
      ...facts,
      attempt: accepted.value.ack.attempt,
      writes: [...facts.writes, accepted.value.record],
    };
    expect(
      planWriteAcceptance(later, guard, {
        ...command,
        evidence: { ...command.evidence, mediaType: 'other' },
      }).kind,
    ).toBe('refused');
    const differentTarget = { ...accepted.value.record, attemptId: attemptId('other') };
    expect(planWriteAcceptance({ ...later, writes: [differentTarget] }, guard, command).kind).toBe(
      'refused',
    );
    const replay = planWriteAcceptance(later, guard, command);
    if (replay.kind === 'refused') throw new Error('expected exact replay');
    expect(replay.value.ack).toEqual(accepted.value.ack);
    expect(replay.value.ack).not.toBe(accepted.value.ack);
    expect(replay.value.ack.attempt).not.toBe(accepted.value.ack.attempt);
    expect(
      planWriteAcceptance(facts, guard, { ...command, commandId: executionCommandId('prepare') })
        .kind,
    ).toBe('refused');
  }));

test('stage independently binds reconstructed scope accepted claim and current owner epoch', async () =>
  withFixture((fixture) => {
    const { facts, guard, command } = fixture;
    for (const changed of [
      { ...facts, ownership: { ...facts.ownership, owner: null } },
      { ...facts, ownership: { ...facts.ownership, epoch: facts.ownership.epoch + 1 } },
      {
        ...facts,
        scope: {
          ...facts.scope,
          intents: facts.scope.intents.filter(
            (intent) => intent.commandId !== fixture.execution.binding.intent.commandId,
          ),
          acceptances: facts.scope.acceptances.filter(
            (acceptance) => acceptance.commandId !== fixture.execution.binding.intent.commandId,
          ),
        },
      },
      {
        ...facts,
        scope: {
          ...facts.scope,
          acceptances: facts.scope.acceptances.filter(
            (acceptance) => acceptance.commandId !== fixture.execution.binding.intent.commandId,
          ),
        },
      },
      {
        ...facts,
        scope: {
          ...facts.scope,
          acceptances: facts.scope.acceptances.filter(
            (acceptance) => acceptance.commandId !== 'authority',
          ),
        },
      },
      { ...facts, attempt: { ...facts.attempt, state: { kind: 'queued' } } },
    ])
      expect(planWriteStage(changed as WriteFacts, guard, command).kind).toBe('refused');
    const parsed = parseCanonicalRuntimeRequest(command.canonicalRequest);
    expect(
      planWriteStage(facts, guard, {
        ...command,
        canonicalRequest: canonicalRuntimeRequest(
          { ...parsed.scope, personId: 'other' },
          parsed.operation,
        ),
      }).kind,
    ).toBe('refused');
    expect(
      planWriteStage(facts, guard, {
        ...command,
        observation: {
          ...command.observation,
          scope: { ...command.observation.scope, personId: 'other' },
        },
      }).kind,
    ).toBe('refused');
  }));

test('write collision matrix reserves recovery fence and acceptance IDs in both local and wire domains', async () =>
  withFixture((fixture) => {
    const { facts, guard, command } = fixture;
    const authority = facts.scope.intents.find((intent) => intent.commandId === 'authority');
    if (authority === undefined) throw new Error('fixture authority missing');
    const recovery = {
      intent: {
        recoveryId: 'recovery-reserved',
        target: { kind: 'claim', acceptanceCommandId: 'accept-reserved' },
      },
      fences: [
        { canonicalRequest: authority.canonicalRequest.replace('authority', 'fence-reserved') },
      ],
    };
    const histories = [recovery] as unknown as WriteFacts['runtime']['recovery']['histories'];
    const reservedFacts = {
      ...facts,
      runtime: { ...facts.runtime, recovery: { ...facts.runtime.recovery, histories } },
    };
    for (const identity of ['recovery-reserved', 'accept-reserved', 'fence-reserved']) {
      expect(
        planWriteStage(reservedFacts, guard, {
          ...command,
          commandId: executionCommandId(identity),
        }).kind,
      ).toBe('refused');
      expect(
        planWriteStage(
          reservedFacts,
          guard,
          changeRequest(command, (operation) => ({ ...operation, commandId: identity })),
        ).kind,
      ).toBe('refused');
    }
    expect(
      planWriteStage(facts, guard, { ...command, commandId: executionCommandId('wire-write') })
        .kind,
    ).toBe('applied');
  }));

test('historical transitions preserve consequences without today revision observations and late acceptance keeps original epoch', async () =>
  withFixture((fixture) => {
    const { stage, facts, command } = stageFixture(fixture);
    const staged = writeStageTransition(
      { ...fixture.facts, ownership: { ...fixture.facts.ownership, epoch: 99 } },
      fixture.command,
      fixture.owner,
    );
    expect(staged).toEqual({ kind: 'applied', value: stage.ack });
    const accepted = writeAcceptanceTransition(
      {
        ...facts,
        ownership: { ...facts.ownership, epoch: 99 },
        scope: { ...facts.scope, generationFloor: 99 },
      } as WriteFacts,
      command,
    );
    expect(accepted.kind).toBe('applied');
    if (accepted.kind === 'refused') throw new Error('expected historical acceptance');
    expect(accepted.value.receipt.acceptance.requestDigest).toBe(stage.intent.requestDigest);
    const currentOwnership = {
      ...fixture.guard.ownership,
      epoch: 2,
      ownerId: ownerId('next-owner'),
    };
    const lateFacts = {
      ...facts,
      ownership: { ...facts.ownership, epoch: 2, owner: currentOwnership },
    };
    const lateGuard = {
      ...fixture.guard,
      ownership: currentOwnership,
      expectedRevision: facts.run.revision,
      expectedAttemptRevision: facts.attempt.revision,
      expectedScopeRevision: facts.scope.revision,
    };
    expect(planWriteAcceptance(lateFacts, lateGuard, command).kind).toBe('applied');
  }));

test('write stage requires an actual turn checkpoint and returns precise unsupported-operation refusal', async () =>
  withFixture((fixture) => {
    const ready = {
      ...fixture.facts,
      attempt: {
        ...fixture.facts.attempt,
        state: { kind: 'ready', execution: fixture.execution, cause: { kind: 'initial' } },
      },
    } as WriteFacts;
    expect(planWriteStage(ready, fixture.guard, fixture.command)).toEqual({
      kind: 'refused',
      reason: 'state_conflict',
    });
    expect(
      writeStageTransition(
        fixture.facts,
        { ...fixture.command, canonicalRequest: fixture.execution.binding.intent.canonicalRequest },
        fixture.owner,
      ),
    ).toEqual({ kind: 'refused', reason: 'state_conflict' });
    const queued = {
      ...fixture.facts,
      attempt: { ...fixture.facts.attempt, state: { kind: 'queued' } },
    } as WriteFacts;
    expect(() => planWriteStage(queued, fixture.guard, fixture.command)).not.toThrow();
    expect(planWriteStage(queued, fixture.guard, fixture.command)).toEqual({
      kind: 'refused',
      reason: 'state_conflict',
    });
  }));

test('write stage diagnoses a corrupted retained claim operation', async () =>
  withFixture((fixture) => {
    const authority = fixture.facts.scope.intents.find(
      (intent) => intent.commandId === 'authority',
    );
    if (authority === undefined) throw new Error('fixture authority missing');
    const checkpoint = {
      ...fixture.checkpoint,
      execution: {
        ...fixture.checkpoint.execution,
        binding: { ...fixture.execution.binding, intent: authority },
      },
    };
    const attempt = fixture.facts.attempt;
    if (attempt.version !== 2) throw new Error('fixture requires executing attempt');
    const corrupted = {
      ...fixture.facts,
      attempt: { ...attempt, state: checkpoint },
    };
    expect(() => writeStageTransition(corrupted, fixture.command, fixture.owner)).toThrow(
      'write checkpoint claim operation differs',
    );
  }));

test('acceptance independently refuses altered immutable intent and preserves refusal routing', async () =>
  withFixture((fixture) => {
    const { facts, guard, command } = stageFixture(fixture);
    const changed = {
      ...command,
      intent: { ...command.intent, localOwner: { ...command.intent.localOwner, epoch: 9 } },
    };
    expect(planWriteAcceptance(facts, guard, changed).kind).toBe('refused');
    const changedStage = {
      ...fixture.command,
      completion: {
        ...fixture.command.completion,
        quiescence: { ...fixture.command.completion.quiescence, effect: 'unknown' as const },
      },
    };
    expect(() => planWriteStage(fixture.facts, fixture.guard, changedStage)).not.toThrow();
    expect(planWriteStage(fixture.facts, fixture.guard, changedStage)).toEqual({
      kind: 'refused',
      reason: 'state_conflict',
    });
    const changedProjection = {
      ...command,
      projection: {
        ...command.projection,
        applied: [{ index: 0, kind: 'patchWorkItem' as const }],
      },
    };
    expect(() => planWriteAcceptance(facts, guard, changedProjection)).not.toThrow();
    expect(planWriteAcceptance(facts, guard, changedProjection)).toEqual({
      kind: 'refused',
      reason: 'identity_conflict',
    });
    const foreignGuard = { ...guard, attemptId: 'foreign' } as typeof guard;
    expect(planWriteAcceptance(facts, foreignGuard, command).kind).toBe('refused');
  }));

test('all write transition and publication plans detach caller-owned commands checkpoints and original acknowledgements', async () =>
  withFixture((fixture) => {
    const { stage, facts, guard, command } = stageFixture(fixture);
    expect(stage.record.command).not.toBe(fixture.command);
    expect(stage.record.command.completion).not.toBe(fixture.command.completion);
    expect(stage.ack.attempt.state.checkpoint).not.toBe(fixture.facts.attempt.state);
    const transition = writeStageTransition(fixture.facts, fixture.command, fixture.owner);
    if (transition.kind === 'refused') throw new Error('expected transition');
    expect(transition.value.attempt.state.checkpoint).not.toBe(fixture.facts.attempt.state);
    const accepting = writeAcceptanceTransition(facts, command);
    if (accepting.kind === 'refused' || facts.attempt.version !== 4)
      throw new Error('expected acceptance transition');
    expect(accepting.value.attempt.state.checkpoint).not.toBe(facts.attempt.state.checkpoint);
    expect(accepting.value.receipt.projection).not.toBe(command.projection);
    const published = planWriteAcceptance(facts, guard, command);
    if (published.kind === 'refused') throw new Error('expected acceptance publication');
    expect(published.value.record.command).not.toBe(command);
    expect(published.value.record.command.projection).not.toBe(command.projection);
  }));

test('historical acceptance diagnoses a dependency returning a coherent nonwrite intent', async () =>
  withFixture((fixture) => {
    const { facts, command } = stageFixture(fixture);
    if (facts.attempt.version !== 4 || facts.attempt.state.kind !== 'write_pending')
      throw new Error('expected pending write');
    const original = fixture.execution.binding.intent;
    const state = { ...facts.attempt.state, intent: original };
    const obligation = { ...facts.obligations[0], intent: original };
    const stage = facts.writes.at(0);
    if (stage?.kind !== 'stage_write') throw new Error('expected retained stage');
    const corrupted = {
      ...facts,
      attempt: { ...facts.attempt, state },
      obligations: [obligation],
      scope: { ...facts.scope, pendingCommandId: original.commandId },
      writes: [
        {
          ...stage,
          reply: {
            ...stage.reply,
            intent: original,
            obligation,
            attempt: { ...stage.reply.attempt, state },
          },
        },
      ],
    } as WriteFacts;
    const submitted = { ...command, intent: original };
    expect(() => writeAcceptanceTransition(corrupted, submitted)).not.toThrow();
    expect(writeAcceptanceTransition(corrupted, submitted)).toEqual({
      kind: 'refused',
      reason: 'state_conflict',
    });
  }));

test('write acceptance forwards a modeled refusal without attempting publication', async () =>
  withFixture((fixture) => {
    const { facts, guard, command } = stageFixture(fixture);
    const changedProjection = {
      ...command,
      projection: {
        ...command.projection,
        applied: [{ index: 0, kind: 'patchWorkItem' as const }],
      },
    };
    expect(() => planWriteAcceptance(facts, guard, changedProjection)).not.toThrow();
    expect(planWriteAcceptance(facts, guard, changedProjection)).toEqual({
      kind: 'refused',
      reason: 'identity_conflict',
    });
  }));
