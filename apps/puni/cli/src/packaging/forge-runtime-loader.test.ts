import { createHash, randomUUID } from 'node:crypto';

import { afterEach, expect, it } from 'bun:test';

import { loadForgeRuntime } from './forge-runtime-loader';

const globals = new Map<symbol, { canRetire: boolean }>();
afterEach(() => {
  const failures: unknown[] = [];
  for (const [key, custody] of globals) {
    if (!custody.canRetire) {
      failures.push(
        new Error(
          'controlled runtime import settlement unconfirmed; retained global ' + String(key),
        ),
      );
      continue;
    }
    if (!Reflect.deleteProperty(globalThis, key))
      failures.push(new Error('controlled runtime global could not retire'));
    else globals.delete(key);
  }
  if (failures.length !== 0)
    throw new AggregateError(failures, 'retained runtime fixture retirement failed');
});
function isNamespace(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

it('retained runtime loads exact copied bytes with builtin context and rejects a wrong digest before side effects', async () => {
  const tag = 'puni-controlled-forge-runtime-' + randomUUID(),
    key = Symbol.for(tag);
  const effects = { executions: 0 },
    custody = { canRetire: true };
  expect(Reflect.has(globalThis, key)).toBe(false);
  expect(Reflect.set(globalThis, key, effects)).toBe(true);
  globals.set(key, custody);
  const createRuntimeSource = (marker: number): Buffer =>
    Buffer.from(
      'import{createHash}from"node:crypto";' +
        'Reflect.get(globalThis,Symbol.for(' +
        JSON.stringify(tag) +
        ')).executions++;' +
        'export const marker=' +
        String(marker) +
        ';' +
        'export const digest=createHash("sha256").update("owned-builtin").digest("hex");',
    );
  const hashBytes = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  async function observeRuntimeLoad(bytes: Uint8Array, digest: string): Promise<unknown> {
    custody.canRetire = false;
    try {
      return await loadForgeRuntime(bytes, digest);
    } finally {
      custody.canRetire = true;
    }
  }
  const original = createRuntimeSource(41),
    expected = hashBytes(original),
    caller = Buffer.from(original);
  const pending = observeRuntimeLoad(caller, expected);
  caller.fill(0);
  const first = await pending;
  if (!isNamespace(first)) throw new Error('actual retained runtime returned no namespace');
  expect(first['marker']).toBe(41);
  expect(first['digest']).toBe(hashBytes(Buffer.from('owned-builtin')));
  expect(effects.executions).toBe(1);
  expect(await observeRuntimeLoad(original, expected)).toBe(first);
  expect(effects.executions).toBe(1);
  const rejectedBytes = createRuntimeSource(99);
  expect(hashBytes(rejectedBytes)).not.toBe(expected);
  const rejected = await observeRuntimeLoad(rejectedBytes, expected).then(
    () => ({ kind: 'returned' as const }),
    (cause: unknown) => ({ kind: 'refused' as const, cause }),
  );
  // First physical refusal oracle uses a never-imported payload, avoiding a cached-module mask.
  expect(effects.executions).toBe(1);
  expect(rejected.kind).toBe('refused');
  if (rejected.kind !== 'refused' || !(rejected.cause instanceof Error))
    throw new Error('missing retained-byte refusal');
  expect(rejected.cause.message).toBe(
    'retained Forge runtime bytes differ from their authenticated digest',
  );
  const replacement = createRuntimeSource(42),
    second = await observeRuntimeLoad(replacement, hashBytes(replacement));
  if (!isNamespace(second)) throw new Error('actual replacement runtime returned no namespace');
  expect(second['marker']).toBe(42);
  expect(second).not.toBe(first);
  expect(effects.executions).toBe(2);
}, 10000);
