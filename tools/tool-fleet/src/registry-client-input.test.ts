import { expect, test } from 'bun:test';

import { readRegistryClientInput } from './registry-client-input';
import { requireRejection } from './registry-rejection.fixture';

const origin = { mount: 'mnt:[123]', network: 'net:[456]', pid: 'pid:[789]' };
function stream(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(Buffer.from(chunk));
      controller.close();
    },
  });
}

test('client input reads fragmented origin and preserves the exact request/control bytes', async () => {
  const line = JSON.stringify(origin) + '\n';
  const received = await readRegistryClientInput(
    stream(line.slice(0, 5), line.slice(5) + 'request\ncancel\n'),
    1000,
  );
  try {
    expect(received.origin).toEqual(origin);
    expect(await new Response(received.input).text()).toBe('request\ncancel\n');
  } finally {
    await received.close();
  }
});

for (const [name, chunks] of [
  ['missing origin', []],
  ['incomplete origin', [JSON.stringify(origin)]],
  ['extra selector', [JSON.stringify({ ...origin, executable: '/bin/sh' }) + '\n']],
  ['wrong namespace', [JSON.stringify({ ...origin, mount: 'pid:[123]' }) + '\n']],
  ['oversized origin', [' '.repeat(1025)]],
  ['oversized complete origin', [JSON.stringify(origin) + ' '.repeat(1025) + '\n']],
  ['oversized chunk', [JSON.stringify(origin) + '\n' + ' '.repeat(8193)]],
  ['malformed JSON', ['{\n']],
] as const) {
  test('client input refuses ' + name, async () => {
    const source = stream(...chunks);
    const refused = await requireRejection(readRegistryClientInput(source, 1000));
    expect(refused.throwCause).toThrow();
    expect(source.locked).toBe(false);
  });
}

test('client input cancels withheld origin at its finite deadline and releases ownership', async () => {
  let cancelled = false;
  const source = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const refused = await requireRejection(readRegistryClientInput(source, 20));
  expect(refused.throwCause).toThrow('deadline');
  expect(cancelled).toBe(true);
  expect(source.locked).toBe(false);
});

test('client input preserves both deadline and cancellation failure causes', async () => {
  const cancellation = new Error('owned input cancellation fault');
  const source = new ReadableStream<Uint8Array>({
    cancel() {
      throw cancellation;
    },
  });
  const refused = await requireRejection(readRegistryClientInput(source, 20));
  expect(refused.cause).toBeInstanceOf(AggregateError);
  if (!(refused.cause instanceof AggregateError)) throw new Error('Expected both input failures');
  expect(refused.cause.errors).toHaveLength(2);
  expect(refused.cause.errors[0]).toBeInstanceOf(Error);
  expect(refused.cause.errors[1]).toBe(cancellation);
  expect(source.locked).toBe(false);
});
