import {
  acquireRuntimeAuthority,
  applyRuntimeCommands,
  type AuthorityReceipt,
  type ClaimReceipt,
  ClientConfigurationError,
  type ClientInput,
  type ClientTransport,
  lookupRuntimeReceipt,
  readRuntimeState,
  type RuntimeState,
  type TransportInput,
} from '@wbs/contracts';
import { describe, expect, it } from 'bun:test';

import { createRuntimeClient } from './runtime-client';

const scope = { organizationId: 'organization', projectId: 'project', personId: 'person' };
const authority = { ownerId: 'receiver-owner', generation: 1 };
const authorityInput: ClientInput<typeof acquireRuntimeAuthority> = {
  params: { id: 'project' },
  body: {
    schemaVersion: 1,
    commandId: 'command',
    personId: 'person',
    expectedLedgerId: 'ledger',
    ownerId: 'receiver-owner',
    expectedGeneration: null,
  },
};
const readInput: ClientInput<typeof readRuntimeState> = {
  params: { id: 'project' },
  query: { personId: 'person', expectedLedgerId: 'ledger' },
};
const lookupInput: ClientInput<typeof lookupRuntimeReceipt> = {
  params: { id: 'project', commandId: 'command' },
  query: { personId: 'person', expectedLedgerId: 'ledger' },
};
const execution = { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' };
const commandInput: ClientInput<typeof applyRuntimeCommands> = {
  params: { id: 'project' },
  body: {
    schemaVersion: 1,
    commandId: 'claim-command',
    personId: 'person',
    expectedLedgerId: 'ledger',
    authority,
    expectedBasis: 'rb1:' + 'a'.repeat(64),
    action: { kind: 'claim', workItemId: 'work', stepId: 'step', parentClaimId: null, execution },
  },
};
const receipt: AuthorityReceipt = {
  schemaVersion: 1,
  ledgerId: 'ledger',
  scope,
  commandId: 'command',
  requestDigest: 'a'.repeat(64),
  actorId: 'actor',
  acceptance: { kind: 'authority', authority },
};
const claimReceipt: ClaimReceipt = {
  ...receipt,
  commandId: 'claim-command',
  acceptance: {
    kind: 'claim',
    authority,
    claim: { claimId: 'claim', workItemId: 'work', stepId: 'step', parentClaimId: null, execution },
    basisAfter: 'rb1:' + 'b'.repeat(64),
  },
};
const state: RuntimeState = {
  schemaVersion: 1,
  ledgerId: 'ledger',
  scope,
  basis: 'rb1:' + 'a'.repeat(64),
  facts: { projectRevision: 0, workItems: [], steps: [] },
  authority: { kind: 'held', ...authority },
  claims: [],
};
const literalReceipt = `{
  "actorId": "actor", "futureCompatible": {"preserve": true},
  "schemaVersion": 1, "ledgerId": "ledger",
  "scope": {"organizationId":"organization", "projectId":"project", "personId":"person"},
  "commandId": "command",
  "requestDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "acceptance": {"kind":"authority", "authority":{"ownerId":"receiver-owner", "generation":1}}
}\n`;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

describe('runtime client', () => {
  it('forwards all four exact shapes with validated inputs and the original signal', async () => {
    const controller = new AbortController();
    const sent: { shape: unknown; input: TransportInput }[] = [];
    const client = createRuntimeClient((shape, input) => {
      sent.push({ shape, input });
      if (shape === readRuntimeState) return Promise.resolve(Response.json(state));
      if (shape === applyRuntimeCommands) return Promise.resolve(Response.json(claimReceipt));
      return Promise.resolve(Response.json(receipt));
    });
    expect(Object.keys(client).sort()).toEqual([
      'acquireAuthority',
      'applyCommands',
      'lookupReceipt',
      'readState',
    ]);
    for (const [invoke, shape, input, body] of [
      [
        () => client.readState({ ...readInput, signal: controller.signal }),
        readRuntimeState,
        readInput,
        state,
      ],
      [
        () => client.acquireAuthority({ ...authorityInput, signal: controller.signal }),
        acquireRuntimeAuthority,
        authorityInput,
        receipt,
      ],
      [
        () => client.applyCommands({ ...commandInput, signal: controller.signal }),
        applyRuntimeCommands,
        commandInput,
        claimReceipt,
      ],
      [
        () => client.lookupReceipt({ ...lookupInput, signal: controller.signal }),
        lookupRuntimeReceipt,
        lookupInput,
        receipt,
      ],
    ] as const) {
      const exchange = await invoke();
      expect(exchange.reply).toMatchObject({ kind: 'success', status: 200, body });
      expect(sent.at(-1)).toEqual({
        shape,
        input: {
          params: input.params,
          query: 'query' in input ? input.query : undefined,
          body: 'body' in input ? input.body : undefined,
          signal: controller.signal,
        },
      });
      expect(exchange.response?.status).toBe(200);
    }
  });

  it('preserves literal original bytes including whitespace, key order and compatible fields', async () => {
    const response = new Response(literalReceipt, {
      status: 200,
      headers: { 'x-private': 'omit-evidence' },
    });
    const exchange = await createRuntimeClient(() => Promise.resolve(response)).acquireAuthority(
      authorityInput,
    );
    expect(exchange.reply).toMatchObject({ kind: 'success', body: receipt });
    expect(exchange.response).toEqual({
      status: 200,
      bytes: new TextEncoder().encode(literalReceipt),
    });
    expect(response.bodyUsed).toBe(true);
  });

  it('invokes synchronous valid preflight transport in the original calling stack', async () => {
    let calls = 0;
    const client = createRuntimeClient(() => {
      calls++;
      return Promise.resolve(Response.json(receipt));
    });
    const pending = client.acquireAuthority(authorityInput);
    expect(calls).toBe(1);
    await pending;
  });

  it('correlates reverse-completing concurrent calls with their own bytes and status', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const client = createRuntimeClient((_shape, input) =>
      input.params['commandId'] === 'command' ? first.promise : second.promise,
    );
    const one = client.lookupReceipt(lookupInput);
    const two = client.lookupReceipt({
      ...lookupInput,
      params: { id: 'project', commandId: 'other' },
    });
    const refusal = ' { "error" : "runtime_receipt_not_found" }\n';
    second.resolve(new Response(refusal, { status: 404 }));
    const twoExchange = await two;
    first.resolve(new Response(literalReceipt));
    const oneExchange = await one;
    expect(twoExchange.reply).toMatchObject({ kind: 'refusal', status: 404 });
    expect(twoExchange.response).toEqual({ status: 404, bytes: new TextEncoder().encode(refusal) });
    expect(oneExchange.reply.kind).toBe('success');
    expect(oneExchange.response).toEqual({
      status: 200,
      bytes: new TextEncoder().encode(literalReceipt),
    });
    expect(twoExchange.response?.bytes).not.toBe(oneExchange.response?.bytes);
  });

  it('isolates a cancelled and a body-failing neighbor from successful captures', async () => {
    const cancelled = deferred<Response>();
    const broken = deferred<Response>();
    const controller = new AbortController();
    const fault = new Error('clone body failed');
    const client = createRuntimeClient((_shape, input) => {
      if (input.params['commandId'] === 'cancel') return cancelled.promise;
      if (input.params['commandId'] === 'broken') return broken.promise;
      return Promise.resolve(new Response(literalReceipt));
    });
    const cancellation = client.lookupReceipt({
      ...lookupInput,
      params: { id: 'project', commandId: 'cancel' },
      signal: controller.signal,
    });
    const failure = client.lookupReceipt({
      ...lookupInput,
      params: { id: 'project', commandId: 'broken' },
    });
    const success = await client.lookupReceipt(lookupInput);
    controller.abort();
    cancelled.resolve(new Response(' {"error":"runtime_receipt_not_found"} ', { status: 404 }));
    broken.resolve(
      new Response(
        new ReadableStream({
          start(stream) {
            stream.error(fault);
          },
        }),
      ),
    );
    const [cancelledExchange, failedExchange] = await Promise.all([cancellation, failure]);
    expect(success.response?.bytes).toEqual(new TextEncoder().encode(literalReceipt));
    expect(cancelledExchange.reply).toEqual({ kind: 'failure', failure: { code: 'cancelled' } });
    expect(cancelledExchange.response).toBeNull();
    expect(failedExchange.reply).toEqual({
      kind: 'failure',
      failure: { code: 'transport', cause: fault },
    });
    expect(failedExchange.response).toBeNull();
  });

  it('correlates overlapping validations after another call captures its response', async () => {
    const firstText = deferred<string>();
    const reading = deferred<undefined>();
    const first = new Response(literalReceipt);
    first.text = () => {
      reading.resolve(undefined);
      return firstText.promise;
    };
    const client = createRuntimeClient((_shape, input) =>
      Promise.resolve(
        input.params['commandId'] === 'command'
          ? first
          : new Response(' {"error":"runtime_receipt_not_found"} ', { status: 404 }),
      ),
    );
    const pending = client.lookupReceipt(lookupInput);
    await reading.promise;
    const neighbor = await client.lookupReceipt({
      ...lookupInput,
      params: { id: 'project', commandId: 'other' },
    });
    firstText.resolve(literalReceipt);
    const exchange = await pending;
    expect(neighbor.response?.status).toBe(404);
    expect(exchange.reply.kind).toBe('success');
    expect(exchange.response).toEqual({
      status: 200,
      bytes: new TextEncoder().encode(literalReceipt),
    });
  });

  it('discards an aborted transport response before cloning its unending body', async () => {
    const cloned = deferred<'clone'>();
    const cancelled = deferred<'cancel'>();
    const opened = deferred<ReadableStreamDefaultController<Uint8Array>>();
    let streamClosed = false;
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        opened.resolve(stream);
      },
      cancel() {
        streamClosed = true;
        cancelled.resolve('cancel');
      },
    });
    const stream = await opened.promise;
    const closeBody = () => {
      if (!streamClosed) stream.close();
    };
    const response = new Response(body);
    const clone = response.clone.bind(response);
    response.clone = () => {
      cloned.resolve('clone');
      return clone();
    };
    const transport = deferred<Response>();
    const controller = new AbortController();
    const pending = createRuntimeClient(() => transport.promise).acquireAuthority({
      ...authorityInput,
      signal: controller.signal,
    });
    controller.abort();
    transport.resolve(response);
    try {
      expect(await Promise.race([cloned.promise, cancelled.promise])).toBe('cancel');
    } finally {
      closeBody();
      await pending;
    }
    expect(await pending).toEqual({
      reply: { kind: 'failure', failure: { code: 'cancelled' } },
      response: null,
    });
  });

  it.each([
    [
      409,
      ' {"error":"runtime_authority_stale"} ',
      { kind: 'refusal', status: 409, body: { error: 'runtime_authority_stale' } },
    ],
    [200, '{broken', { kind: 'failure', failure: { code: 'invalid_response', reason: 'json' } }],
    [
      200,
      '{"schemaVersion":2}',
      { kind: 'failure', failure: { code: 'invalid_response', reason: 'schema' } },
    ],
    [
      409,
      '{"error":"future_refusal"}',
      { kind: 'failure', failure: { code: 'invalid_response', reason: 'schema' } },
    ],
    [
      418,
      'unexpected bytes',
      { kind: 'failure', failure: { code: 'unexpected_status', status: 418 } },
    ],
  ])(
    'retains actual bytes for status %s and shared validation of %s',
    async (status, source, reply) => {
      const exchange = await createRuntimeClient(() =>
        Promise.resolve(new Response(source, { status })),
      ).acquireAuthority(authorityInput);
      expect(exchange.reply).toMatchObject(reply);
      expect(exchange.response).toEqual({ status, bytes: new TextEncoder().encode(source) });
    },
  );

  it('keeps already-aborted and invalid input preflight free of response and transport', async () => {
    let calls = 0;
    const client = createRuntimeClient(() => {
      calls++;
      return Promise.resolve(Response.json(receipt));
    });
    const controller = new AbortController();
    controller.abort();
    expect(await client.readState({ ...readInput, signal: controller.signal })).toEqual({
      reply: { kind: 'failure', failure: { code: 'cancelled' } },
      response: null,
    });
    expect(
      await client.acquireAuthority({
        ...authorityInput,
        body: { ...authorityInput.body, ownerId: '' },
      }),
    ).toEqual({
      reply: { kind: 'failure', failure: { code: 'invalid_request', part: 'body' } },
      response: null,
    });
    expect(
      await client.lookupReceipt({ ...lookupInput, params: { id: '..', commandId: 'command' } }),
    ).toEqual({
      reply: { kind: 'failure', failure: { code: 'invalid_request', part: 'params' } },
      response: null,
    });
    expect(calls).toBe(0);
  });

  it('throws configuration errors for absent or non-callable transport', () => {
    for (const transport of [undefined, null, {}, 'fetch'])
      expect(() => createRuntimeClient(transport as ClientTransport)).toThrow(
        ClientConfigurationError,
      );
  });

  it('throws configuration errors for parsed-only transport replies', async () => {
    const client = createRuntimeClient(() =>
      Promise.resolve({ kind: 'json', status: 200, body: receipt }),
    );
    const failure = await client.acquireAuthority(authorityInput).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(ClientConfigurationError);
  });

  it.each(['clone', 'arrayBuffer'] as const)(
    'preserves %s failure cause without fallback or retry',
    async (boundary) => {
      const fault = new Error(boundary + ' failed');
      const response = new Response(literalReceipt);
      if (boundary === 'clone')
        response.clone = () => {
          throw fault;
        };
      else
        response.clone = () => {
          const clone = new Response(literalReceipt);
          clone.arrayBuffer = () => Promise.reject(fault);
          return clone;
        };
      let calls = 0;
      const exchange = await createRuntimeClient(() => {
        calls++;
        return Promise.resolve(response);
      }).acquireAuthority(authorityInput);
      expect(exchange).toEqual({
        reply: { kind: 'failure', failure: { code: 'transport', cause: fault } },
        response: null,
      });
      expect(calls).toBe(1);
      expect(response.bodyUsed).toBe(false);
    },
  );

  it('awaits raw capture before exposing a validated reply', async () => {
    const bytes = deferred<ArrayBuffer>();
    const entered = deferred<undefined>();
    const response = new Response(literalReceipt);
    response.clone = () => {
      const clone = new Response(literalReceipt);
      clone.arrayBuffer = () => {
        entered.resolve(undefined);
        return bytes.promise;
      };
      return clone;
    };
    let settled = false;
    const pending = createRuntimeClient(() => Promise.resolve(response))
      .acquireAuthority(authorityInput)
      .then((exchange) => {
        settled = true;
        return exchange;
      });
    await entered.promise;
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(response.bodyUsed).toBe(false);
      expect(settled).toBe(false);
    } finally {
      bytes.resolve(new TextEncoder().encode(literalReceipt).buffer);
    }
    const exchange = await pending;
    expect(exchange.reply.kind).toBe('success');
    expect(exchange.response?.bytes).toEqual(new TextEncoder().encode(literalReceipt));
  });
});
