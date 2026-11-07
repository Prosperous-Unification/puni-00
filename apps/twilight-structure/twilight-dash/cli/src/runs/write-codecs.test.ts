import { expect, test } from 'bun:test';

import { decodeAttempt, decodeCompletion, decodeCurrentAttempt } from './record-codecs';
import { digestRuntimeRequest } from './runtime-codecs';
import { createCompletion } from './testing/fixtures';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { createWriteFixture } from './testing/write-fixture';
import { organizationId } from './value-codecs';
import {
  decodeRecordedWrite,
  decodeWriteAcceptAck,
  decodeWriteAcceptCommand,
  decodeWriteAttempt,
  decodeWriteCompletion,
  decodeWriteObligation,
  decodeWriteProjection,
  decodeWriteReceipt,
  decodeWriteStageAck,
  decodeWriteStageCommand,
  projectWriteReceipt,
} from './write-codecs';

async function writeSamples() {
  const clock = new FixtureClock();
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 10000,
    clock,
  });
  try {
    const fixture = await createWriteFixture({ ...stores, clock });
    const intent = {
      version: 1,
      commandId: 'wire-write',
      canonicalRequest: fixture.canonicalRequest,
      requestDigest: digestRuntimeRequest(fixture.canonicalRequest),
      localOwner: fixture.owner,
      stagedRevision: fixture.facts.scope.revision + 1,
    };
    const obligation = {
      version: 1,
      stageCommandId: fixture.command.commandId,
      intent,
      completion: fixture.completion,
      disposition: { kind: 'pending' },
    };
    const attempt = {
      ...fixture.facts.attempt,
      version: 4,
      revision: fixture.facts.attempt.revision + 1,
      holdsCapacity: false,
      state: {
        kind: 'write_pending',
        checkpoint: fixture.checkpoint,
        outcome: fixture.completion.outcome,
        quiescence: fixture.completion.quiescence,
        stageCommandId: fixture.command.commandId,
        intent,
      },
    };
    const projection = {
      version: 1,
      actorId: 'account',
      basisAfter: 'rb1:' + 'c'.repeat(64),
      applied: [
        { index: 0, kind: 'setProgress' },
        { index: 1, kind: 'releaseWorkItem' },
      ],
    };
    const acceptance = {
      version: 1,
      commandId: intent.commandId,
      requestDigest: intent.requestDigest,
      evidence: fixture.stateEvidence,
      acceptedRevision: intent.stagedRevision + 1,
    };
    const receipt = {
      version: 1,
      stageCommandId: fixture.command.commandId,
      acceptance,
      projection,
    };
    const stageAck = { version: 1, kind: 'write_staged', intent, obligation, attempt };
    const acceptCommand = {
      version: 1,
      kind: 'accept_write',
      commandId: 'accept-write',
      stageCommandId: fixture.command.commandId,
      intent,
      evidence: fixture.stateEvidence,
      projection,
    };
    const terminal = {
      ...attempt,
      revision: attempt.revision + 1,
      state: {
        kind: 'write_terminal',
        checkpoint: fixture.checkpoint,
        outcome: fixture.completion.outcome,
        quiescence: fixture.completion.quiescence,
        stageCommandId: fixture.command.commandId,
        receipt,
      },
    };
    const acceptAck = { version: 1, kind: 'write_accepted', receipt, attempt: terminal };
    const stage = {
      version: 1,
      kind: 'stage_write',
      runId: fixture.guard.runId,
      attemptId: fixture.guard.attemptId,
      context: { version: 1, scopeRevision: fixture.facts.scope.revision },
      command: fixture.command,
      reply: stageAck,
    };
    const accepted = {
      ...stage,
      kind: 'accept_write',
      context: { version: 1, scopeRevision: intent.stagedRevision },
      command: acceptCommand,
      reply: acceptAck,
    };
    return {
      fixture,
      intent,
      obligation,
      attempt,
      projection,
      receipt,
      stageAck,
      acceptCommand,
      terminal,
      acceptAck,
      stage,
      accepted,
    };
  } finally {
    await stores.close();
  }
}

test('write boundaries reject owned unknown missing and version fields and detach every nested value', async () => {
  const samples = await writeSamples();
  const boundaries = [
    [decodeWriteCompletion, samples.fixture.completion],
    [decodeWriteStageCommand, samples.fixture.command],
    [decodeWriteProjection, samples.projection],
    [decodeWriteAcceptCommand, samples.acceptCommand],
    [decodeWriteObligation, samples.obligation],
    [decodeWriteAttempt, samples.attempt],
    [decodeWriteReceipt, samples.receipt],
    [decodeWriteStageAck, samples.stageAck],
    [decodeWriteAcceptAck, samples.acceptAck],
    [decodeRecordedWrite, samples.stage],
    [decodeRecordedWrite, samples.accepted],
  ] as const;
  for (const [decode, source] of boundaries) {
    const input = structuredClone(source);
    const decoded: unknown = decode(input);
    expect(decoded).toEqual(input);
    expect(decoded).not.toBe(input);
    expect(() => decode({ ...input, unexpected: true })).toThrow();
    expect(() => decode({ ...input, version: 99 })).toThrow();
    const missing: Record<string, unknown> = { ...input };
    delete missing['version'];
    expect(() => decode(missing)).toThrow();
    const before = structuredClone(decoded);
    function mutate(value: unknown): void {
      if (typeof value !== 'object' || value === null) return;
      for (const key of Object.keys(value)) {
        const record = value as Record<string, unknown>;
        if (typeof record[key] === 'object') mutate(record[key]);
        else record[key] = 'caller changed';
      }
    }
    mutate(input);
    expect(decoded).toEqual(before);
    expect(input).not.toEqual(before);
  }
});

test('write completion rejects indeterminate effect and success without successful effect', async () => {
  const { fixture } = await writeSamples();
  for (const effect of ['unknown', 'absent', 'failed']) {
    expect(() =>
      decodeWriteCompletion({
        ...fixture.completion,
        quiescence: { ...fixture.completion.quiescence, effect },
      }),
    ).toThrow();
  }
  for (const kind of ['failed', 'cancelled'])
    expect(() =>
      decodeWriteCompletion({
        ...fixture.completion,
        outcome: { ...fixture.completion.outcome, kind },
        quiescence: { ...fixture.completion.quiescence, effect: 'failed' },
      }),
    ).not.toThrow();
});

test('write attempts preserve precise pending nonaccepted terminal variants and operation binding', async () => {
  const { attempt, terminal } = await writeSamples();
  expect(() => decodeWriteAttempt(terminal)).not.toThrow();
  const nonaccepted = {
    ...attempt,
    state: { ...attempt.state, kind: 'write_nonaccepted', recoveryId: 'recovery' },
  };
  expect(() => decodeWriteAttempt(nonaccepted)).not.toThrow();
  for (const invalid of [
    { ...attempt, holdsCapacity: true },
    { ...attempt, state: { ...attempt.state, recoveryId: 'extra' } },
    { ...nonaccepted, state: { ...nonaccepted.state, recoveryId: '' } },
    { ...terminal, state: { ...terminal.state, intent: attempt.state.intent } },
    {
      ...attempt,
      state: {
        ...attempt.state,
        quiescence: { ...attempt.state.quiescence, operationKey: 'other' },
      },
    },
    { ...terminal, state: { ...terminal.state, stageCommandId: 'other' } },
  ])
    expect(() => decodeWriteAttempt(invalid)).toThrow();
});

test('write command canonical bytes operation and bounded local versus unbounded wire identities', async () => {
  const { fixture, acceptCommand, intent, obligation } = await writeSamples();
  const emptyCommand = fixture.canonicalRequest.replace('"wire-write"', '""');
  expect(emptyCommand).not.toBe(fixture.canonicalRequest);
  for (const canonicalRequest of [
    ' ' + fixture.canonicalRequest,
    fixture.canonicalRequest + '\n',
    emptyCommand,
  ])
    expect(() => decodeWriteStageCommand({ ...fixture.command, canonicalRequest })).toThrow();
  expect(() =>
    decodeWriteStageCommand({
      ...fixture.command,
      canonicalRequest: fixture.execution.binding.intent.canonicalRequest,
    }),
  ).toThrow();
  expect(() =>
    decodeWriteStageCommand({ ...fixture.command, commandId: 'x'.repeat(257) }),
  ).toThrow();
  const longRequest = fixture.canonicalRequest.replace('wire-write', 'x'.repeat(300));
  expect(() =>
    decodeWriteStageCommand({ ...fixture.command, canonicalRequest: longRequest }),
  ).not.toThrow();
  expect(() =>
    decodeWriteAcceptCommand({ ...acceptCommand, stageCommandId: acceptCommand.commandId }),
  ).toThrow();
  expect(() =>
    decodeWriteObligation({ ...obligation, intent: { ...intent, requestDigest: 'a'.repeat(64) } }),
  ).toThrow();
  expect(() =>
    decodeWriteProjection({
      ...acceptCommand.projection,
      applied: [{ index: 1, kind: 'setProgress' }],
    }),
  ).toThrow();
});

test('write acknowledgements and journal independently bind target scope cut and original consequences', async () => {
  const { stageAck, acceptAck, stage, accepted, obligation, receipt } = await writeSamples();
  for (const invalid of [
    { ...stageAck, intent: { ...stageAck.intent, commandId: 'other' } },
    {
      ...stageAck,
      obligation: {
        ...obligation,
        disposition: { kind: 'fenced_nonaccepted', recoveryId: 'recovery' },
      },
    },
  ])
    expect(() => decodeWriteStageAck(invalid)).toThrow();
  expect(() =>
    decodeWriteAcceptAck({
      ...acceptAck,
      receipt: { ...receipt, projection: { ...receipt.projection, actorId: 'other' } },
    }),
  ).toThrow();
  for (const invalid of [
    { ...stage, runId: 'other' },
    { ...stage, attemptId: 'other' },
    { ...stage, context: { ...stage.context, scopeRevision: 0 } },
    {
      ...stage,
      command: {
        ...stage.command,
        completion: {
          ...stage.command.completion,
          outcome: { ...stage.command.completion.outcome, summary: 'other' },
        },
      },
    },
    {
      ...accepted,
      command: {
        ...accepted.command,
        projection: { ...accepted.command.projection, actorId: 'other' },
      },
    },
    { ...accepted, context: { ...accepted.context, scopeRevision: 0 } },
  ])
    expect(() => decodeRecordedWrite(invalid)).toThrow();
});

test('historical current attempt and generic completion codecs keep their exact identities', async () => {
  const { fixture, attempt } = await writeSamples();
  const predecessor: unknown = decodeAttempt(fixture.facts.attempt);
  expect(predecessor).toEqual(fixture.facts.attempt);
  expect(() => decodeAttempt(attempt)).toThrow();
  const currentAttempt: unknown = decodeCurrentAttempt(attempt);
  expect(currentAttempt).toEqual(attempt);
  expect(currentAttempt).not.toBe(attempt);
  const generic = createCompletion(fixture.claim, fixture.quiescence);
  const completion: unknown = decodeCompletion(generic);
  expect(completion).toEqual(generic);
  expect(() => decodeCompletion(fixture.completion)).toThrow();
  expect(() => decodeWriteCompletion(generic)).toThrow();
});

test('standalone write attempt rejects independently rekeyed run attempt and session targets', async () => {
  const { attempt } = await writeSamples();
  for (const [key, identity] of [
    ['runId', 'run'],
    ['attemptId', 'attempt'],
    ['sessionId', 'session'],
  ]) {
    const canonicalRequest = attempt.state.intent.canonicalRequest.replace(
      JSON.stringify(key) + ':' + JSON.stringify(identity),
      JSON.stringify(key) + ':"other"',
    );
    expect(canonicalRequest).not.toBe(attempt.state.intent.canonicalRequest);
    const intent = {
      ...attempt.state.intent,
      canonicalRequest,
      requestDigest: digestRuntimeRequest(canonicalRequest),
    };
    expect(() => decodeWriteAttempt({ ...attempt, state: { ...attempt.state, intent } })).toThrow(
      'write attempt target differs',
    );
  }
});

test('write nested shapes reject unknown keys at every retained object boundary', async () => {
  const samples = await writeSamples();
  const nonaccepted = {
    ...samples.attempt,
    state: { ...samples.attempt.state, kind: 'write_nonaccepted', recoveryId: 'recovery' },
  };
  const fenced = {
    ...samples.obligation,
    disposition: { kind: 'fenced_nonaccepted', recoveryId: 'recovery' },
  };
  const boundaries: readonly (readonly [(input: unknown) => unknown, unknown])[] = [
    [decodeWriteCompletion, samples.fixture.completion],
    [decodeWriteStageCommand, samples.fixture.command],
    [decodeWriteProjection, samples.projection],
    [decodeWriteAcceptCommand, samples.acceptCommand],
    [decodeWriteObligation, samples.obligation],
    [decodeWriteObligation, fenced],
    [decodeWriteAttempt, samples.attempt],
    [decodeWriteAttempt, samples.terminal],
    [decodeWriteAttempt, nonaccepted],
    [decodeWriteReceipt, samples.receipt],
    [decodeWriteStageAck, samples.stageAck],
    [decodeWriteAcceptAck, samples.acceptAck],
    [decodeRecordedWrite, samples.stage],
    [decodeRecordedWrite, samples.accepted],
  ];
  function collectPaths(
    value: unknown,
    prefix: readonly string[] = [],
  ): readonly (readonly string[])[] {
    if (typeof value !== 'object' || value === null) return [];
    const record = value as Record<string, unknown>;
    const nested = Object.keys(record).flatMap((key) =>
      collectPaths(record[key], [...prefix, key]),
    );
    return Array.isArray(value) ? nested : [prefix, ...nested];
  }
  function selectObject(value: unknown, path: readonly string[]): Record<string, unknown> {
    let selected = value;
    for (const key of path) {
      if (typeof selected !== 'object' || selected === null)
        throw new Error('missing nested fixture object');
      selected = (selected as Record<string, unknown>)[key];
    }
    if (typeof selected !== 'object' || selected === null)
      throw new Error('invalid nested fixture object');
    return selected as Record<string, unknown>;
  }
  for (const [decode, source] of boundaries) {
    expect(() => decode(source)).not.toThrow();
    for (const path of collectPaths(source)) {
      const corrupted = structuredClone(source);
      selectObject(corrupted, path)['unexpected'] = true;
      expect(() => decode(corrupted)).toThrow();
    }
  }
});

test('verified write receipt selection retains strict known fields and detaches applied entries', () => {
  const projection = decodeWriteProjection({
    version: 1,
    actorId: 'actor',
    basisAfter: 'rb1:' + 'b'.repeat(64),
    applied: [{ index: 0, kind: 'setProgress' }],
  });
  const receipt = { actorId: projection.actorId, acceptance: projection };
  Object.assign(receipt.acceptance.applied[0], { publicExtension: true });
  const selected = projectWriteReceipt(receipt);
  expect(selected).toEqual({
    version: 1,
    actorId: 'actor',
    basisAfter: 'rb1:' + 'b'.repeat(64),
    applied: [{ index: 0, kind: 'setProgress' }],
  });
  Object.assign(receipt.acceptance.applied[0], { index: 2 });
  expect(selected.applied[0].index).toBe(0);
  for (const malformed of [{ index: -1 }, { kind: 'unknown' }]) {
    Object.assign(receipt.acceptance.applied[0], { index: 0, kind: 'setProgress' }, malformed);
    expect(() => projectWriteReceipt(receipt)).toThrow();
  }
  expect(() =>
    decodeWriteProjection({
      ...selected,
      applied: [{ index: 0, kind: 'setProgress', localUnknown: true }],
    }),
  ).toThrow();
});
