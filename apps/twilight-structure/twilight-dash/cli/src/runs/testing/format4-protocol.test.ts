import { expect, test } from 'bun:test';

import { decodeFormat4Envelope, decodeFormat4Response } from './format4-protocol';

function decode(payload: unknown, expected: Parameters<typeof decodeFormat4Response>[1]) {
  const envelope = decodeFormat4Envelope({ kind: 'reply', requestId: '1', payload });
  if (envelope.kind === 'ready') throw new Error('unexpected ready');
  return decodeFormat4Response(envelope, expected);
}
const ownership = {
  version: 1,
  organizationId: 'organization',
  storeId: 'store',
  ownerId: 'owner',
  epoch: 1,
  expiresAt: 1100,
};
test('format4 rejects a valid payload for the wrong action', () => {
  expect(() => decode({ action: 'hold_write', value: 'locked' }, { kind: 'capture' })).toThrow(
    'action differs',
  );
});
test('format4 rejects a valid mutation reply for the wrong method', () => {
  expect(() =>
    decode(
      { action: 'invoke', method: 'renewOwnership', value: { kind: 'applied', value: ownership } },
      { kind: 'invoke', method: 'acquireOwnership' },
    ),
  ).toThrow('method differs');
});
test('format4 rejects malformed correlated payloads', () => {
  expect(() =>
    decode(
      {
        action: 'capture',
        value: { schema: [], tables: [{ name: 't', columns: ['x'], rows: [[{}]] }] },
      },
      { kind: 'capture' },
    ),
  ).toThrow();
});
test('format4 preserves bigint and blob capture cells', () => {
  const payload = {
    action: 'capture',
    value: {
      schema: [],
      tables: [
        { name: 't', columns: ['n', 'b'], rows: [[9007199254740993n, new Uint8Array([0, 255])]] },
      ],
    },
  };
  expect(decode(payload, { kind: 'capture' })).toEqual<unknown>({
    kind: 'reply',
    requestId: '1',
    payload,
  });
});
test('format4 accepts legacy Attempt2 and rejects widened Attempt3 replies', () => {
  const attempt = {
    version: 2,
    attemptId: 'attempt',
    identity: { version: 1, runId: 'run', occurrenceId: 'occurrence', operationKey: 'operation' },
    ordinal: 1,
    revision: 0,
    admittedEpoch: 1,
    state: { kind: 'queued' },
    holdsCapacity: true,
  };
  const payload = {
    action: 'invoke',
    method: 'admitAttempt',
    value: { kind: 'applied', value: attempt },
  };
  expect(decode(payload, { kind: 'invoke', method: 'admitAttempt' })).toEqual<unknown>({
    kind: 'reply',
    requestId: '1',
    payload,
  });
  expect(() =>
    decode(
      { ...payload, value: { kind: 'applied', value: { ...attempt, version: 3 } } },
      { kind: 'invoke', method: 'admitAttempt' },
    ),
  ).toThrow();
});
test('format4 preserves named recursive diagnostic causes and rejects malformed diagnostics', () => {
  const error = {
    name: 'AggregateError',
    message: 'failed',
    cause: { name: 'Error', message: 'native', code: 'SQLITE_BUSY', cause: null },
    errors: [{ thrown: 'second' }],
  };
  const envelope = decodeFormat4Envelope({
    kind: 'error',
    requestId: '1',
    operation: { action: 'close' },
    error,
  });
  if (envelope.kind === 'ready') throw new Error('unexpected ready');
  expect(decodeFormat4Response(envelope, { kind: 'close' })).toEqual<unknown>(envelope);
  const malformed = decodeFormat4Envelope({
    kind: 'error',
    requestId: '1',
    operation: { action: 'close' },
    error: { ...error, errors: [{}] },
  });
  if (malformed.kind === 'ready') throw new Error('unexpected ready');
  expect(() => decodeFormat4Response(malformed, { kind: 'close' })).toThrow();
});
