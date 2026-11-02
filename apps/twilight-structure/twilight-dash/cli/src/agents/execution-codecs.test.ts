import { parseOrThrow } from '@shared/validation';
import { expect, test } from 'bun:test';

import {
  AgentRunIdCodec,
  attemptId,
  occurrenceId,
  operationKey,
  ownerId,
  runId,
} from '../runs/record-codecs';
import {
  ExecutorLocatorCodec,
  PreparationCodec,
  snapshotTurnReply,
  TurnIdentityCodec,
  TurnReplyCodec,
  TurnRequestCodec,
  UsageCodec,
} from './execution-codecs';

function locator() {
  return {
    version: 1 as const,
    executor: 'api-model' as const,
    executorVersion: '1',
    preparation: {
      version: 1 as const,
      identity: {
        version: 1 as const,
        runId: runId('run'),
        occurrenceId: occurrenceId('occurrence'),
        operationKey: operationKey('operation'),
      },
      attemptId: attemptId('attempt'),
      creationKey: 'creation',
    },
    // The accepted tool/build selection also used by activity-executor.test.ts.
    selection: {
      bindingDigest: 'b85cb74913d5b4b90df0fa3b879a9a86f567a56f8d9a5f75b75ec5f52840f754',
      requestedType: 'change',
      matchedType: 'default',
      stepCode: 'build',
      className: 'tool',
    },
    session: {
      version: 1 as const,
      workerId: 'worker',
      sessionId: parseOrThrow(AgentRunIdCodec, 'session'),
      operationKey: operationKey('operation'),
    },
  };
}

function identity() {
  return { locator: locator(), turnKey: 'turn', owner: { ownerId: ownerId('owner'), epoch: 1 } };
}

function completed() {
  return {
    kind: 'completed' as const,
    identity: identity(),
    outcome: {
      text: '',
      usage: { kind: 'measured' as const, inputTokens: 0, outputTokens: 0 },
      finish: 'end_turn' as const,
    },
  };
}

function unresolved() {
  return {
    kind: 'unresolved' as const,
    identity: identity(),
    reason: 'transport_lost' as const,
    text: 'partial',
    usage: { kind: 'unknown' as const, reason: 'interrupted-before-usage' as const },
  };
}

function notStarted() {
  return { kind: 'not_started' as const, identity: identity(), reason: 'session_busy' as const };
}

for (const reply of [completed(), notStarted(), unresolved()])
  test(
    'complete reply snapshots retain all three variants and survive JSON round trips: ' +
      reply.kind,
    () => {
      const snapshot = snapshotTurnReply(reply);
      expect(snapshot).toEqual(reply);
      expect(snapshotTurnReply(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
      expect(parseOrThrow(TurnReplyCodec, reply)).toEqual(reply);
    },
  );

test('complete reply snapshots preserve every finish uncertainty unknown usage reason and numeric bound', () => {
  for (const finish of [
    'end_turn',
    'max_steps',
    'output_truncated',
    'refused',
    'cancelled',
  ] as const)
    expect(
      snapshotTurnReply({ ...completed(), outcome: { ...completed().outcome, finish } }),
    ).toEqual({
      ...completed(),
      outcome: { ...completed().outcome, finish },
    });
  for (const reason of [
    'unsupported',
    'transport_lost',
    'interrupted',
    'observer_failed',
    'approval_required',
    'tool_input_required',
    'provider_incomplete',
    'turn_in_flight',
    'recovery_required',
  ] as const)
    expect(snapshotTurnReply({ ...unresolved(), reason })).toEqual({ ...unresolved(), reason });
  for (const reason of [
    'provider-usage-unavailable',
    'interrupted-before-usage',
    'acp-v1-no-usage',
    'harness-usage-unavailable',
    'tool',
    'human',
  ] as const) {
    const usage = { kind: 'unknown' as const, reason };
    expect(
      snapshotTurnReply({ ...completed(), outcome: { text: '', finish: 'end_turn', usage } }),
    ).toEqual({ ...completed(), outcome: { text: '', finish: 'end_turn', usage } });
    expect(snapshotTurnReply({ ...unresolved(), text: '', usage })).toEqual({
      ...unresolved(),
      text: '',
      usage,
    });
    expect(parseOrThrow(UsageCodec, usage)).toEqual(usage);
  }
  for (const reason of ['cancelled_before_dispatch', 'session_busy'] as const)
    expect(snapshotTurnReply({ ...notStarted(), reason })).toEqual({ ...notStarted(), reason });
  for (const count of [0, Number.MAX_SAFE_INTEGER]) {
    const usage = { kind: 'measured' as const, inputTokens: count, outputTokens: count };
    expect(snapshotTurnReply({ ...unresolved(), usage })).toEqual({ ...unresolved(), usage });
    expect(
      snapshotTurnReply({ ...completed(), outcome: { ...completed().outcome, usage } }),
    ).toEqual({ ...completed(), outcome: { ...completed().outcome, usage } });
  }
});

test('complete reply snapshots freeze and detach every branch while callers remain editable', () => {
  for (const reply of [
    completed(),
    notStarted(),
    unresolved(),
    { ...completed(), outcome: { ...completed().outcome, usage: unresolved().usage } },
    { ...unresolved(), usage: completed().outcome.usage },
  ]) {
    const snapshot = snapshotTurnReply(reply);
    const pairs: [object, object][] = [
      [snapshot, reply],
      [snapshot.identity, reply.identity],
      [snapshot.identity.owner, reply.identity.owner],
      [snapshot.identity.locator, reply.identity.locator],
      [snapshot.identity.locator.preparation, reply.identity.locator.preparation],
      [snapshot.identity.locator.preparation.identity, reply.identity.locator.preparation.identity],
      [snapshot.identity.locator.selection, reply.identity.locator.selection],
      [snapshot.identity.locator.session, reply.identity.locator.session],
    ];
    if (snapshot.kind === 'completed' && reply.kind === 'completed')
      pairs.push([snapshot.outcome, reply.outcome], [snapshot.outcome.usage, reply.outcome.usage]);
    if (snapshot.kind === 'unresolved' && reply.kind === 'unresolved')
      pairs.push([snapshot.usage, reply.usage]);
    for (const [retained, original] of pairs) {
      expect(retained).not.toBe(original);
      expect(Object.isFrozen(retained)).toBe(true);
      expect(Object.isFrozen(original)).toBe(false);
    }
    reply.identity.owner.epoch = 2;
    reply.identity.locator.preparation.identity.runId = runId('changed');
    reply.identity.locator.preparation.creationKey = 'changed';
    reply.identity.locator.selection.className = 'changed';
    reply.identity.locator.session.workerId = 'changed';
    reply.identity.turnKey = 'changed';
    if (reply.kind === 'completed') {
      reply.outcome.text = 'caller remains mutable';
      if (reply.outcome.usage.kind === 'measured') reply.outcome.usage.inputTokens = 10;
    }
    if (reply.kind === 'unresolved') reply.text = 'caller remains mutable';
    expect(snapshot).not.toEqual(reply);
  }
});

test('complete reply codecs reject unknown keys in each portable branch', () => {
  const reply = completed();
  const turn = reply.identity;
  const location = turn.locator;
  const preparation = location.preparation;
  const corruptions = [
    { ...reply, extra: true },
    { ...notStarted(), extra: true },
    { ...unresolved(), extra: true },
    { ...reply, identity: { ...turn, extra: true } },
    { ...reply, identity: { ...turn, owner: { ...turn.owner, extra: true } } },
    { ...reply, identity: { ...turn, locator: { ...location, extra: true } } },
    {
      ...reply,
      identity: { ...turn, locator: { ...location, preparation: { ...preparation, extra: true } } },
    },
    {
      ...reply,
      identity: {
        ...turn,
        locator: {
          ...location,
          preparation: { ...preparation, identity: { ...preparation.identity, extra: true } },
        },
      },
    },
    {
      ...reply,
      identity: {
        ...turn,
        locator: { ...location, selection: { ...location.selection, extra: true } },
      },
    },
    {
      ...reply,
      identity: {
        ...turn,
        locator: { ...location, session: { ...location.session, extra: true } },
      },
    },
    { ...reply, outcome: { ...reply.outcome, extra: true } },
    { ...reply, outcome: { ...reply.outcome, usage: { ...reply.outcome.usage, extra: true } } },
    { ...unresolved(), usage: { ...unresolved().usage, extra: true } },
  ];
  for (const corrupt of corruptions) {
    expect(() => snapshotTurnReply(corrupt)).toThrow();
    expect(() => parseOrThrow(TurnReplyCodec, corrupt)).toThrow();
  }
});

test('complete reply codecs reject invalid discriminants finishes reasons and omitted variant fields', () => {
  for (const corrupt of [
    null,
    new Error('private'),
    {},
    { ...completed(), kind: 'other' },
    { ...notStarted(), kind: 'other' },
    { ...unresolved(), kind: 'other' },
    { kind: 'completed', identity: identity() },
    { ...completed(), outcome: { ...completed().outcome, finish: 'stop' } },
    { ...completed(), outcome: { ...completed().outcome, text: null } },
    { ...notStarted(), reason: 'transport_lost' },
    { ...notStarted(), text: '' },
    { ...unresolved(), reason: 'session_busy' },
    { ...unresolved(), text: undefined },
    { ...unresolved(), usage: { kind: 'unknown', reason: 'other' } },
    { ...unresolved(), usage: { kind: 'unknown', inputTokens: 0, outputTokens: 0 } },
    { ...unresolved(), usage: { kind: 'measured', inputTokens: 0 } },
    { ...unresolved(), usage: { kind: 'other', inputTokens: 0, outputTokens: 0 } },
    { ...unresolved(), usage: { kind: 'other', reason: 'interrupted-before-usage' } },
  ])
    expect(() => snapshotTurnReply(corrupt)).toThrow();
});

test('complete reply codecs reject negative fractional nonfinite and unsafe measured counts on either variant', () => {
  for (const count of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    for (const field of ['inputTokens', 'outputTokens']) {
      const usage = { kind: 'measured' as const, inputTokens: 0, outputTokens: 0, [field]: count };
      expect(() =>
        snapshotTurnReply({ ...completed(), outcome: { ...completed().outcome, usage } }),
      ).toThrow();
      expect(() => snapshotTurnReply({ ...unresolved(), usage })).toThrow();
      expect(() => parseOrThrow(UsageCodec, usage)).toThrow();
    }
  }
});

test('complete reply codecs reject malformed identity key owner versions and locator operation mismatch', () => {
  const turn = identity();
  const location = turn.locator;
  for (const corrupt of [
    { ...turn, turnKey: '' },
    { ...turn, turnKey: 'x'.repeat(257) },
    { ...turn, owner: { ...turn.owner, ownerId: '' } },
    ...[0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map((epoch) => ({
      ...turn,
      owner: { ...turn.owner, epoch },
    })),
    { ...turn, locator: { ...location, version: 2 } },
    { ...turn, locator: { ...location, executor: 'other' } },
    { ...turn, locator: { ...location, preparation: { ...location.preparation, version: 2 } } },
    { ...turn, locator: { ...location, preparation: { ...location.preparation, attemptId: '' } } },
    {
      ...turn,
      locator: {
        ...location,
        preparation: {
          ...location.preparation,
          identity: { ...location.preparation.identity, version: 2 },
        },
      },
    },
    {
      ...turn,
      locator: {
        ...location,
        preparation: {
          ...location.preparation,
          identity: { ...location.preparation.identity, runId: '' },
        },
      },
    },
    { ...turn, locator: { ...location, session: { ...location.session, version: 2 } } },
    {
      ...turn,
      locator: { ...location, session: { ...location.session, operationKey: 'different' } },
    },
    { ...turn, locator: { ...location, session: { ...location.session, sessionId: '' } } },
    {
      ...turn,
      locator: { ...location, selection: { ...location.selection, bindingDigest: 'bad' } },
    },
  ]) {
    for (const reply of [completed(), unresolved(), notStarted()])
      expect(() => snapshotTurnReply({ ...reply, identity: corrupt })).toThrow();
    expect(() => parseOrThrow(TurnIdentityCodec, corrupt)).toThrow();
  }
  const maximum = {
    ...turn,
    turnKey: 'x'.repeat(256),
    owner: { ...turn.owner, epoch: Number.MAX_SAFE_INTEGER },
  };
  expect(snapshotTurnReply({ ...completed(), identity: maximum }).identity).toEqual(maximum);
});

test('portable codec owners accept preparation locator and turn request without a live port', () => {
  const location = locator();
  expect(parseOrThrow(PreparationCodec, location.preparation)).toEqual(location.preparation);
  expect(parseOrThrow(ExecutorLocatorCodec, location)).toEqual(location);
  const request = {
    version: 1 as const,
    turnKey: 'turn',
    owner: identity().owner,
    cause: { kind: 'initial' as const },
    input: '',
  };
  expect(parseOrThrow(TurnRequestCodec, request)).toEqual(request);
  expect(() =>
    parseOrThrow(ExecutorLocatorCodec, {
      ...location,
      session: { ...location.session, operationKey: 'different' },
    }),
  ).toThrow();
});
