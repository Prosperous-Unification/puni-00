import {
  acceptWorkflowBinding,
  checkWorkflowBinding,
  decodeWorkflowBinding,
  selectWorkflowActivity,
} from '@twilight-burokrat/contracts';
import {
  createProviderRegistry,
  jsonSchema,
  simulateReadableStream,
  tool,
  type ToolSet,
  type UIMessageChunk,
} from 'ai';
import { MockLanguageModelV4, MockProviderV4 } from 'ai/test';
import { expect, test } from 'bun:test';

import {
  AgentRunIdCodec,
  attemptId,
  decisionId,
  occurrenceId,
  operationKey,
  ownerId,
  runId,
} from '../runs/record-codecs';
import { ActivityDispatchError, type Preparation, type TurnRequest } from './activity-executor';
import { createApiModelExecutor } from './api-model-adapter';
import type { ApiModelRegistry } from './api-model-settings';
import { executorContract, type ExecutorFixture } from './testing/executor-contract';

type ModelResponse = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
type ModelPart = ModelResponse['stream'] extends ReadableStream<infer Part> ? Part : never;

function response(inputTokens = 120): ModelResponse {
  return {
    stream: simulateReadableStream({
      initialDelayInMs: null,
      chunkDelayInMs: null,
      chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text' },
        { type: 'text-delta', id: 'text', delta: 'Hi' },
        { type: 'text-end', id: 'text' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 30, text: 30, reasoning: 0 },
          },
        },
      ] satisfies ModelPart[],
    }),
  };
}

function fixture(
  model = new MockLanguageModelV4({ doStream: () => Promise.resolve(response()) }),
  tools: ToolSet = {},
) {
  const selection = selectWorkflowActivity(
    acceptWorkflowBinding(
      checkWorkflowBinding(
        decodeWorkflowBinding({
          version: 1,
          types: { default: { build: { class: 'api' } } },
          classes: {
            api: {
              executor: 'api-model',
              model: 'openai:fixture',
              prompt: '.twilight/api.md',
              tools: Object.keys(tools),
              limits: { maxSteps: 2, maxOutputTokens: 80 },
            },
          },
        }),
        ['build'],
      ),
      [{ path: '.twilight/api.md', bytes: new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x69]) }],
    ),
    'change',
    'build',
  );
  const providers = createProviderRegistry<Record<string, MockProviderV4>, string>({
    openai: new MockProviderV4({ languageModels: { fixture: model } }),
  });
  const models: ApiModelRegistry = {
    languageModel: (id: string) => providers.languageModel<string>(id),
  };
  let allocations = 0;
  const options = {
    selection,
    models,
    tools,
    instanceId: 'instance',
    newSessionId: () => AgentRunIdCodec.assert(`session-${String(++allocations)}`),
  };
  const preparation: Preparation = {
    version: 1,
    identity: {
      version: 1,
      runId: runId('run'),
      occurrenceId: occurrenceId('occurrence'),
      operationKey: operationKey('operation'),
    },
    attemptId: attemptId('attempt'),
    creationKey: 'creation',
  };
  const initialRequest: TurnRequest = {
    version: 1,
    turnKey: 'turn-1',
    owner: { ownerId: ownerId('owner'), epoch: 1 },
    cause: { kind: 'initial' },
    input: 'Hello',
  };
  return {
    executor: createApiModelExecutor(options),
    model,
    options,
    preparation,
    initialRequest,
    allocations: () => allocations,
  };
}

const signal = () => new AbortController().signal;
const aborted = () => {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
};
const control = () => ({ signal: signal(), onPart: (_part: UIMessageChunk) => undefined });
const decision = (request: TurnRequest, turnKey = 'decision'): TurnRequest => ({
  ...request,
  turnKey,
  cause: { kind: 'decision', decisionId: decisionId('decision') },
});

async function open(executor: ReturnType<typeof createApiModelExecutor>, preparation: Preparation) {
  const opened = await executor.open(preparation, signal());
  if (opened.kind !== 'opened') throw new Error('expected local session');
  return opened.session;
}

/** A real doStream barrier keeps the installed SDK pending until the test releases its dependency. */
function deferredModel() {
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const secondEntered = Promise.withResolvers<undefined>();
  let dispatches = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      entered.resolve(undefined);
      if (++dispatches === 2) secondEntered.resolve(undefined);
      await release.promise;
      return response();
    },
  });
  return {
    model,
    entered: entered.promise,
    secondEntered: secondEntered.promise,
    release: () => {
      release.resolve(undefined);
    },
  };
}

/** Keeps Burokrat acceptance, registry resolution and installed SDK dispatch behind the shared port fixture. */
function contractFixture(model?: MockLanguageModelV4): ExecutorFixture {
  const concrete = model === undefined ? fixture() : fixture(model);
  return {
    executor: concrete.executor,
    preparation: concrete.preparation,
    initialRequest: concrete.initialRequest,
    expectedSession: {
      version: 1,
      workerId: 'instance',
      sessionId: AgentRunIdCodec.assert('session-1'),
      operationKey: operationKey('operation'),
    },
    expectedOutcome: {
      text: 'Hi',
      finish: 'end_turn',
      usage: { kind: 'measured', inputTokens: 120, outputTokens: 30 },
    },
    expectedTextParts: [{ type: 'text-delta', id: 'text', delta: 'Hi' }],
    allocationCount: concrete.allocations,
    dispatchCount: () => concrete.model.doStreamCalls.length,
    createOtherExecutor: () => createApiModelExecutor({ ...concrete.options, instanceId: 'other' }),
  };
}

executorContract('api-model', {
  createFixture: () => contractFixture(),
  createHeldFixture: () => {
    const deferred = deferredModel();
    return { ...contractFixture(deferred.model), ...deferred };
  },
});

test('duplicate and malformed generated session IDs reject without binding creation keys', async () => {
  const { options, preparation, model } = fixture();
  let generated = AgentRunIdCodec.assert('same');
  const executor = createApiModelExecutor({ ...options, newSessionId: () => generated });
  await open(executor, preparation);
  const next = { ...preparation, creationKey: 'next' };
  expect(executor.open(next, signal())).rejects.toThrow();
  generated = '' as typeof generated;
  expect(executor.open(next, signal())).rejects.toThrow();
  generated = AgentRunIdCodec.assert('distinct');
  expect(
    (await open(executor, { ...next, attemptId: attemptId('changed') })).locator.session.sessionId,
  ).toBe('distinct');
  expect(model.doStreamCalls).toHaveLength(0);
});

test('different sessions progress independently and decisions keep identity and actual private SDK history', async () => {
  const deferred = deferredModel();
  const { executor, model, preparation, initialRequest } = fixture(deferred.model);
  const firstSession = await open(executor, preparation);
  const secondSession = await open(executor, { ...preparation, creationKey: 'second' });
  const first = executor.turn(firstSession, initialRequest, control());
  await deferred.entered;
  const second = executor.turn(secondSession, initialRequest, control());
  deferred.release();
  expect(await first).toMatchObject({ kind: 'completed' });
  expect(await second).toMatchObject({ kind: 'completed' });
  const continued = await executor.turn(
    firstSession,
    { ...decision(initialRequest), input: 'Continue' },
    control(),
  );
  expect(continued.identity.locator).toEqual(firstSession.locator);
  expect(continued.identity.locator.preparation.attemptId).toBe(attemptId('attempt'));
  expect(model.doStreamCalls[2].prompt).toEqual([
    { role: 'system', content: 'Hi' },
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
    { role: 'user', content: [{ type: 'text', text: 'Continue' }] },
  ]);
  expect(
    executor.turn(firstSession, { ...initialRequest, turnKey: 'initial-again' }, control()),
  ).rejects.toThrow();
  expect(model.doStreamCalls).toHaveLength(3);
});

test('malformed post-dispatch usage quarantines fresh keys and rethrows cached exception', async () => {
  const model = new MockLanguageModelV4({ doStream: [response(-1), response()] });
  const { executor, preparation, initialRequest } = fixture(model);
  const session = await open(executor, preparation);
  const failure = await executor
    .turn(session, initialRequest, control())
    .catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(ActivityDispatchError);
  const replay = await executor
    .turn(session, initialRequest, { ...control(), signal: aborted() })
    .catch((cause: unknown) => cause);
  expect(replay).toBe(failure);
  expect(await executor.turn(session, decision(initialRequest), control())).toMatchObject({
    kind: 'unresolved',
    reason: 'recovery_required',
  });
  expect(
    await executor.turn(
      session,
      { ...decision(initialRequest), input: 'changed unbound' },
      control(),
    ),
  ).toMatchObject({ kind: 'unresolved', reason: 'recovery_required' });
  expect(model.doStreamCalls).toHaveLength(1);
});

test('unresolved dispatch quarantines and exact replay does not dispatch or replay parts', async () => {
  const model = new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({ initialDelayInMs: null, chunkDelayInMs: null, chunks: [] }),
    },
  });
  const { executor, preparation, initialRequest } = fixture(model);
  const session = await open(executor, preparation);
  const first = await executor.turn(session, initialRequest, control());
  expect(first).toMatchObject({ kind: 'unresolved', reason: 'provider_incomplete' });
  const parts: UIMessageChunk[] = [];
  expect(
    await executor.turn(session, initialRequest, {
      signal: aborted(),
      onPart: (part) => parts.push(part),
    }),
  ).toEqual(first);
  expect(await executor.turn(session, decision(initialRequest), control())).toMatchObject({
    kind: 'unresolved',
    reason: 'recovery_required',
  });
  expect(parts).toEqual([]);
  expect(model.doStreamCalls).toHaveLength(1);
});

test('cancel acknowledges without clearing a dependency that ignores abort', async () => {
  const deferred = deferredModel();
  const { executor, model, preparation, initialRequest } = fixture(deferred.model);
  const session = await open(executor, preparation);
  const pending = executor.turn(session, initialRequest, control());
  await deferred.entered;
  try {
    expect(await executor.cancel(session)).toEqual({ kind: 'requested', locator: session.locator });
    expect(await executor.cancel(session)).toEqual({ kind: 'requested', locator: session.locator });
    const competing = executor.turn(session, decision(initialRequest), control());
    const admission = await Promise.race([
      competing,
      deferred.secondEntered.then(() => ({ kind: 'extra_dispatch' })),
    ]);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(admission).toMatchObject({ kind: 'not_started', reason: 'session_busy' });
    expect(await executor.observeQuiescence(session.locator, signal())).toMatchObject({
      kind: 'unresolved',
      reason: 'unsupported',
    });
    expect(model.doStreamCalls).toHaveLength(1);
  } finally {
    deferred.release();
  }
  expect(await pending).toMatchObject({ kind: 'unresolved', reason: 'interrupted' });
});

test('close during real stream detaches listener before later SDK abort or finish UI parts', async () => {
  const { executor, model, preparation, initialRequest } = fixture();
  const session = await open(executor, preparation);
  const parts: UIMessageChunk[] = [];
  let closed: Promise<void> | undefined;
  let atClose = 0;
  const pending = executor.turn(session, initialRequest, {
    signal: signal(),
    onPart: (part) => {
      parts.push(part);
      if (part.type === 'text-delta') {
        atClose = parts.length;
        closed = executor.close(session);
      }
    },
  });
  expect(await pending).toMatchObject({ kind: 'unresolved', reason: 'interrupted' });
  expect(closed).toBeDefined();
  await closed;
  expect(parts.slice(atClose)).toEqual([]);
  expect(model.doStreamCalls).toHaveLength(1);
});

test('turn captures originating callback and signal references before SDK awaits', async () => {
  const deferred = deferredModel();
  const { executor, preparation, initialRequest } = fixture(deferred.model);
  const session = await open(executor, preparation);
  const parts: UIMessageChunk[] = [];
  const replaced: UIMessageChunk[] = [];
  const original = new AbortController();
  const replacement = new AbortController();
  const controls = {
    signal: original.signal,
    onPart: (part: UIMessageChunk) => {
      parts.push(part);
    },
  };
  const originalRequest = structuredClone(initialRequest);
  const pending = executor.turn(session, initialRequest, controls);
  Object.assign(initialRequest, { input: 'Changed while pending' });
  Object.assign(initialRequest.owner, { epoch: 2 });
  expect(initialRequest.input).toBe('Changed while pending');
  expect(initialRequest.owner.epoch).toBe(2);
  await deferred.entered;
  controls.signal = replacement.signal;
  controls.onPart = (part) => {
    replaced.push(part);
  };
  replacement.abort();
  deferred.release();
  const completed = await pending;
  expect(completed).toMatchObject({
    kind: 'completed',
    identity: { owner: { ownerId: 'owner', epoch: 1 } },
  });
  expect(await executor.turn(session, originalRequest, control())).toEqual(completed);
  expect(parts.some((part) => part.type === 'text-delta')).toBe(true);
  expect(replaced).toEqual([]);
});

test('idle cancel preserves attachment and replacement instance recovery stays unsupported', async () => {
  const { executor, options, preparation, model, allocations } = fixture();
  const session = await open(executor, preparation);
  expect(await executor.cancel(session)).toEqual({ kind: 'requested', locator: session.locator });
  const replacement = createApiModelExecutor({ ...options, instanceId: 'replacement' });
  for (const adapter of [executor, replacement]) {
    expect(Object.values(adapter.capabilities)).toEqual(Array(7).fill('unsupported'));
    expect(await adapter.lookupSession(preparation, signal())).toEqual({
      kind: 'unresolved',
      preparation,
      reason: 'unsupported',
    });
    expect(await adapter.resumeSession(session.locator, signal())).toEqual({
      kind: 'unresolved',
      locator: session.locator,
      reason: 'unsupported',
    });
    const identity = {
      locator: session.locator,
      turnKey: 'turn-1',
      owner: { ownerId: ownerId('owner'), epoch: 1 },
    };
    expect(await adapter.inspectEffect(identity, signal())).toEqual({
      kind: 'unresolved',
      identity,
      reason: 'unsupported',
    });
    expect(await adapter.observeQuiescence(session.locator, signal())).toEqual({
      kind: 'unresolved',
      locator: session.locator,
      reason: 'unsupported',
    });
  }
  expect(allocations()).toBe(1);
  expect(model.doStreamCalls).toHaveLength(0);
});

test('originating signal cancels after dispatch while an ignoring dependency keeps its slot', async () => {
  const deferred = deferredModel();
  const { executor, model, preparation, initialRequest } = fixture(deferred.model);
  const session = await open(executor, preparation);
  const originating = new AbortController();
  const pending = executor.turn(session, initialRequest, {
    ...control(),
    signal: originating.signal,
  });
  await deferred.entered;
  originating.abort();
  try {
    expect(await executor.turn(session, decision(initialRequest), control())).toMatchObject({
      kind: 'not_started',
      reason: 'session_busy',
    });
    expect(model.doStreamCalls).toHaveLength(1);
  } finally {
    deferred.release();
  }
  expect(await pending).toMatchObject({ kind: 'unresolved', reason: 'interrupted' });
});

test('completed SDK tool messages survive privately into a decision conversation', async () => {
  const model = new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          initialDelayInMs: null,
          chunkDelayInMs: null,
          chunks: [
            { type: 'stream-start', warnings: [] },
            { type: 'tool-call', toolCallId: 'read-1', toolName: 'read', input: '{}' },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: undefined },
              usage: {
                inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 30, text: 30, reasoning: 0 },
              },
            },
          ] satisfies ModelPart[],
        }),
      },
      response(),
      response(),
    ],
  });
  const read = tool({
    inputSchema: jsonSchema<Record<string, never>>({
      type: 'object',
      properties: {},
      additionalProperties: false,
    }),
    execute: () => 'read output',
  });
  const { executor, preparation, initialRequest } = fixture(model, { read });
  const session = await open(executor, preparation);
  const first = await executor.turn(session, initialRequest, control());
  expect(first).toMatchObject({ kind: 'completed' });
  expect(first).not.toHaveProperty('responseMessages');
  expect(
    await executor.turn(session, { ...decision(initialRequest), input: 'Continue' }, control()),
  ).toMatchObject({ kind: 'completed' });
  expect(model.doStreamCalls).toHaveLength(3);
  expect(model.doStreamCalls[2].prompt).toMatchObject([
    { role: 'system', content: 'Hi' },
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: 'read-1', toolName: 'read', input: {} }],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'read-1',
          toolName: 'read',
          output: { type: 'text', value: 'read output' },
        },
      ],
    },
    { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
    { role: 'user', content: [{ type: 'text', text: 'Continue' }] },
  ]);
});
