import {
  acceptWorkflowBinding,
  checkWorkflowBinding,
  decodeWorkflowBinding,
  selectWorkflowActivity,
} from '@twilight-burokrat/contracts';
import {
  APICallError,
  createProviderRegistry,
  InvalidToolInputError,
  jsonSchema,
  type ModelMessage,
  NoSuchToolError,
  simulateReadableStream,
  tool,
  type ToolSet,
  type UIMessageChunk,
} from 'ai';
import { MockLanguageModelV4, MockProviderV4 } from 'ai/test';
import { expect, test } from 'bun:test';

import { attemptId, occurrenceId, operationKey, ownerId, runId } from '../runs/record-codecs';
import {
  ActivityDispatchError,
  snapshotExecutorLocator,
  snapshotTurnRequest,
} from './activity-executor';
import { type ApiModelRegistry, resolveApiModelSettings } from './api-model-settings';
import { runApiModelTurn } from './api-model-turn';

type ModelResponse = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
type ModelPart = ModelResponse['stream'] extends ReadableStream<infer Part> ? Part : never;
type ModelUsage = Extract<ModelPart, { type: 'finish' }>['usage'];
type ModelFinish = Extract<ModelPart, { type: 'finish' }>['finishReason']['unified'];

function usage(input: number | undefined = 120, output: number | undefined = 30): ModelUsage {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
  };
}

function response(chunks: ModelPart[]): ModelResponse {
  return {
    stream: simulateReadableStream({ initialDelayInMs: null, chunkDelayInMs: null, chunks }),
  };
}

function finish(reason: ModelFinish = 'stop', counts = usage()): ModelPart {
  return { type: 'finish', finishReason: { unified: reason, raw: undefined }, usage: counts };
}

function text(value: string): ModelPart[] {
  return [
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: value },
    { type: 'text-end', id: 'text-1' },
  ];
}

function toolStep(counts = usage()): ModelResponse {
  return response([
    { type: 'stream-start', warnings: [] },
    ...text('Checking. '),
    { type: 'tool-call', toolCallId: 'read-1', toolName: 'read', input: '{}' },
    finish('tool-calls', counts),
  ]);
}

const schema = jsonSchema<Record<string, never>>({
  type: 'object',
  properties: {},
  additionalProperties: false,
});
const read = tool({ inputSchema: schema, execute: () => 'read' });

function fixture(model: MockLanguageModelV4, tools: ToolSet = {}, maxSteps = 2) {
  const binding = decodeWorkflowBinding({
    version: 1,
    types: { default: { build: { class: 'api' } } },
    classes: {
      api: {
        executor: 'api-model',
        model: 'openai:fixture',
        prompt: '.twilight/api.md',
        tools: Object.keys(tools),
        limits: { maxSteps, maxOutputTokens: 80 },
      },
    },
  });
  const selected = selectWorkflowActivity(
    acceptWorkflowBinding(checkWorkflowBinding(binding, ['build']), [
      { path: '.twilight/api.md', bytes: new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x69]) },
    ]),
    'change',
    'build',
  );
  const providers = createProviderRegistry<Record<string, MockProviderV4>, string>({
    openai: new MockProviderV4({ languageModels: { fixture: model } }),
  });
  const models: ApiModelRegistry = {
    languageModel: (id: string) => providers.languageModel<string>(id),
  };
  const settings = resolveApiModelSettings({ selection: selected, models, tools });
  const request = snapshotTurnRequest({
    version: 1,
    turnKey: 'turn',
    owner: { ownerId: ownerId('owner'), epoch: 1 },
    cause: { kind: 'initial' },
    input: 'Hello',
  });
  const { bindingDigest, requestedType, matchedType, stepCode, className } = selected;
  const identity = Object.freeze({
    locator: snapshotExecutorLocator({
      version: 1,
      executor: 'api-model',
      executorVersion: '1',
      preparation: {
        version: 1,
        identity: {
          version: 1,
          runId: runId('run'),
          occurrenceId: occurrenceId('occurrence'),
          operationKey: operationKey('operation'),
        },
        attemptId: attemptId('attempt'),
        creationKey: 'creation',
      },
      selection: { bindingDigest, requestedType, matchedType, stepCode, className },
      session: {
        version: 1,
        workerId: 'worker',
        sessionId: 'session',
        operationKey: operationKey('operation'),
      },
    }),
    turnKey: request.turnKey,
    owner: request.owner,
  });
  const controller = new AbortController();
  const parts: UIMessageChunk[] = [];
  return {
    settings,
    identity,
    request,
    history: [] as readonly ModelMessage[],
    signal: controller.signal,
    abort: () => {
      controller.abort();
    },
    onPart: (part: UIMessageChunk) => {
      parts.push(part);
    },
    parts,
    controller,
  };
}

test('real SDK stream retains accepted instructions limits input history and measured usage', async () => {
  const model = new MockLanguageModelV4({
    doStream: response([{ type: 'stream-start', warnings: [] }, ...text('Hi'), finish()]),
  });
  const options = fixture(model);
  const dispatched = await runApiModelTurn({
    ...options,
    history: [
      { role: 'user', content: 'Earlier' },
      { role: 'assistant', content: 'Remembered' },
    ],
  });
  expect(dispatched).toMatchObject({
    kind: 'completed',
    identity: options.identity,
    outcome: {
      text: 'Hi',
      finish: 'end_turn',
      usage: { kind: 'measured', inputTokens: 120, outputTokens: 30 },
    },
  });
  expect(
    options.parts.filter((part) => part.type === 'text-delta').map((part) => part.delta),
  ).toEqual(['Hi']);
  expect(model.doStreamCalls).toHaveLength(1);
  expect(model.doStreamCalls[0]?.maxOutputTokens).toBe(80);
  expect(model.doStreamCalls[0]?.prompt).toEqual([
    { role: 'system', content: 'Hi' },
    { role: 'user', content: [{ type: 'text', text: 'Earlier' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Remembered' }] },
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ]);
  if (dispatched.kind !== 'completed') throw new Error('expected completion');
  expect(dispatched.responseMessages).toEqual([
    { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
  ]);
});

test('real two-step tool loop sums every known count and retains every SDK response message', async () => {
  const model = new MockLanguageModelV4({
    doStream: [toolStep(usage(10, 2)), response([...text('Done'), finish('stop', usage(20, 3))])],
  });
  const options = fixture(model, { read });
  const dispatched = await runApiModelTurn(options);
  expect(dispatched).toMatchObject({
    kind: 'completed',
    outcome: {
      text: 'Checking. Done',
      finish: 'end_turn',
      usage: { kind: 'measured', inputTokens: 30, outputTokens: 5 },
    },
  });
  expect(model.doStreamCalls).toHaveLength(2);
  expect(
    options.parts.filter((part) => part.type === 'text-delta').map((part) => part.delta),
  ).toEqual(['Checking. ', 'Done']);
  if (dispatched.kind !== 'completed') throw new Error('expected completion');
  expect(dispatched.responseMessages.map((message) => message.role)).toEqual([
    'assistant',
    'tool',
    'assistant',
  ]);
  expect(dispatched.responseMessages[1]).toMatchObject({
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'read-1',
        toolName: 'read',
        output: { type: 'text', value: 'read' },
      },
    ],
  });
});

test('mixed known and missing per-step counts stay unknown despite SDK numeric totals', async () => {
  const incomplete = usage(10, 2);
  incomplete.inputTokens.total = undefined;
  const model = new MockLanguageModelV4({
    doStream: [toolStep(incomplete), response([...text('Done'), finish('stop', usage(20, 3))])],
  });
  expect(await runApiModelTurn(fixture(model, { read }))).toMatchObject({
    kind: 'completed',
    outcome: { usage: { kind: 'unknown', reason: 'provider-usage-unavailable' } },
  });
  expect(model.doStreamCalls).toHaveLength(2);
});

test('explicit zero remains measured zero across tool steps', async () => {
  const model = new MockLanguageModelV4({
    doStream: [toolStep(usage(0, 0)), response([finish('stop', usage(0, 0))])],
  });
  expect(await runApiModelTurn(fixture(model, { read }))).toMatchObject({
    kind: 'completed',
    outcome: { usage: { kind: 'measured', inputTokens: 0, outputTokens: 0 } },
  });
});

for (const [label, input, output] of [
  ['negative input', -1, 30],
  ['negative output', 120, -1],
  ['unsafe input', Number.MAX_SAFE_INTEGER + 1, 30],
  ['fractional output', 120, 0.5],
  ['infinite input', Infinity, 30],
  ['NaN output', 120, NaN],
] as const) {
  test(`malformed ${label} after dispatch throws with original known identity`, async () => {
    const model = new MockLanguageModelV4({
      doStream: response([...text('Partial'), finish('stop', usage(input, output))]),
    });
    const options = fixture(model);
    const failure = await runApiModelTurn(options).then(
      () => {
        throw new Error('forbidden completion');
      },
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ActivityDispatchError);
    if (!(failure instanceof ActivityDispatchError)) throw new Error('expected dispatch failure');
    expect(failure.identity).toEqual(options.identity);
    expect(Object.isFrozen(failure.identity)).toBe(true);
    expect(failure.cause).toBeInstanceOf(Error);
    expect(failure.message).toBe('Activity dispatch failed');
    expect(model.doStreamCalls).toHaveLength(1);
  });
}

test('unsafe whole-turn sum throws even when individual step counts are safe', async () => {
  const model = new MockLanguageModelV4({
    doStream: [
      toolStep(usage(Number.MAX_SAFE_INTEGER, 0)),
      response([finish('stop', usage(1, 0))]),
    ],
  });
  expect(
    await runApiModelTurn(fixture(model, { read })).catch((error: unknown) => error),
  ).toBeInstanceOf(ActivityDispatchError);
});

test('normal stop at maxSteps stays end_turn while length is output_truncated', async () => {
  for (const [reason, wanted] of [
    ['stop', 'end_turn'],
    ['length', 'output_truncated'],
    ['content-filter', 'refused'],
  ] as const) {
    const model = new MockLanguageModelV4({ doStream: response([...text('Hi'), finish(reason)]) });
    expect(await runApiModelTurn(fixture(model, {}, 1))).toMatchObject({
      kind: 'completed',
      outcome: { finish: wanted },
    });
  }
});

test('actually exhausted SDK tool-loop budget yields max_steps with no extra dispatch', async () => {
  const model = new MockLanguageModelV4({
    doStream: [toolStep(), toolStep(), response([finish()])],
  });
  expect(await runApiModelTurn(fixture(model, { read }))).toMatchObject({
    kind: 'completed',
    outcome: { finish: 'max_steps' },
  });
  expect(model.doStreamCalls).toHaveLength(2);
});

test('retryable API transport failure uses exactly one SDK dispatch and leaks no private text', async () => {
  const cause = new APICallError({
    message: 'secret backend',
    url: 'https://invalid.local',
    requestBodyValues: {},
    statusCode: 503,
    isRetryable: true,
  });
  const model = new MockLanguageModelV4({
    doStream: () => Promise.reject(cause),
  });
  const options = fixture(model);
  const dispatched = await runApiModelTurn(options).catch((error: unknown) => error);
  expect(model.doStreamCalls).toHaveLength(1);
  expect(dispatched).toMatchObject({
    kind: 'unresolved',
    reason: 'transport_lost',
    text: '',
    usage: { kind: 'unknown', reason: 'interrupted-before-usage' },
  });
  expect(model.doStreamCalls).toHaveLength(1);
  const errors = options.parts.filter((part) => part.type === 'error');
  expect(errors).toHaveLength(1);
  expect(errors[0]?.errorText).toBeString();
  expect(errors[0]?.errorText).not.toBe('');
  expect(JSON.stringify(options.parts)).not.toContain('secret');
});

test('unknown SDK exception throws original private cause rather than modeled transport', async () => {
  const cause = new Error('secret unexpected failure');
  const model = new MockLanguageModelV4({
    doStream: () => Promise.reject(cause),
  });
  const options = fixture(model);
  const failure = await runApiModelTurn(options).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ActivityDispatchError);
  if (!(failure instanceof ActivityDispatchError)) throw new Error('expected dispatch failure');
  expect(failure.cause).toBe(cause);
  expect(failure.identity).toEqual(options.identity);
  expect(JSON.stringify(options.parts)).not.toContain('secret');
});

test('unexpected throwing tool requests abort prevents another step and preserves original cause', async () => {
  const cause = new Error('secret tool exception');
  const throwing = tool({
    inputSchema: schema,
    execute: (): string => {
      throw cause;
    },
  });
  const model = new MockLanguageModelV4({
    doStream: [toolStep(), response([...text('forbidden'), finish()])],
  });
  const options = fixture(model, { read: throwing });
  const failure = await runApiModelTurn(options).catch((error: unknown) => error);
  expect(model.doStreamCalls).toHaveLength(1);
  expect(failure).toBeInstanceOf(ActivityDispatchError);
  if (!(failure instanceof ActivityDispatchError)) throw new Error('expected dispatch failure');
  expect(failure.cause).toBe(cause);
  expect(failure.identity).toEqual(options.identity);
  expect(options.controller.signal.aborted).toBe(true);
  expect(model.doStreamCalls).toHaveLength(1);
  expect(JSON.stringify(options.parts)).not.toContain('secret');
});

test('listener failure stops later live callbacks requests abort and returns observer_failed', async () => {
  const model = new MockLanguageModelV4({ doStream: response([...text('Hi'), finish()]) });
  const options = fixture(model);
  let callbacks = 0;
  const dispatched = await runApiModelTurn({
    ...options,
    onPart: () => {
      callbacks++;
      throw new Error('secret listener');
    },
  });
  expect(dispatched).toMatchObject({
    kind: 'unresolved',
    reason: 'observer_failed',
    usage: { kind: 'unknown', reason: 'interrupted-before-usage' },
  });
  expect(callbacks).toBe(1);
  expect(options.controller.signal.aborted).toBe(true);
});

for (const [label, chunks] of [
  ['empty', []],
  ['partial without finish', text('Partial')],
  ['other terminal', [...text('Partial'), finish('other')]],
  ['error terminal', [finish('error')]],
] as const) {
  test(`${label} stream never becomes normal completion`, async () => {
    const options = fixture(new MockLanguageModelV4({ doStream: response([...chunks]) }));
    expect(await runApiModelTurn(options)).toMatchObject({
      kind: 'unresolved',
      reason: 'provider_incomplete',
    });
  });
}

test('abort after dispatch remains interrupted with unknown usage', async () => {
  const model = new MockLanguageModelV4({ doStream: response([...text('Hi'), finish()]) });
  const options = fixture(model);
  expect(
    await runApiModelTurn({
      ...options,
      onPart: (part) => {
        if (part.type === 'text-delta') options.abort();
      },
    }),
  ).toMatchObject({
    kind: 'unresolved',
    reason: 'interrupted',
    usage: { kind: 'unknown', reason: 'interrupted-before-usage' },
  });
});

for (const [label, capability, wanted] of [
  ['unexecuted tool', tool({ inputSchema: schema }), 'tool_input_required'],
  [
    'approval-dependent tool',
    tool({ inputSchema: schema, needsApproval: true, execute: () => 'unapproved' }),
    'approval_required',
  ],
] as const) {
  test(`${label} yields named uncertainty without fabricated success`, async () => {
    const model = new MockLanguageModelV4({ doStream: [toolStep(), response([finish()])] });
    const options = fixture(model, { read: capability });
    const dispatched = await runApiModelTurn(options);
    expect(dispatched).toMatchObject({ kind: 'unresolved', reason: wanted });
    expect(dispatched).not.toHaveProperty('responseMessages');
    expect(model.doStreamCalls).toHaveLength(1);
  });
}

test('malformed trusted terminal throws rather than returning a completed undefined finish', async () => {
  const model = new MockLanguageModelV4({
    doStream: response([...text('Hi'), finish('impossible' as ModelFinish)]),
  });
  expect(await runApiModelTurn(fixture(model)).catch((error: unknown) => error)).toBeInstanceOf(
    ActivityDispatchError,
  );
});

test('malformed reported usage still throws at a suspended tool boundary', async () => {
  const model = new MockLanguageModelV4({ doStream: toolStep(usage(-1, 2)) });
  expect(
    await runApiModelTurn(fixture(model, { read: tool({ inputSchema: schema }) })).catch(
      (error: unknown) => error,
    ),
  ).toBeInstanceOf(ActivityDispatchError);
});

test('provider-executed raw tool error preserves original cause without a local execution callback', async () => {
  const cause = { private: 'secret provider tool error' };
  const model = new MockLanguageModelV4({
    doStream: response([
      {
        type: 'tool-call',
        toolCallId: 'remote-1',
        toolName: 'read',
        input: '{}',
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'remote-1',
        toolName: 'read',
        result: cause,
        isError: true,
      },
      finish(),
    ]),
  });
  const options = fixture(model, { read });
  const failure = await runApiModelTurn(options).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ActivityDispatchError);
  if (!(failure instanceof ActivityDispatchError)) throw new Error('expected dispatch failure');
  expect(failure.cause).toBe(cause);
  expect(failure.identity).toEqual(options.identity);
  expect(options.signal.aborted).toBe(true);
  expect(JSON.stringify(options.parts)).not.toContain('secret');
});

test('tool-calls without an actually exercised budget stop stays incomplete', async () => {
  const model = new MockLanguageModelV4({ doStream: response([finish('tool-calls')]) });
  expect(await runApiModelTurn(fixture(model))).toMatchObject({
    kind: 'unresolved',
    reason: 'provider_incomplete',
  });
});

test('private caller abort reason never escapes through live UI parts', async () => {
  const model = new MockLanguageModelV4({ doStream: response([...text('Hi'), finish()]) });
  const options = fixture(model);
  const dispatched = await runApiModelTurn({
    ...options,
    onPart: (part) => {
      options.parts.push(part);
      if (part.type === 'text-delta')
        options.controller.abort(new Error('secret cancellation detail'));
    },
  });
  expect(dispatched).toMatchObject({ kind: 'unresolved', reason: 'interrupted' });
  expect(JSON.stringify(options.parts)).not.toContain('secret');
});

test('missing output count in one real SDK step remains unknown', async () => {
  const incomplete = usage(10, 2);
  incomplete.outputTokens.total = undefined;
  const model = new MockLanguageModelV4({
    doStream: [toolStep(incomplete), response([finish('stop', usage(20, 3))])],
  });
  expect(await runApiModelTurn(fixture(model, { read }))).toMatchObject({
    kind: 'completed',
    outcome: { usage: { kind: 'unknown', reason: 'provider-usage-unavailable' } },
  });
});

test('unsafe output sum throws even when individual step counts are safe', async () => {
  const model = new MockLanguageModelV4({
    doStream: [
      toolStep(usage(0, Number.MAX_SAFE_INTEGER)),
      response([finish('stop', usage(0, 1))]),
    ],
  });
  expect(
    await runApiModelTurn(fixture(model, { read })).catch((error: unknown) => error),
  ).toBeInstanceOf(ActivityDispatchError);
});

for (const [label, name, input, expected] of [
  ['invalid JSON', 'read', 'not-json', InvalidToolInputError],
  ['missing tool name', 'absent', '{}', NoSuchToolError],
] as const) {
  test(`SDK ${label} produces raw failure without executing local tool`, async () => {
    let executions = 0;
    const capability = tool({
      inputSchema: schema,
      execute: () => {
        executions++;
        return 'unexpected';
      },
    });
    const model = new MockLanguageModelV4({
      doStream: [
        response([
          { type: 'tool-call', toolCallId: 'bad-1', toolName: name, input },
          finish('tool-calls'),
        ]),
        response([finish()]),
      ],
    });
    const options = fixture(model, { read: capability });
    const failure = await runApiModelTurn(options).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ActivityDispatchError);
    if (!(failure instanceof ActivityDispatchError)) throw new Error('expected dispatch failure');
    expect(failure.cause).toBeInstanceOf(expected);
    expect(executions).toBe(0);
    expect(model.doStreamCalls).toHaveLength(1);
  });
}

for (const boundary of ['tool', 'listener'] as const) {
  test(`${boundary} failure retains original and throwing abort cleanup inside correlated error`, async () => {
    const cause = new Error('secret original failure');
    const cleanup = new Error('secret abort cleanup');
    const capability = tool({
      inputSchema: schema,
      execute: (): string => {
        throw cause;
      },
    });
    const model = new MockLanguageModelV4({
      doStream:
        boundary === 'tool'
          ? [toolStep(), response([finish()])]
          : response([...text('Hi'), finish()]),
    });
    const options = fixture(model, boundary === 'tool' ? { read: capability } : {});
    const failure = await runApiModelTurn({
      ...options,
      abort: () => {
        throw cleanup;
      },
      onPart:
        boundary === 'listener'
          ? () => {
              throw cause;
            }
          : options.onPart,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ActivityDispatchError);
    if (!(failure instanceof ActivityDispatchError)) throw new Error('expected dispatch failure');
    expect(failure.identity).toEqual(options.identity);
    expect(failure.cause).toBeInstanceOf(AggregateError);
    if (!(failure.cause instanceof AggregateError)) throw new Error('expected combined failure');
    expect(failure.cause.cause).toBe(cause);
    expect(failure.cause.errors).toEqual([cause, cleanup]);
    expect(failure.message).toBe('Activity dispatch failed');
  });
}

function rejectStream(cause: unknown): ModelResponse {
  const chunks: ModelPart[] = [
    { type: 'text-start', id: 'partial' },
    { type: 'text-delta', id: 'partial', delta: 'Partial' },
  ];
  return {
    stream: new ReadableStream<ModelPart>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk === undefined) controller.error(cause);
        else controller.enqueue(chunk);
      },
    }),
  };
}

function transportError() {
  return new APICallError({
    message: 'secret reader failure',
    url: 'https://invalid.local',
    requestBodyValues: {},
    statusCode: 503,
    isRetryable: true,
  });
}

test('rejected SDK reader reports transport uncertainty with partial text and one call', async () => {
  const model = new MockLanguageModelV4({ doStream: rejectStream(transportError()) });
  const options = fixture(model);
  const dispatched = await runApiModelTurn(options);
  expect(dispatched).toMatchObject({
    kind: 'unresolved',
    reason: 'transport_lost',
    identity: options.identity,
    text: 'Partial',
    usage: { kind: 'unknown', reason: 'interrupted-before-usage' },
  });
  expect(dispatched).not.toHaveProperty('responseMessages');
  expect(model.doStreamCalls).toHaveLength(1);
  expect(
    options.parts.filter((part) => part.type === 'text-delta').map((part) => part.delta),
  ).toEqual(['Partial']);
  expect(JSON.stringify(options.parts)).not.toContain('secret');
});

test('unexpected rejected SDK reader retains original cause and turn correlation', async () => {
  const cause = new Error('secret unknown reader failure');
  const model = new MockLanguageModelV4({ doStream: rejectStream(cause) });
  const options = fixture(model);
  const failure = await runApiModelTurn(options).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ActivityDispatchError);
  if (!(failure instanceof ActivityDispatchError)) throw new Error('expected dispatch failure');
  expect(failure.cause).toBe(cause);
  expect(failure.identity).toEqual(options.identity);
});

test('local tool APICallError retains tool ownership instead of modeled transport', async () => {
  const cause = transportError();
  const capability = tool({
    inputSchema: schema,
    execute: (): string => {
      throw cause;
    },
  });
  const model = new MockLanguageModelV4({ doStream: [toolStep(), response([finish()])] });
  const options = fixture(model, { read: capability });
  const failure = await runApiModelTurn(options).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ActivityDispatchError);
  if (!(failure instanceof ActivityDispatchError)) throw new Error('expected dispatch failure');
  expect(failure.cause).toBe(cause);
  expect(failure.identity).toEqual(options.identity);
  expect(model.doStreamCalls).toHaveLength(1);
});

for (const boundary of ['transport', 'unexpected'] as const) {
  test(`rejected ${boundary} reader plus abort cleanup preserves both original causes`, async () => {
    const cause = boundary === 'transport' ? transportError() : new Error('secret reader');
    const cleanup = new Error('secret cleanup');
    const options = fixture(new MockLanguageModelV4({ doStream: rejectStream(cause) }));
    const failure = await runApiModelTurn({
      ...options,
      abort: () => {
        throw cleanup;
      },
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ActivityDispatchError);
    if (!(failure instanceof ActivityDispatchError)) throw new Error('expected dispatch failure');
    expect(failure.identity).toEqual(options.identity);
    expect(failure.cause).toBeInstanceOf(AggregateError);
    if (!(failure.cause instanceof AggregateError)) throw new Error('expected combined failure');
    expect(failure.cause.cause).toBe(cause);
    expect(failure.cause.errors).toEqual([cause, cleanup]);
  });
}

for (const cleanupFails of [false, true]) {
  test(`listener failure precedes rejected transport when abort cleanup ${cleanupFails ? 'fails' : 'succeeds'}`, async () => {
    const readerFailure = transportError();
    const listenerFailure = transportError();
    const cleanup = new Error('secret listener abort');
    const options = fixture(new MockLanguageModelV4({ doStream: rejectStream(readerFailure) }));
    let callbacks = 0;
    const dispatched = await runApiModelTurn({
      ...options,
      abort: cleanupFails
        ? () => {
            throw cleanup;
          }
        : options.abort,
      onPart: (part) => {
        callbacks++;
        if (part.type === 'text-delta') throw listenerFailure;
      },
    }).catch((error: unknown) => error);
    if (cleanupFails) {
      expect(dispatched).toBeInstanceOf(ActivityDispatchError);
      if (!(dispatched instanceof ActivityDispatchError))
        throw new Error('expected dispatch failure');
      expect(dispatched.identity).toEqual(options.identity);
      expect(dispatched.cause).toBeInstanceOf(AggregateError);
      if (!(dispatched.cause instanceof AggregateError))
        throw new Error('expected combined failure');
      expect(dispatched.cause.cause).toBe(listenerFailure);
      expect(dispatched.cause.errors).toEqual([listenerFailure, cleanup]);
    } else {
      expect(dispatched).toMatchObject({
        kind: 'unresolved',
        reason: 'observer_failed',
        usage: { kind: 'unknown', reason: 'interrupted-before-usage' },
      });
    }
    expect(callbacks).toBe(4);
  });
}

for (const [boundary, capability, reason] of [
  ['client input', tool({ inputSchema: schema }), 'tool_input_required'],
  [
    'approval',
    tool({ inputSchema: schema, needsApproval: true, execute: () => 'unapproved' }),
    'approval_required',
  ],
] as const) {
  for (const missing of [false, true]) {
    test(`${boundary} suspension retains ${missing ? 'missing' : 'measured'} terminal usage`, async () => {
      const counts = usage(120, 30);
      if (missing) counts.outputTokens.total = undefined;
      const model = new MockLanguageModelV4({ doStream: toolStep(counts) });
      const dispatched = await runApiModelTurn(fixture(model, { read: capability }));
      expect(dispatched).toMatchObject({
        kind: 'unresolved',
        reason,
        usage: missing
          ? { kind: 'unknown', reason: 'provider-usage-unavailable' }
          : { kind: 'measured', inputTokens: 120, outputTokens: 30 },
      });
      expect(dispatched).not.toHaveProperty('responseMessages');
      expect(model.doStreamCalls).toHaveLength(1);
    });
  }
  test(`${boundary} suspension without trustworthy terminal cannot retain measured usage`, async () => {
    const model = new MockLanguageModelV4({
      doStream: response([
        ...text('Partial'),
        { type: 'tool-call', toolCallId: 'read-1', toolName: 'read', input: '{}' },
      ]),
    });
    expect(await runApiModelTurn(fixture(model, { read: capability }))).toMatchObject({
      kind: 'unresolved',
      reason: 'provider_incomplete',
      usage: { kind: 'unknown', reason: 'interrupted-before-usage' },
    });
  });
}

test('finish-step listener failure cannot swallow malformed reported SDK usage', async () => {
  const model = new MockLanguageModelV4({
    doStream: response([...text('Partial'), finish('stop', usage(-1, 30))]),
  });
  const options = fixture(model);
  const failure = await runApiModelTurn({
    ...options,
    onPart: (part) => {
      options.parts.push(part);
      if (part.type === 'finish-step') throw new Error('secret finish-step listener');
    },
  }).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ActivityDispatchError);
  if (!(failure instanceof ActivityDispatchError)) throw new Error('expected dispatch failure');
  expect(failure.identity).toEqual(options.identity);
  expect(failure.cause).toBeInstanceOf(Error);
  expect(options.signal.aborted).toBe(true);
  expect(options.parts.map((part) => part.type)).toContain('finish-step');
  expect(model.doStreamCalls).toHaveLength(1);
});

test('unexpected rejected reader still throws original cause after listener failure', async () => {
  const cause = new Error('secret unexpected reader after listener');
  const model = new MockLanguageModelV4({ doStream: rejectStream(cause) });
  const options = fixture(model);
  const failure = await runApiModelTurn({
    ...options,
    onPart: (part) => {
      options.parts.push(part);
      if (part.type === 'text-delta') throw new Error('secret listener');
    },
  }).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ActivityDispatchError);
  if (!(failure instanceof ActivityDispatchError)) throw new Error('expected dispatch failure');
  expect(failure.cause).toBe(cause);
  expect(failure.identity).toEqual(options.identity);
  expect(options.signal.aborted).toBe(true);
  expect(model.doStreamCalls).toHaveLength(1);
});

test('owned cancellation reason after listener failure retains observer uncertainty', async () => {
  const cancellation = new Error('secret owned cancellation');
  const model = new MockLanguageModelV4({ doStream: rejectStream(cancellation) });
  const options = fixture(model);
  const dispatched = await runApiModelTurn({
    ...options,
    abort: () => {
      options.controller.abort(cancellation);
    },
    onPart: (part) => {
      options.parts.push(part);
      if (part.type === 'text-delta') throw new Error('secret listener');
    },
  });
  expect(dispatched).toMatchObject({
    kind: 'unresolved',
    reason: 'observer_failed',
    identity: options.identity,
    usage: { kind: 'unknown', reason: 'interrupted-before-usage' },
  });
  expect(options.signal.aborted).toBe(true);
  expect(options.signal.reason).toBe(cancellation);
  expect(model.doStreamCalls).toHaveLength(1);
  expect(dispatched).not.toHaveProperty('responseMessages');
  expect(JSON.stringify(options.parts)).not.toContain('secret');
});
