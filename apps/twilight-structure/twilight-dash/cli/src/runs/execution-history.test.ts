import { organizationId } from './record-codecs';
import { executionHistoryContract } from './testing/execution-history-contract';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
executionHistoryContract('memory execution history', () => {
  const clock = new FixtureClock();
  return Promise.resolve({
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  });
});

import { expect, test } from 'bun:test';

import type { RecordedExecution } from './execution-records';
import { prepareSession } from './testing/fixtures';

for (const route of ['renewOwnership', 'retainManifest', 'createRun'] as const) {
  test('memory ' + route + ' audits lost execution history after owner fencing', async () => {
    const clock = new FixtureClock();
    const stores = {
      ...createMemoryStores({
        organizationId: organizationId('organization'),
        capacity: 2,
        leaseMilliseconds: 100,
        clock,
      }),
      clock,
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method -- This test intercepts and restores the exact prototype receiver; retaining the original function/receiver is intentional.
    const originalSet = Map.prototype.set;
    let retained: Map<string, RecordedExecution> | undefined;
    try {
      Map.prototype.set = function (key, value: unknown) {
        // The probe observes the execution map only; other map values remain untouched.
        const candidate = value as Partial<RecordedExecution> | undefined;
        if (
          candidate?.command?.kind === 'execution' &&
          candidate.command.fact.kind === 'session_prepared'
        )
          // eslint-disable-next-line @typescript-eslint/no-this-alias -- This test intercepts and restores the exact prototype receiver; retaining the original function/receiver is intentional.
          retained = this;
        return originalSet.call(this, key, value);
      };
      const setup = await prepareSession(stores);
      Map.prototype.set = originalSet;
      if (retained === undefined) throw new Error('execution map was not observed');
      const original = retained.get(setup.opened.commandId);
      if (original === undefined) throw new Error('opened execution was not retained');
      retained.delete(setup.opened.commandId);
      const invoke = (ownership: typeof setup.ownership) =>
        route === 'renewOwnership'
          ? stores.runs.renewOwnership(ownership)
          : route === 'retainManifest'
            ? stores.runs.retainManifest(ownership, setup.manifest)
            : stores.runs.createRun(ownership, setup.run);
      expect(await invoke({ ...setup.ownership, epoch: setup.ownership.epoch + 1 })).toEqual({
        kind: 'refused',
        reason: 'owner_stale',
      });
      // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
      await expect(invoke(setup.ownership)).rejects.toThrow(/provenance|revision|history/);
      retained.set(setup.opened.commandId, original);
      const restored = await invoke(setup.ownership);
      if (restored.kind === 'refused')
        throw new Error('restored operation refused: ' + restored.reason);
      expect(restored.value).toBeDefined();
    } finally {
      Map.prototype.set = originalSet;
      await stores.close();
    }
  });
}

import {
  invokeCoupledProvider,
  prepareCoupledProvider,
} from './testing/execution-history-contract';
for (const kind of ['stage_claim', 'accept_claim', 'stage_turn'] as const)
  test('memory coupled ' + kind + ' audits missing opened history before publication', async () => {
    const clock = new FixtureClock(),
      stores = {
        ...createMemoryStores({
          organizationId: organizationId('organization'),
          capacity: 2,
          leaseMilliseconds: 100,
          clock,
        }),
        clock,
      };
    // eslint-disable-next-line @typescript-eslint/unbound-method -- This test intercepts and restores the exact prototype receiver; retaining the original function/receiver is intentional.
    const originalSet = Map.prototype.set;
    let retained: Map<string, RecordedExecution> | undefined;
    try {
      Map.prototype.set = function (key, value: unknown) {
        // The probe observes the execution map only; other map values remain untouched.
        const candidate = value as Partial<RecordedExecution> | undefined;
        if (
          candidate?.command?.kind === 'execution' &&
          candidate.command.fact.kind === 'session_prepared'
        )
          // eslint-disable-next-line @typescript-eslint/no-this-alias -- This test intercepts and restores the exact prototype receiver; retaining the original function/receiver is intentional.
          retained = this;
        return originalSet.call(this, key, value);
      };
      const { setup, command, guard } = await prepareCoupledProvider(stores, kind);
      Map.prototype.set = originalSet;
      if (retained === undefined) throw new Error('execution map not observed');
      const opened = retained.get(setup.opened.commandId);
      if (opened === undefined) throw new Error('opened execution missing');
      retained.delete(setup.opened.commandId);
      expect(
        await invokeCoupledProvider(
          stores.runs,
          { ...guard, ownership: { ...guard.ownership, epoch: guard.ownership.epoch + 1 } },
          command,
        ),
      ).toEqual({ kind: 'refused', reason: 'owner_stale' });
      // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
      await expect(invokeCoupledProvider(stores.runs, guard, command)).rejects.toThrow(
        /provenance|revision|history/,
      );
      retained.set(setup.opened.commandId, opened);
      expect((await invokeCoupledProvider(stores.runs, guard, command)).kind).toBe('applied');
    } finally {
      Map.prototype.set = originalSet;
      await stores.close();
    }
  });

for (const kind of ['stage_claim', 'accept_claim', 'stage_turn'] as const)
  test(
    'memory coupled ' + kind + ' audits missing opened history before duplicate replay',
    async () => {
      const clock = new FixtureClock(),
        stores = {
          ...createMemoryStores({
            organizationId: organizationId('organization'),
            capacity: 2,
            leaseMilliseconds: 100,
            clock,
          }),
          clock,
        };
      // eslint-disable-next-line @typescript-eslint/unbound-method -- This test intercepts and restores the exact prototype receiver; retaining the original function/receiver is intentional.
      const originalSet = Map.prototype.set;
      let retained: Map<string, RecordedExecution> | undefined;
      try {
        Map.prototype.set = function (key, value: unknown) {
          // The probe observes the execution map only; other map values remain untouched.
          const candidate = value as Partial<RecordedExecution> | undefined;
          if (
            candidate?.command?.kind === 'execution' &&
            candidate.command.fact.kind === 'session_prepared'
          )
            // eslint-disable-next-line @typescript-eslint/no-this-alias -- This test intercepts and restores the exact prototype receiver; retaining the original function/receiver is intentional.
            retained = this;
          return originalSet.call(this, key, value);
        };
        const { setup, command, guard } = await prepareCoupledProvider(stores, kind);
        Map.prototype.set = originalSet;
        const committed = await invokeCoupledProvider(stores.runs, guard, command);
        if (committed.kind !== 'applied') throw new Error('fixture did not publish');
        if (retained === undefined) throw new Error('execution map not observed');
        const opened = retained.get(setup.opened.commandId);
        if (opened === undefined) throw new Error('opened execution missing');
        retained.delete(setup.opened.commandId);
        expect(
          await invokeCoupledProvider(
            stores.runs,
            { ...guard, ownership: { ...guard.ownership, epoch: guard.ownership.epoch + 1 } },
            command,
          ),
        ).toEqual({ kind: 'refused', reason: 'owner_stale' });
        // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-confusing-void-expression -- Bun rejection matchers complete asynchronously despite their void declaration; keep the assertion awaited.
        await expect(invokeCoupledProvider(stores.runs, guard, command)).rejects.toThrow(
          /provenance|revision|history/,
        );
        retained.set(setup.opened.commandId, opened);
        const replay: unknown = await invokeCoupledProvider(stores.runs, guard, command);
        expect(replay).toEqual({
          kind: 'duplicate',
          value: committed.value,
        });
      } finally {
        Map.prototype.set = originalSet;
        await stores.close();
      }
    },
  );

import { parseOrThrow } from '@shared/validation';
import { digestWithout, verifyDigest } from '@twilight-burokrat/contracts';
import { beforeAll, describe } from 'bun:test';

import * as executionCodecs from './execution-codecs';
import {
  decodeAttempt,
  decodeCompletion,
  decodeExecutionCommand,
  decodeExecutionFact,
  decodeProgressIntent,
  decodeReceipt,
} from './record-codecs';
import { unwrapReply } from './testing/fixtures';
import { prepareReceipt } from './testing/receipts-contract';
describe('local strict compositions', () => {
  let references: Record<string, unknown> | undefined;
  beforeAll(async () => {
    const clock = new FixtureClock(),
      stores = {
        ...createMemoryStores({
          organizationId: organizationId('organization'),
          capacity: 2,
          leaseMilliseconds: 100,
          clock,
        }),
        clock,
      };
    try {
      const setup = await prepareReceipt(stores);
      unwrapReply(await stores.runs.reconcileReceipt(await setup.currentGuard(), setup.receipt));
      const history = await stores.runs.readExecutionHistory(
        setup.run.runId,
        setup.attempt.attemptId,
      );
      const preparation = history.executions.find(
        (entry) =>
          entry.command.kind === 'execution' && entry.command.fact.kind === 'preparation_intended',
      );
      const execution = history.executions.find(
        (entry) =>
          entry.command.kind === 'execution' && entry.command.fact.kind === 'session_prepared',
      );
      const staged = history.executions.find((entry) => entry.command.kind === 'stage_claim');
      const accepted = history.executions.find((entry) => entry.command.kind === 'accept_claim');
      const turn = history.executions.find((entry) => entry.command.kind === 'stage_turn');
      if (
        preparation?.command.kind !== 'execution' ||
        preparation.command.fact.kind !== 'preparation_intended' ||
        execution?.command.kind !== 'execution' ||
        staged?.command.kind !== 'stage_claim' ||
        accepted?.command.kind !== 'accept_claim' ||
        turn?.command.kind !== 'stage_turn' ||
        turn.reply.kind !== 'turn_staged' ||
        accepted.reply.kind !== 'claim_accepted' ||
        history.completion === null ||
        history.receipt === null
      )
        throw new Error('retained codec fixture incomplete');
      const intent = preparation.command.fact.intent,
        session = setup.execution.session;
      references = {
        TargetObservationCodec: intent.target.observation,
        PreparationIntentCodec: intent,
        AttachmentCodec: session.attachment,
        ClaimProjectionCodec: accepted.command.projection,
        ClaimBindingCodec: accepted.reply.binding,
        ClaimRefCodec: setup.claim,
        TurnIntentCodec: turn.reply.intent,
        LocatedCodec: session,
        ClaimedCodec: setup.execution,
        ProgressIntentCodec: history.completion.completion.intent,
        CommandReceiptCodec: history.receipt.receipt,
        CompletionCodec: history.completion.completion,
        CheckpointCodec: turn.reply.attempt.state,
        AttemptStateCodec: history.attempt.state,
        AttemptCodec: history.attempt,
        ExecutionFactCodec: execution.command.fact,
        ExecutionCommandCodec: execution.command,
        ClaimStageCommandCodec: staged.command,
        ClaimAcceptCommandCodec: accepted.command,
        TurnStageCommandCodec: turn.command,
        ScopeContextCodec: turn.context,
        ExecutionRecordCodec: { version: 1, command: turn.command, context: turn.context },
        RecordedExecutionCodec: turn,
        CompletionRecordCodec: {
          version: 1,
          completion: history.completion.completion,
          reply: history.completion.reply,
        },
        ScopedAttemptGuardCodec: await setup.scopedGuard(),
        plainRecord: { version: 1, command: execution.command, context: null },
        plainRecorded: execution,
        stageRecorded: staged,
        acceptRecorded: accepted,
      };
    } finally {
      await stores.close();
    }
  });
  const boundaries: {
    name: string;
    required: string;
    version?: number;
    decode: (input: unknown) => unknown;
  }[] = [
    {
      name: 'TargetObservationCodec',
      required: 'evidence',
      version: 1,
      decode: (input) => parseOrThrow(executionCodecs.TargetObservationCodec, input),
    },
    {
      name: 'PreparationIntentCodec',
      required: 'target',
      version: 1,
      decode: (input) => parseOrThrow(executionCodecs.PreparationIntentCodec, input),
    },
    {
      name: 'AttachmentCodec',
      required: 'owner',
      version: 1,
      decode: (input) => parseOrThrow(executionCodecs.AttachmentCodec, input),
    },
    {
      name: 'ClaimProjectionCodec',
      required: 'claimId',
      version: 1,
      decode: (input) => parseOrThrow(executionCodecs.ClaimProjectionCodec, input),
    },
    {
      name: 'ClaimBindingCodec',
      required: 'projection',
      version: 1,
      decode: (input) => parseOrThrow(executionCodecs.ClaimBindingCodec, input),
    },
    {
      name: 'ClaimRefCodec',
      required: 'requestDigest',
      version: 1,
      decode: (input) => parseOrThrow(executionCodecs.ClaimRefCodec, input),
    },
    {
      name: 'TurnIntentCodec',
      required: 'grantCommandId',
      version: 1,
      decode: (input) => parseOrThrow(executionCodecs.TurnIntentCodec, input),
    },
    {
      name: 'LocatedCodec',
      required: 'attachment',
      version: 1,
      decode: (input) => parseOrThrow(executionCodecs.LocatedCodec, input),
    },
    {
      name: 'ClaimedCodec',
      required: 'binding',
      version: 1,
      decode: (input) => parseOrThrow(executionCodecs.ClaimedCodec, input),
    },
    { name: 'CommandReceiptCodec', required: 'claim', version: 2, decode: decodeReceipt },
    { name: 'CompletionCodec', required: 'quiescence', version: 2, decode: decodeCompletion },
    {
      name: 'CheckpointCodec',
      required: 'turn',
      decode: (input) => parseOrThrow(executionCodecs.CheckpointCodec, input),
    },
    {
      name: 'AttemptStateCodec',
      required: 'receipt',
      decode: (input) => parseOrThrow(executionCodecs.AttemptStateCodec, input),
    },
    { name: 'AttemptCodec', required: 'admittedEpoch', version: 2, decode: decodeAttempt },
    { name: 'ExecutionFactCodec', required: 'locator', decode: decodeExecutionFact },
    { name: 'ExecutionCommandCodec', required: 'fact', version: 2, decode: decodeExecutionCommand },
    {
      name: 'ClaimStageCommandCodec',
      required: 'observation',
      version: 2,
      decode: executionCodecs.decodeClaimStageCommand,
    },
    {
      name: 'ClaimAcceptCommandCodec',
      required: 'projection',
      version: 2,
      decode: executionCodecs.decodeClaimAcceptCommand,
    },
    {
      name: 'TurnStageCommandCodec',
      required: 'request',
      version: 2,
      decode: executionCodecs.decodeTurnStageCommand,
    },
    {
      name: 'ScopeContextCodec',
      required: 'scopeRevision',
      version: 1,
      decode: (input) => parseOrThrow(executionCodecs.ScopeContextCodec, input),
    },
    {
      name: 'ExecutionRecordCodec',
      required: 'context',
      version: 1,
      decode: (input) => parseOrThrow(executionCodecs.ExecutionRecordCodec, input),
    },
    {
      name: 'RecordedExecutionCodec',
      required: 'reply',
      version: 1,
      decode: executionCodecs.decodeRecordedExecution,
    },
    {
      name: 'CompletionRecordCodec',
      required: 'reply',
      version: 1,
      decode: (input) => parseOrThrow(executionCodecs.CompletionRecordCodec, input),
    },
    {
      name: 'ScopedAttemptGuardCodec',
      required: 'expectedScopeRevision',
      decode: executionCodecs.decodeScopedAttemptGuard,
    },
  ];
  function reference(name: string): Record<string, unknown> {
    if (references === undefined || !Object.hasOwn(references, name))
      throw new Error('codec reference absent ' + name);
    return structuredClone(references[name]) as Record<string, unknown>;
  }

  test('ProgressIntentCodec accepts its actual retained value', () => {
    const value = reference('ProgressIntentCodec');
    const decoded: unknown = decodeProgressIntent(value);
    expect(decoded).toEqual(value);
  });
  for (const fault of ['unknown key', 'missing claim', 'version1', 'version3'] as const)
    test('ProgressIntentCodec rejects coherent ' + fault, () => {
      const value = reference('ProgressIntentCodec');
      if (fault === 'unknown key') value['unexpected'] = true;
      else if (fault === 'missing claim') delete value['claim'];
      else value['version'] = fault === 'version1' ? 1 : 3;
      value['commandDigest'] = digestWithout(value, 'commandDigest');
      verifyDigest(value, 'commandDigest');
      expect(() => decodeProgressIntent(value)).toThrow();
    });
  for (const boundary of boundaries) {
    test(boundary.name + ' accepts its actual retained value', () => {
      const value = reference(boundary.name);
      expect(boundary.decode(value)).toEqual(value);
    });
    test(boundary.name + ' rejects its own unknown key', () => {
      expect(() => boundary.decode({ ...reference(boundary.name), unexpected: true })).toThrow();
    });
    test(boundary.name + ' rejects its own missing ' + boundary.required, () => {
      const value = reference(boundary.name);
      Reflect.deleteProperty(value, boundary.required);
      expect(() => boundary.decode(value)).toThrow();
    });
    if (boundary.version !== undefined)
      for (const version of boundary.version === 2 ? [1, 3] : [2])
        test(boundary.name + ' rejects owned version ' + String(version), () => {
          expect(() => boundary.decode({ ...reference(boundary.name), version })).toThrow();
        });
  }
  for (const codecName of ['ExecutionRecordCodec', 'RecordedExecutionCodec'] as const) {
    const decode = (value: unknown) =>
      codecName === 'ExecutionRecordCodec'
        ? parseOrThrow(executionCodecs.ExecutionRecordCodec, value)
        : executionCodecs.decodeRecordedExecution(value);
    test(codecName + ' rejects plain family with scoped context', () => {
      const value = reference(
        codecName === 'ExecutionRecordCodec' ? 'plainRecord' : 'plainRecorded',
      );
      expect(() => decode({ ...value, context: reference('ScopeContextCodec') })).toThrow();
    });
    test(codecName + ' rejects coupled family with null context', () => {
      expect(() => decode({ ...reference(codecName), context: null })).toThrow();
    });
  }
  for (const family of ['plainRecorded', 'stageRecorded', 'acceptRecorded'] as const)
    test('RecordedExecutionCodec rejects turn command with ' + family + ' reply', () => {
      const record = reference('RecordedExecutionCodec'),
        foreign = reference(family);
      expect(() =>
        executionCodecs.decodeRecordedExecution({ ...record, reply: foreign['reply'] }),
      ).toThrow();
    });
  for (const revision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
    test('ScopeContextCodec rejects owned revision ' + String(revision), () => {
      expect(() =>
        parseOrThrow(executionCodecs.ScopeContextCodec, {
          ...reference('ScopeContextCodec'),
          scopeRevision: revision,
        }),
      ).toThrow();
    });
  test('AttemptStateCodec rejects settled prepared checkpoint', () => {
    const state = reference('AttemptStateCodec');
    expect(() =>
      parseOrThrow(executionCodecs.AttemptStateCodec, {
        ...state,
        checkpoint: { kind: 'prepared', session: reference('LocatedCodec') },
      }),
    ).toThrow();
  });
  test('ClaimProjectionCodec rejects owned malformed basis', () => {
    expect(() =>
      parseOrThrow(executionCodecs.ClaimProjectionCodec, {
        ...reference('ClaimProjectionCodec'),
        basisAfter: 'invalid',
      }),
    ).toThrow();
  });
});
