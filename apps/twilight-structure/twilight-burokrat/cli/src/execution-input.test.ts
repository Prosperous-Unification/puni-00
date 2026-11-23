import { expect, it, spyOn } from 'bun:test';

import { readExecutionInput } from './execution-input';
import type { LintInterrupt } from './lint-interrupts';

function selectStream(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
  configure?: (reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>) => void,
) {
  const original = stream.getReader.bind(stream);
  let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
  const select = spyOn(Bun.stdin, 'stream').mockReturnValue(stream);
  const acquire = spyOn(stream, 'getReader').mockImplementation(() => {
    reader = original();
    configure?.(reader);
    return reader;
  });
  return {
    readReader: () => {
      if (reader === undefined) throw new Error('input reader not acquired');
      return reader;
    },
    restore: () => {
      acquire.mockRestore();
      select.mockRestore();
    },
  };
}

it('releases the acquired input reader if interrupt registration throws', async () => {
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(),
    fixture = selectStream(stream),
    fault = new Error('controlled input registration failure');
  try {
    const cause: unknown = await readExecutionInput(() => {
      throw fault;
    }).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(cause).toBe(fault);
    expect(stream.locked).toBe(false);
  } finally {
    fixture.restore();
  }
});

it('releases the settled input reader even when unsubscribe throws', async () => {
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(Uint8Array.from([0, 255]));
        controller.close();
      },
    }),
    fixture = selectStream(stream),
    fault = new Error('controlled input unsubscribe failure');
  try {
    const cause: unknown = await readExecutionInput(() => () => {
      throw fault;
    }).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(cause).toBe(fault);
    expect(stream.locked).toBe(false);
  } finally {
    fixture.restore();
  }
});

it('preserves input read and both cleanup failures after all native releases are attempted', async () => {
  const operation = new Error('controlled input read failure'),
    subscription = new Error('controlled input unsubscribe failure'),
    release = new Error('controlled input reader release failure');
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.error(operation);
      },
    }),
    fixture = selectStream(stream);
  let released = false;
  const pending = readExecutionInput(() => () => {
    throw subscription;
  });
  const reader = fixture.readReader(),
    original = reader.releaseLock.bind(reader);
  const unlock = spyOn(reader, 'releaseLock').mockImplementation(() => {
    original();
    released = true;
    throw release;
  });
  try {
    const cause: unknown = await pending.then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(cause).toBeInstanceOf(AggregateError);
    if (!(cause instanceof AggregateError)) throw new Error('missing input failure aggregation');
    expect(cause.errors).toEqual([operation, subscription, release]);
    expect(released).toBe(true);
    expect(stream.locked).toBe(false);
  } finally {
    unlock.mockRestore();
    fixture.restore();
  }
});

it('awaits actual input settlement after the native cancel completes but its wrapper rejects', async () => {
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(),
    fault = new Error('controlled post-cancel failure');
  const finish = Promise.withResolvers<undefined>(),
    reached = Promise.withResolvers<undefined>();
  const probes: { mockRestore(): void }[] = [];
  const fixture = selectStream(stream, (reader) => {
    const nativeRead = reader.read.bind(reader),
      nativeCancel = reader.cancel.bind(reader);
    probes.push(
      spyOn(reader, 'read').mockImplementation(async () => {
        const part = await nativeRead();
        if (part.done) {
          reached.resolve(undefined);
          await finish.promise;
          return { done: true as const, value: undefined };
        }
        return { done: false as const, value: part.value };
      }),
    );
    probes.push(
      spyOn(reader, 'cancel').mockImplementation(async () => {
        await nativeCancel();
        throw fault;
      }),
    );
  });
  let interrupt: ((signal: LintInterrupt) => void) | undefined,
    settled = false;
  const pending = readExecutionInput((listener) => {
    interrupt = listener;
    return () => undefined;
  });
  void pending.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    if (interrupt === undefined) throw new Error('input subscription not installed');
    interrupt('SIGINT');
    await reached.promise;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    finish.resolve(undefined);
    const cause: unknown = await pending.then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(cause).toBe(fault);
    expect(stream.locked).toBe(false);
  } finally {
    finish.resolve(undefined);
    await pending.then(
      () => undefined,
      () => undefined,
    );
    for (const probe of probes) probe.mockRestore();
    fixture.restore();
  }
});

it('preserves both settled native cancellation and input-loop failures before unlocking', async () => {
  const cancellation = new Error('controlled native cancel wrapper failure'),
    input = new Error('controlled post-cancel input loop failure');
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>(),
    probes: { mockRestore(): void }[] = [];
  const fixture = selectStream(stream, (reader) => {
    const nativeRead = reader.read.bind(reader),
      nativeCancel = reader.cancel.bind(reader);
    probes.push(
      spyOn(reader, 'read').mockImplementation(async () => {
        const part = await nativeRead();
        if (part.done) throw input;
        return { done: false as const, value: part.value };
      }),
    );
    probes.push(
      spyOn(reader, 'cancel').mockImplementation(async () => {
        await nativeCancel();
        throw cancellation;
      }),
    );
  });
  let interrupt: ((signal: LintInterrupt) => void) | undefined;
  const pending = readExecutionInput((listener) => {
    interrupt = listener;
    return () => undefined;
  });
  try {
    if (interrupt === undefined) throw new Error('input subscription not acquired');
    interrupt('SIGTERM');
    const cause: unknown = await pending.then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(cause).toBeInstanceOf(AggregateError);
    if (!(cause instanceof AggregateError))
      throw new Error('missing cancel/input failure aggregation');
    expect(cause.errors).toEqual([cancellation, input]);
    expect(stream.locked).toBe(false);
  } finally {
    for (const probe of probes) probe.mockRestore();
    fixture.restore();
  }
});

it('preserves both cleanup failures after otherwise successful native input acquisition', async () => {
  const subscription = new Error('controlled successful-input unsubscribe failure'),
    release = new Error('controlled successful-input unlock failure');
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.close();
      },
    }),
    probes: { mockRestore(): void }[] = [];
  const fixture = selectStream(stream, (reader) => {
    const unlock = reader.releaseLock.bind(reader);
    probes.push(
      spyOn(reader, 'releaseLock').mockImplementation(() => {
        unlock();
        throw release;
      }),
    );
  });
  try {
    const cause: unknown = await readExecutionInput(() => () => {
      throw subscription;
    }).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(cause).toBeInstanceOf(AggregateError);
    if (!(cause instanceof AggregateError))
      throw new Error('missing successful-input cleanup aggregation');
    expect(cause.errors).toEqual([subscription, release]);
    expect(stream.locked).toBe(false);
  } finally {
    for (const probe of probes) probe.mockRestore();
    fixture.restore();
  }
});
