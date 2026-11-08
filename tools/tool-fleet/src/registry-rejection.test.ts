import { expect, test } from 'bun:test';

import { requireRejection, requireResolution } from './registry-rejection.fixture';

for (const [name, cause] of [
  ['error', new Error('owned rejection')],
  ['aggregate', new AggregateError([new Error('first'), new Error('second')], 'owned aggregate')],
  ['undefined', undefined],
  ['null', null],
  ['string', 'owned rejection'],
  ['boolean', false],
] as const) {
  test('rejection assertion retains the exact rejected value and rethrow: ' + name, async () => {
    // The independent handler drains the input even when a counterfactual helper ignores it.
    // Fault values intentionally include non-Errors.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const operation = Promise.reject(cause);
    const drained = operation.then(
      () => ({ kind: 'fulfilled' as const }),
      (failure: unknown) => ({ kind: 'rejected' as const, cause: failure }),
    );
    const completion = await requireRejection(operation).then(
      (value) => ({ kind: 'complete' as const, value }),
      (failure: unknown) => ({ kind: 'failed' as const, cause: failure }),
    );
    await drained;
    expect(completion.kind).toBe('complete');
    if (completion.kind !== 'complete') throw new Error('Required rejection receipt was lost');
    expect(completion.value.cause).toBe(cause);
    let thrown: { cause: unknown } | undefined;
    try {
      completion.value.throwCause();
    } catch (failure) {
      thrown = { cause: failure };
    }
    expect(thrown).toBeDefined();
    if (thrown === undefined) throw new Error('Required rejection rethrow was lost');
    expect(thrown.cause).toBe(cause);
  });
}

for (const [name, value] of [
  ['error value', new Error('fulfilled error value')],
  ['undefined', undefined],
  ['string', 'owned fulfillment'],
] as const) {
  test('rejection assertion refuses a fulfilled operation: ' + name, async () => {
    const completion = await requireRejection(Promise.resolve(value)).then(
      (receipt) => ({ kind: 'complete' as const, receipt }),
      (cause: unknown) => ({ kind: 'failed' as const, cause }),
    );
    expect(completion.kind).toBe('failed');
    if (completion.kind !== 'failed') throw new Error('Fulfillment was certified as a rejection');
    expect(completion.cause).toBeInstanceOf(Error);
    expect(completion.cause).not.toBe(value);
  });
}

test('rejection assertion waits for the pending operation before returning its receipt', async () => {
  const failure = new Error('owned delayed rejection');
  let finish: (cause: unknown) => void = () => {
    throw new Error('Uninitialized rejection input');
  };
  const operation = new Promise<never>((_resolve, reject) => {
    finish = reject;
  });
  const drained = operation.then(
    () => ({ kind: 'fulfilled' as const }),
    (cause: unknown) => ({ kind: 'rejected' as const, cause }),
  );
  let completed = false;
  const pending = requireRejection(operation).then(
    (value) => {
      completed = true;
      return { kind: 'complete' as const, value };
    },
    (cause: unknown) => {
      completed = true;
      return { kind: 'failed' as const, cause };
    },
  );
  try {
    await Promise.resolve();
    expect(completed).toBe(false);
    finish(failure);
    const completion = await pending;
    expect(completion.kind).toBe('complete');
    if (completion.kind !== 'complete') throw new Error('Delayed rejection receipt was lost');
    expect(completion.value.cause).toBe(failure);
  } finally {
    finish(failure);
    await drained;
    await pending;
  }
});

for (const [name, input] of [
  ['undefined', undefined],
  ['null', null],
  ['boolean', false],
  ['string', 'owned value'],
  [
    'rejection thenable',
    {
      then(_resolve: unknown, reject: (cause: unknown) => void) {
        reject(new Error('thenable rejection'));
      },
    },
  ],
] as const) {
  test('rejection assertion refuses a non-Promise operation: ' + name, async () => {
    const completion = await requireRejection(input).then(
      (value) => ({ kind: 'complete' as const, value }),
      (cause: unknown) => ({ kind: 'failed' as const, cause }),
    );
    expect(completion.kind).toBe('failed');
    if (completion.kind !== 'failed') throw new Error('Non-Promise operation was certified');
    expect(completion.cause).toBeInstanceOf(Error);
    if (!(completion.cause instanceof Error)) throw new Error('Missing Promise boundary refusal');
    expect(completion.cause.message).toBe('Expected a native Promise operation');
  });
}

test('rejection assertion refuses a thenable without invoking its getter', async () => {
  let reads = 0;
  const input = {
    get then() {
      reads++;
      throw new Error('Untrusted then getter');
    },
  };
  const completion = await requireRejection(input).then(
    (value) => ({ kind: 'complete' as const, value }),
    (cause: unknown) => ({ kind: 'failed' as const, cause }),
  );
  expect(completion.kind).toBe('failed');
  expect(reads).toBe(0);
});

for (const [name, value] of [
  ['object', { owned: true }],
  ['undefined', undefined],
  ['error value', new Error('fulfilled payload')],
] as const)
  test('resolution assertion preserves the exact fulfilled value: ' + name, async () => {
    expect(await requireResolution(Promise.resolve(value))).toBe(value);
  });

test('resolution assertion retains the exact rejection', async () => {
  const failure = new Error('owned resolution rejection');
  const operation = Promise.reject(failure);
  const drained = operation.then(
    () => ({ kind: 'complete' as const }),
    (cause: unknown) => ({ kind: 'failed' as const, cause }),
  );
  const completion = await requireResolution(operation).then(
    (value) => ({ kind: 'complete' as const, value }),
    (cause: unknown) => ({ kind: 'failed' as const, cause }),
  );
  await drained;
  expect(completion).toEqual({ kind: 'failed', cause: failure });
  if (completion.kind !== 'failed') throw new Error('Resolution rejection was lost');
  expect(completion.cause).toBe(failure);
});

test('resolution assertion refuses a non-Promise without reading then', async () => {
  let reads = 0;
  const input = {
    get then() {
      reads++;
      throw new Error('Unexpected getter');
    },
  };
  const completion = await requireResolution(input).then(
    (value) => ({ kind: 'complete' as const, value }),
    (cause: unknown) => ({ kind: 'failed' as const, cause }),
  );
  expect(completion.kind).toBe('failed');
  expect(reads).toBe(0);
});

test('resolution assertion refuses undefined as an operation', async () => {
  const completion = await requireResolution(undefined).then(
    (value) => ({ kind: 'complete' as const, value }),
    (cause: unknown) => ({ kind: 'failed' as const, cause }),
  );
  expect(completion.kind).toBe('failed');
});

test('resolution assertion waits for a pending operation', async () => {
  const value = { owned: true };
  let finish: (value: unknown) => void = () => {
    throw new Error('Uninitialized fulfillment');
  };
  const operation = new Promise<unknown>((resolve) => {
    finish = resolve;
  });
  let completed = false;
  const pending = requireResolution(operation).then(
    (observed) => {
      completed = true;
      return { kind: 'complete' as const, value: observed };
    },
    (cause: unknown) => {
      completed = true;
      return { kind: 'failed' as const, cause };
    },
  );
  try {
    await Promise.resolve();
    expect(completed).toBe(false);
    finish(value);
    const completion = await pending;
    expect(completion.kind).toBe('complete');
    if (completion.kind !== 'complete') throw new Error('Resolution value was lost');
    expect(completion.value).toBe(value);
  } finally {
    finish(value);
    await pending;
  }
});
