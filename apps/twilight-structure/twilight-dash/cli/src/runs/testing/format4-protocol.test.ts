import { rejects } from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { constructFixture, settleFixture } from './construct-fixture';
import { createFormat4Fixture, verifyFormat4Source } from './format4-fixture';
import {
  decodeFormat4Command,
  decodeFormat4Envelope,
  decodeFormat4Response,
  type Format4Command,
} from './format4-protocol';

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

test('format4 command decoder rejects missing and extra tuple fields', () => {
  for (const command of [
    { method: 'renewOwnership', parameters: [ownership] },
    { method: 'acquireOwnership', parameters: ['owner', 0] },
  ]) {
    expect(decodeFormat4Command(command)).toEqual<unknown>(command);
    expect(() =>
      decodeFormat4Command({ ...command, parameters: command.parameters.slice(0, -1) }),
    ).toThrow('arity differs');
    expect(() =>
      decodeFormat4Command({ ...command, parameters: [...command.parameters, 'extra'] }),
    ).toThrow('arity differs');
  }
});

test('genuine format4 worker rejects missing and extra command parameters without changing state', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format4-command-arity-'));
  const fixture = await constructFixture(
    () => createFormat4Fixture(join(directory, 'runs.sqlite')),
    [
      () => {
        rmSync(directory, { recursive: true });
      },
    ],
  );
  await settleFixture(async () => {
    const prepared = await fixture.prepareMutation('renewOwnership');
    const before = await fixture.capture();
    for (const command of [
      { ...prepared, parameters: [...prepared.parameters, 'extra'] },
      { ...prepared, parameters: [] },
      { method: 'acquireOwnership', parameters: ['owner'] },
      { method: 'acquireOwnership', parameters: ['owner', 0, 'extra'] },
    ]) {
      // Test boundary: malformed IPC tuples deliberately bypass only the static call signature; the actual worker's arity and field decoders remain installed.
      await rejects(fixture.invoke(command as Format4Command), (cause: unknown) => {
        expect(String(cause)).toContain('format4 worker request refused');
        expect(String(cause)).toContain('arity differs');
        return true;
      });
      expect(await fixture.capture()).toEqual(before);
    }
    expect((await fixture.invoke(prepared)).kind).toBe('applied');
  }, [
    () => fixture.close(),
    () => {
      rmSync(directory, { recursive: true });
    },
  ]);
});

test('format4 provenance verifies the reused archived protocol dependency', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format4-shared-protocol-'));
  const fixture = await constructFixture(
    () => createFormat4Fixture(join(directory, 'runs.sqlite')),
    [
      () => {
        rmSync(directory, { recursive: true });
      },
    ],
  );
  const relative = 'testing/format3-protocol.ts';
  const path = join(
    fixture.sourceDirectory,
    'apps/twilight-structure/twilight-dash/cli/src/runs',
    relative,
  );
  const original = readFileSync(path);
  await settleFixture(() => {
    writeFileSync(path, Buffer.concat([original, Buffer.from('\n// owned provenance fault\n')]));
    expect(() => verifyFormat4Source(fixture.sourceDirectory)).toThrow(
      'predecessor source differs',
    );
    writeFileSync(path, original);
    expect(verifyFormat4Source(fixture.sourceDirectory)).toEqual(fixture.sourceFiles);
  }, [
    () => {
      writeFileSync(path, original);
    },
    () => fixture.close(),
    () => {
      rmSync(directory, { recursive: true });
    },
  ]);
});
