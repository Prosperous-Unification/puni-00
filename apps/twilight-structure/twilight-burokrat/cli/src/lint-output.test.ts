import { afterEach, describe, expect, it, mock } from 'bun:test';

import type { LintInterrupt } from './lint-interrupts';
import { createLintOutputs } from './lint-output';

const owners: ReturnType<typeof createLintOutputs>[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
});
function createFixture() {
  const stdout = {
    write: mock((bytes: Uint8Array): number | Promise<number> => bytes.length),
    flush: mock((): number | Promise<number> => 0),
    unref: mock(() => undefined),
  };
  const stderr = {
    write: mock((bytes: Uint8Array): number | Promise<number> => bytes.length),
    flush: mock((): number | Promise<number> => 0),
    unref: mock(() => undefined),
  };
  const openStdout = mock(() => stdout);
  const openStderr = mock(() => stderr);
  const listeners = new Set<(signal: LintInterrupt) => void>();
  const output = createLintOutputs({
    stdout: openStdout,
    stderr: openStderr,
    subscribeInterrupts: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
  owners.push(output);
  return { output, stdout, stderr, openStdout, openStderr, listeners };
}
describe('executable-owned lint output', () => {
  it('opens lazily and reports written only after binary write and flush complete', async () => {
    const fixture = createFixture();
    expect(fixture.openStdout).not.toHaveBeenCalled();
    expect(fixture.openStderr).not.toHaveBeenCalled();
    const write = Promise.withResolvers<number>();
    const flush = Promise.withResolvers<number>();
    const writeStarted = Promise.withResolvers<undefined>();
    const flushStarted = Promise.withResolvers<undefined>();
    fixture.stdout.write.mockImplementation(() => {
      writeStarted.resolve(undefined);
      return write.promise;
    });
    fixture.stdout.flush.mockImplementation(() => {
      flushStarted.resolve(undefined);
      return flush.promise;
    });
    const bytes = Uint8Array.from([255, 0, 65]);
    let hasSettled = false;
    const pending = fixture.output.stdout(bytes).then((outcome) => {
      hasSettled = true;
      return outcome;
    });
    await writeStarted.promise;
    expect(hasSettled).toBe(false);
    expect(fixture.stdout.flush).not.toHaveBeenCalled();
    write.resolve(3);
    await flushStarted.promise;
    await Bun.sleep(0);
    expect(hasSettled).toBe(false);
    flush.resolve(0);
    expect(await pending).toEqual({ kind: 'written' });
    expect(fixture.stdout.write.mock.calls[0]?.[0]).toEqual(bytes);
    fixture.output.dispose();
    fixture.output.dispose();
    expect(fixture.stdout.unref).toHaveBeenCalledTimes(1);
    expect(fixture.openStderr).not.toHaveBeenCalled();
    expect(fixture.listeners.size).toBe(0);
  });
  it('releases both stalled API writes on first cancellation without claiming a flush', async () => {
    const fixture = createFixture();
    const write = Promise.withResolvers<number>();
    const started = Promise.withResolvers<undefined>();
    let count = 0;
    const stall = () => {
      count++;
      if (count === 2) started.resolve(undefined);
      return write.promise;
    };
    fixture.stdout.write.mockImplementation(stall);
    fixture.stderr.write.mockImplementation(stall);
    const stdout = fixture.output.stdout(Uint8Array.of(1));
    const stderr = fixture.output.stderr(Uint8Array.of(2));
    await started.promise;
    for (const listener of fixture.listeners) listener('SIGINT');
    expect(await stdout).toEqual({ kind: 'cancelled', signal: 'SIGINT' });
    expect(await stderr).toEqual({ kind: 'cancelled', signal: 'SIGINT' });
    for (const listener of fixture.listeners) listener('SIGTERM');
    expect(await fixture.output.stdout(Uint8Array.of(3))).toEqual({
      kind: 'cancelled',
      signal: 'SIGINT',
    });
    expect(fixture.stdout.flush).not.toHaveBeenCalled();
    expect(fixture.stderr.flush).not.toHaveBeenCalled();
    fixture.output.dispose();
    expect(fixture.stdout.unref).toHaveBeenCalledTimes(1);
    expect(fixture.stderr.unref).toHaveBeenCalledTimes(1);
    write.reject(new Error('late native rejection after abandoned output'));
    await Bun.sleep(0);
  });
  it('a failure on one sink rejects a stalled peer with the same failure', async () => {
    const fixture = createFixture();
    const pending = Promise.withResolvers<number>();
    const started = Promise.withResolvers<undefined>();
    const fault = new Error('injected stderr EPIPE');
    fixture.stdout.write.mockImplementation(() => {
      started.resolve(undefined);
      return pending.promise;
    });
    fixture.stderr.write.mockImplementation(() => {
      throw fault;
    });
    const stdout = fixture.output.stdout(Uint8Array.of(1)).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    await started.promise;
    const stderr = fixture.output.stderr(Uint8Array.of(2)).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(await stdout).toBe(fault);
    expect(await stderr).toBe(fault);
    expect(fixture.stdout.unref).toHaveBeenCalledTimes(1);
    expect(fixture.stderr.unref).toHaveBeenCalledTimes(1);
    pending.reject(new Error('late native peer rejection'));
    await Bun.sleep(0);
  });
  it('does not overtake an outstanding stderr operation when reporting a stdout failure', async () => {
    const fixture = createFixture();
    const pending = Promise.withResolvers<number>();
    const started = Promise.withResolvers<undefined>();
    let count = 0;
    const fault = new Error('stdout EPIPE');
    fixture.stderr.write.mockImplementation((bytes) => {
      count++;
      if (count === 1) {
        started.resolve(undefined);
        return pending.promise;
      }
      return bytes.length;
    });
    fixture.stdout.write.mockImplementation(() => {
      throw fault;
    });
    const stderr = fixture.output.stderr(Uint8Array.of(1)).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    await started.promise;
    expect(
      await fixture.output.stdout(Uint8Array.of(2)).then(
        () => undefined,
        (cause: unknown) => cause,
      ),
    ).toBe(fault);
    expect(await stderr).toBe(fault);
    const diagnostic = fixture.output.reportDiagnostic(Uint8Array.of(3));
    await Bun.sleep(0);
    expect(fixture.stderr.write).toHaveBeenCalledTimes(1);
    pending.resolve(1);
    expect(await diagnostic).toEqual({ kind: 'reported' });
    expect(fixture.stderr.write).toHaveBeenCalledTimes(2);
    expect(fixture.openStderr).toHaveBeenCalledTimes(1);
  });
  it('bounds diagnostic abandonment behind a permanently stalled stderr operation', async () => {
    const fixture = createFixture();
    const pending = Promise.withResolvers<number>();
    const started = Promise.withResolvers<undefined>();
    const fault = new Error('stdout EPIPE');
    fixture.stderr.write.mockImplementation(() => {
      started.resolve(undefined);
      return pending.promise;
    });
    fixture.stdout.write.mockImplementation(() => {
      throw fault;
    });
    const stderr = fixture.output.stderr(Uint8Array.of(1)).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    await started.promise;
    await fixture.output.stdout(Uint8Array.of(2)).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(await stderr).toBe(fault);
    const diagnostic = await fixture.output.reportDiagnostic(Uint8Array.of(3));
    expect(diagnostic.kind).toBe('abandoned');
    expect(fixture.stderr.write).toHaveBeenCalledTimes(1);
    expect(fixture.openStderr).toHaveBeenCalledTimes(1);
    expect((await fixture.output.reportDiagnostic(Uint8Array.of(4))).kind).toBe('abandoned');
    expect(fixture.openStderr).toHaveBeenCalledTimes(1);
    pending.resolve(1);
    await Bun.sleep(0);
    expect(fixture.stderr.write).toHaveBeenCalledTimes(1);
  }, 5000);
  it('does not create another writer when stderr itself already failed', async () => {
    const fixture = createFixture();
    const fault = new Error('stderr EPIPE');
    fixture.stderr.write.mockImplementation(() => {
      throw fault;
    });
    expect(
      await fixture.output.stderr(Uint8Array.of(1)).then(
        () => undefined,
        (cause: unknown) => cause,
      ),
    ).toBe(fault);
    expect(await fixture.output.reportDiagnostic(Uint8Array.of(2))).toEqual({
      kind: 'abandoned',
      cause: fault,
    });
    expect(fixture.openStderr).toHaveBeenCalledTimes(1);
  });
  it('refuses writes after disposal instead of reopening a native sink', async () => {
    const fixture = createFixture();
    fixture.output.dispose();
    const failure: unknown = await fixture.output.stdout(Uint8Array.of(1)).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(fixture.openStdout).not.toHaveBeenCalled();
    expect(fixture.listeners.size).toBe(0);
  });
});

it('does not start a queued diagnostic after its owner is disposed', async () => {
  const fixture = createFixture();
  const pending = Promise.withResolvers<number>();
  const started = Promise.withResolvers<undefined>();
  fixture.stderr.write.mockImplementation(() => {
    started.resolve(undefined);
    return pending.promise;
  });
  const stderr = fixture.output.stderr(Uint8Array.of(1)).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  await started.promise;
  const diagnostic = fixture.output.reportDiagnostic(Uint8Array.of(2));
  fixture.output.dispose();
  pending.resolve(1);
  expect((await diagnostic).kind).toBe('abandoned');
  await stderr;
  expect(fixture.stderr.write).toHaveBeenCalledTimes(1);
});

it('surfaces a native sink release failure during otherwise normal disposal', async () => {
  const fixture = createFixture();
  expect(await fixture.output.stdout(Uint8Array.of(1))).toEqual({ kind: 'written' });
  const fault = new Error('injected sink unref failure');
  fixture.stdout.unref.mockImplementation(() => {
    throw fault;
  });
  let failure: unknown;
  try {
    fixture.output.dispose();
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) throw new Error('release failure was lost');
  expect(failure.errors).toContain(fault);
  fixture.output.dispose();
  expect(fixture.stdout.unref).toHaveBeenCalledTimes(1);
});

for (const phase of ['expiry', 'disposal'] as const) {
  it(
    'never starts diagnostic flush after ' + phase + ' during a pending native write',
    async () => {
      const fixture = createFixture();
      const pending = Promise.withResolvers<number>();
      const started = Promise.withResolvers<undefined>();
      fixture.stderr.write.mockImplementation(() => {
        started.resolve(undefined);
        return pending.promise;
      });
      const diagnostic = fixture.output.reportDiagnostic(Uint8Array.of(1));
      await started.promise;
      if (phase === 'expiry') expect((await diagnostic).kind).toBe('abandoned');
      else fixture.output.dispose();
      pending.resolve(1);
      expect((await diagnostic).kind).toBe('abandoned');
      await Bun.sleep(0);
      expect(fixture.stderr.flush).not.toHaveBeenCalled();
    },
    5000,
  );
}

it('serializes one channel through the actual write and flush tail', async () => {
  const fixture = createFixture();
  const pending = Promise.withResolvers<number>();
  const started = Promise.withResolvers<undefined>();
  fixture.stdout.flush.mockImplementationOnce(() => {
    started.resolve(undefined);
    return pending.promise;
  });
  const first = fixture.output.stdout(Uint8Array.of(1));
  const second = fixture.output.stdout(Uint8Array.of(2));
  await started.promise;
  expect(fixture.stdout.write).toHaveBeenCalledTimes(1);
  pending.resolve(0);
  expect(await first).toEqual({ kind: 'written' });
  expect(await second).toEqual({ kind: 'written' });
  expect(fixture.stdout.write.mock.calls.map((call) => call[0])).toEqual([
    Uint8Array.of(1),
    Uint8Array.of(2),
  ]);
});

it('never begins queued writes or a delayed flush after cancellation', async () => {
  const fixture = createFixture();
  const pending = Promise.withResolvers<number>();
  const started = Promise.withResolvers<undefined>();
  fixture.stdout.write.mockImplementation(() => {
    started.resolve(undefined);
    return pending.promise;
  });
  const first = fixture.output.stdout(Uint8Array.of(1));
  const second = fixture.output.stdout(Uint8Array.of(2));
  await started.promise;
  for (const listener of fixture.listeners) listener('SIGTERM');
  expect(await first).toEqual({ kind: 'cancelled', signal: 'SIGTERM' });
  expect(await second).toEqual({ kind: 'cancelled', signal: 'SIGTERM' });
  pending.resolve(1);
  await Bun.sleep(0);
  expect(fixture.stdout.write).toHaveBeenCalledTimes(1);
  expect(fixture.stdout.flush).not.toHaveBeenCalled();
});

it('never opens a native sink after cancellation recorded before the first operation', async () => {
  const fixture = createFixture();
  for (const listener of fixture.listeners) listener('SIGINT');
  expect(await fixture.output.stdout(Uint8Array.of(1))).toEqual({
    kind: 'cancelled',
    signal: 'SIGINT',
  });
  expect(fixture.openStdout).not.toHaveBeenCalled();
});

it('preserves a failed terminal event for every later writer and signal', async () => {
  const fixture = createFixture();
  const fault = new Error('first output failure');
  fixture.stdout.write.mockImplementation(() => {
    throw fault;
  });
  expect(
    await fixture.output.stdout(Uint8Array.of(1)).then(
      () => undefined,
      (cause: unknown) => cause,
    ),
  ).toBe(fault);
  for (const listener of fixture.listeners) listener('SIGTERM');
  expect(
    await fixture.output.stderr(Uint8Array.of(2)).then(
      () => undefined,
      (cause: unknown) => cause,
    ),
  ).toBe(fault);
  expect(fixture.openStderr).not.toHaveBeenCalled();
});

it('observes a late native failure without replacing prior cancellation', async () => {
  const fixture = createFixture();
  const pending = Promise.withResolvers<number>();
  const started = Promise.withResolvers<undefined>();
  fixture.stdout.write.mockImplementation(() => {
    started.resolve(undefined);
    return pending.promise;
  });
  const first = fixture.output.stdout(Uint8Array.of(1));
  await started.promise;
  for (const listener of fixture.listeners) listener('SIGINT');
  expect(await first).toEqual({ kind: 'cancelled', signal: 'SIGINT' });
  pending.reject(new Error('late native write failure'));
  await Bun.sleep(0);
  expect(await fixture.output.stderr(Uint8Array.of(2))).toEqual({
    kind: 'cancelled',
    signal: 'SIGINT',
  });
});

it('a native flush failure releases a stalled peer', async () => {
  const fixture = createFixture();
  const pending = Promise.withResolvers<number>();
  const started = Promise.withResolvers<undefined>();
  fixture.stdout.write.mockImplementation(() => {
    started.resolve(undefined);
    return pending.promise;
  });
  const fault = new Error('stderr flush failed');
  fixture.stderr.flush.mockImplementation(() => {
    throw fault;
  });
  const first = fixture.output.stdout(Uint8Array.of(1)).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  await started.promise;
  expect(
    await fixture.output.stderr(Uint8Array.of(2)).then(
      () => undefined,
      (cause: unknown) => cause,
    ),
  ).toBe(fault);
  expect(await first).toBe(fault);
  pending.resolve(1);
});

it('records a sink factory failure and releases another channel', async () => {
  const fixture = createFixture();
  const pending = Promise.withResolvers<number>();
  const started = Promise.withResolvers<undefined>();
  fixture.stdout.write.mockImplementation(() => {
    started.resolve(undefined);
    return pending.promise;
  });
  const fault = new Error('stderr factory failed');
  fixture.openStderr.mockImplementation(() => {
    throw fault;
  });
  const first = fixture.output.stdout(Uint8Array.of(1)).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  await started.promise;
  expect(
    await fixture.output.stderr(Uint8Array.of(2)).then(
      () => undefined,
      (cause: unknown) => cause,
    ),
  ).toBe(fault);
  expect(await first).toBe(fault);
  pending.resolve(1);
});

it('converts cancellation release failure to an explicit failed outcome', async () => {
  const fixture = createFixture();
  const pending = Promise.withResolvers<number>();
  const started = Promise.withResolvers<undefined>();
  fixture.stdout.write.mockImplementation(() => {
    started.resolve(undefined);
    return pending.promise;
  });
  const fault = new Error('cannot unref stdout');
  fixture.stdout.unref.mockImplementation(() => {
    throw fault;
  });
  const first = fixture.output.stdout(Uint8Array.of(1)).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  await started.promise;
  for (const listener of fixture.listeners) listener('SIGINT');
  const failure = await first;
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) throw new Error('release failure became cancellation');
  const release: unknown = failure.errors[0];
  expect(release).toBeInstanceOf(AggregateError);
  if (!(release instanceof AggregateError)) throw new Error('native release failure was lost');
  expect(release.errors).toContain(fault);
  fixture.output.dispose();
  expect(fixture.stdout.unref).toHaveBeenCalledTimes(1);
  pending.resolve(1);
});

it('returns diagnostic write failure as abandonment and remembers it', async () => {
  const fixture = createFixture();
  const fault = new Error('diagnostic EPIPE');
  fixture.stderr.write.mockImplementation(() => {
    throw fault;
  });
  expect(await fixture.output.reportDiagnostic(Uint8Array.of(1))).toEqual({
    kind: 'abandoned',
    cause: fault,
  });
  expect(
    await fixture.output.stderr(Uint8Array.of(2)).then(
      () => undefined,
      (cause: unknown) => cause,
    ),
  ).toBe(fault);
  expect(fixture.stderr.flush).not.toHaveBeenCalled();
});

it('refuses a diagnostic after disposal without opening a sink', async () => {
  const fixture = createFixture();
  fixture.output.dispose();
  expect((await fixture.output.reportDiagnostic(Uint8Array.of(1))).kind).toBe('abandoned');
  expect(fixture.openStderr).not.toHaveBeenCalled();
});

it('permits exactly one terminal diagnostic even after successful reporting', async () => {
  const fixture = createFixture();
  expect(await fixture.output.reportDiagnostic(Uint8Array.of(1))).toEqual({ kind: 'reported' });
  expect((await fixture.output.reportDiagnostic(Uint8Array.of(2))).kind).toBe('abandoned');
  expect(fixture.stderr.write).toHaveBeenCalledTimes(1);
});

it('reports a diagnostic only after its native flush settles', async () => {
  const fixture = createFixture();
  const pending = Promise.withResolvers<number>();
  const started = Promise.withResolvers<undefined>();
  fixture.stderr.flush.mockImplementation(() => {
    started.resolve(undefined);
    return pending.promise;
  });
  let hasSettled = false;
  const diagnostic = fixture.output.reportDiagnostic(Uint8Array.of(1)).then((outcome) => {
    hasSettled = true;
    return outcome;
  });
  await started.promise;
  await Bun.sleep(0);
  expect(hasSettled).toBe(false);
  pending.resolve(0);
  expect(await diagnostic).toEqual({ kind: 'reported' });
});
