import { expect, test } from 'bun:test';

import { clientFromShapes } from './client';
import { fetchTransport } from './client-fetch';
import { runtimeCommandShapes } from './runtime-command-shapes';

const request = {
  params: { id: 'project' },
  body: {
    schemaVersion: 1 as const,
    commandId: 'c',
    personId: 'person',
    expectedLedgerId: 'ledger',
    ownerId: 'owner',
    expectedGeneration: null,
  },
  headers: { authorization: 'Bearer injected' },
};
const receipt = {
  schemaVersion: 1,
  ledgerId: 'ledger',
  scope: { organizationId: 'org', projectId: 'project', personId: 'person' },
  commandId: 'c',
  requestDigest: 'a'.repeat(64),
  actorId: 'actor',
  acceptance: { kind: 'authority', authority: { ownerId: 'owner', generation: 1 } },
};
for (const [label, response] of [
  ['malformed JSON', () => new Response('{', { status: 200 })],
  ['wrong version', () => Response.json({ ...receipt, schemaVersion: 2 })],
  ['missing authority', () => Response.json({ ...receipt, acceptance: { kind: 'authority' } })],
  [
    'unsafe generation',
    () =>
      Response.json({
        ...receipt,
        acceptance: {
          kind: 'authority',
          authority: { ownerId: 'owner', generation: Number.MAX_SAFE_INTEGER + 1 },
        },
      }),
  ],
  ['unexpected status', () => Response.json(receipt, { status: 202 })],
  ['absent capability', () => new Response('Not Found', { status: 404 })],
  ['unknown refusal', () => Response.json({ error: 'unknown_runtime_code' }, { status: 409 })],
] as const) {
  test(`keeps ${label} after dispatch as client failure`, async () => {
    let dispatches = 0;
    const client = clientFromShapes(
      runtimeCommandShapes,
      fetchTransport('http://wbs.test', (_url, init) => {
        dispatches += 1;
        expect(new Headers(init.headers).get('authorization')).toBe('Bearer injected');
        return Promise.resolve(response());
      }),
    );
    const reply = await client.acquireRuntimeAuthority(request);
    expect(reply.kind).toBe('failure');
    if (label === 'unexpected status')
      expect(reply).toMatchObject({ failure: { code: 'unexpected_status', status: 202 } });
    expect(dispatches).toBe(1);
  });
}
test('cancellation after dispatch stays unknown and never retries an ordinary route', async () => {
  const cancellation = new AbortController();
  let dispatches = 0;
  const client = clientFromShapes(
    runtimeCommandShapes,
    fetchTransport('http://wbs.test', (_url, init) => {
      dispatches += 1;
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('cancelled', 'AbortError'));
          },
          { once: true },
        );
        cancellation.abort();
      });
    }),
  );
  expect(
    (await client.acquireRuntimeAuthority({ ...request, signal: cancellation.signal })).kind,
  ).toBe('failure');
  expect(dispatches).toBe(1);
});
test('accepts only a complete validated receipt through the existing fetch transport', async () => {
  const client = clientFromShapes(
    runtimeCommandShapes,
    fetchTransport('http://wbs.test', () => Promise.resolve(Response.json(receipt))),
  );
  expect(await client.acquireRuntimeAuthority(request)).toMatchObject({
    kind: 'success',
    body: receipt,
  });
});

test('command responses cannot substitute an authority receipt or omit exact write claim fields', async () => {
  const commandRequest = {
    params: { id: 'project' },
    body: {
      schemaVersion: 1 as const,
      commandId: 'c',
      personId: 'person',
      expectedLedgerId: 'ledger',
      authority: { ownerId: 'owner', generation: 1 },
      expectedBasis: `rb1:${'a'.repeat(64)}`,
      action: {
        kind: 'claim' as const,
        workItemId: 'leaf',
        stepId: 'dev',
        parentClaimId: null,
        execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' },
      },
    },
  };
  for (const acceptance of [
    receipt.acceptance,
    {
      kind: 'write',
      authority: { ownerId: 'owner', generation: 1 },
      basisAfter: `rb1:${'a'.repeat(64)}`,
      applied: [{ index: 0, kind: 'setProgress' }],
    },
  ]) {
    const client = clientFromShapes(
      runtimeCommandShapes,
      fetchTransport('http://wbs.test', () =>
        Promise.resolve(Response.json({ ...receipt, acceptance })),
      ),
    );
    expect((await client.applyRuntimeCommands(commandRequest)).kind).toBe('failure');
  }
});

for (const [status, body] of [
  [409, { error: 'runtime_receipt_not_found' }],
  [404, { error: 'runtime_authority_stale' }],
  [409, { error: 'already_claimed', at: 0, kind: 'claimWorkItem' }],
] as const) {
  test(`rejects malformed refusal correlation ${String(status)}/${body.error}`, async () => {
    const client = clientFromShapes(
      runtimeCommandShapes,
      fetchTransport('http://wbs.test', () => Promise.resolve(Response.json(body, { status }))),
    );
    expect((await client.acquireRuntimeAuthority(request)).kind).toBe('failure');
  });
}

const runtimeClaim = {
  claimId: 'claim',
  workItemId: 'leaf',
  stepId: 'dev',
  parentClaimId: null,
  execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' },
};
const runtimeAuthority = { ownerId: 'owner', generation: 1 };
const runtimeBasis = `rb1:${'a'.repeat(64)}`;

for (const [label, applied] of [
  ['empty', []],
  ['oversized', Array.from({ length: 201 }, (_, index) => ({ index, kind: 'setProgress' }))],
  ['nonzero first', [{ index: 7, kind: 'setProgress' }]],
  [
    'gap',
    [
      { index: 0, kind: 'setProgress' },
      { index: 2, kind: 'setProgress' },
    ],
  ],
  [
    'duplicate',
    [
      { index: 0, kind: 'setProgress' },
      { index: 0, kind: 'setProgress' },
    ],
  ],
  [
    'reversed',
    [
      { index: 1, kind: 'setProgress' },
      { index: 0, kind: 'setProgress' },
    ],
  ],
] as const) {
  for (const operation of ['applyRuntimeCommands', 'lookupRuntimeReceipt'] as const) {
    test(`rejects ${label} applied sequence in otherwise complete ${operation} write receipt`, async () => {
      const body = {
        ...receipt,
        acceptance: {
          kind: 'write',
          authority: runtimeAuthority,
          claim: runtimeClaim,
          basisAfter: runtimeBasis,
          applied,
        },
      };
      const client = clientFromShapes(
        runtimeCommandShapes,
        fetchTransport('http://wbs.test', () => Promise.resolve(Response.json(body))),
      );
      const reply =
        operation === 'applyRuntimeCommands'
          ? await client.applyRuntimeCommands(
              createWriteRequest(Math.min(200, Math.max(1, applied.length))),
            )
          : await client.lookupRuntimeReceipt({
              params: { id: 'project', commandId: 'c' },
              query: { personId: 'person', expectedLedgerId: 'ledger' },
            });
      expect(reply).toMatchObject({
        kind: 'failure',
        failure: { code: 'invalid_response', reason: 'schema', status: 200 },
      });
    });
  }
}
for (const length of [1, 200]) {
  for (const operation of ['applyRuntimeCommands', 'lookupRuntimeReceipt'] as const) {
    test(`accepts complete contiguous ${String(length)}-command ${operation} write receipt`, async () => {
      const applied = Array.from({ length }, (_, index) => ({ index, kind: 'setProgress' }));
      const body = {
        ...receipt,
        acceptance: {
          kind: 'write',
          authority: runtimeAuthority,
          claim: runtimeClaim,
          basisAfter: runtimeBasis,
          applied,
        },
      };
      const client = clientFromShapes(
        runtimeCommandShapes,
        fetchTransport('http://wbs.test', () => Promise.resolve(Response.json(body))),
      );
      const reply =
        operation === 'applyRuntimeCommands'
          ? await client.applyRuntimeCommands(createWriteRequest(length))
          : await client.lookupRuntimeReceipt({
              params: { id: 'project', commandId: 'c' },
              query: { personId: 'person', expectedLedgerId: 'ledger' },
            });
      expect(reply).toMatchObject({ kind: 'success', body });
    });
  }
}
function createWriteRequest(length: number) {
  return {
    params: { id: 'project' },
    body: {
      schemaVersion: 1 as const,
      commandId: 'c',
      personId: 'person',
      expectedLedgerId: 'ledger',
      authority: runtimeAuthority,
      expectedBasis: runtimeBasis,
      action: {
        kind: 'write' as const,
        claim: runtimeClaim,
        commands: Array.from({ length }, () => ({
          kind: 'setProgress' as const,
          workItemId: 'leaf',
          stepId: 'dev',
          state: 'done' as const,
        })),
      },
    },
  };
}

test('lookup preserves complete authority and claim receipt variants', async () => {
  for (const acceptance of [
    { kind: 'authority', authority: runtimeAuthority },
    { kind: 'claim', authority: runtimeAuthority, claim: runtimeClaim, basisAfter: runtimeBasis },
  ]) {
    const body = { ...receipt, acceptance };
    const client = clientFromShapes(
      runtimeCommandShapes,
      fetchTransport('http://wbs.test', () => Promise.resolve(Response.json(body))),
    );
    expect(
      await client.lookupRuntimeReceipt({
        params: { id: 'project', commandId: 'c' },
        query: { personId: 'person', expectedLedgerId: 'ledger' },
      }),
    ).toMatchObject({ kind: 'success', body });
  }
});
