import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import {
  createRegistryFixtureClock,
  withRegistryFixtureTime,
} from './registry-maintenance-clock.fixture';

const day = 24 * 60 * 60 * 1000;
test('fixture time advances with real elapsed time and restores the original function', async () => {
  const original = Date.now;
  const stamp = new Date(original() + 8 * day).toISOString();
  const completed = await withRegistryFixtureTime(stamp, async () => {
    const before = Date.now();
    expect(before - original()).toBeGreaterThan(7 * day);
    await Bun.sleep(10);
    expect(Date.now()).toBeGreaterThan(before);
    return original;
  });
  expect(completed).toBe(original);
  expect(Date.now).toBe(original);
});
test('fixture time restores even when the exact callback fails', async () => {
  const original = Date.now;
  const failure = new Error('owned failure');
  let observed: unknown;
  try {
    await withRegistryFixtureTime(new Date(original() + 8 * day).toISOString(), () => {
      expect(Date.now).not.toBe(original);
      return Promise.reject(failure);
    });
  } catch (cause) {
    observed = cause;
  }
  expect(observed).toBe(failure);
  expect(Date.now).toBe(original);
});
test('invalid or out-of-bound fixture offsets refuse before callback', async () => {
  for (const stamp of [
    'invalid',
    new Date(Date.now()).toISOString(),
    new Date(Date.now() + 10 * day).toISOString(),
  ]) {
    let called = false;
    let observed: unknown;
    try {
      await withRegistryFixtureTime(stamp, () => {
        called = true;
        return Promise.resolve();
      });
    } catch (cause) {
      observed = cause;
    }
    expect(observed).toBeInstanceOf(Error);
    expect(called).toBe(false);
  }
});

test('synthetic authority clock leaves actual Date.now unchanged and advances independently', async () => {
  const original = Date.now;
  const clock = createRegistryFixtureClock(new Date(original() + 8 * day).toISOString());
  const before = Date.parse(clock());
  expect(before - original()).toBeGreaterThan(7 * day);
  expect(Date.now).toBe(original);
  await Bun.sleep(10);
  expect(Date.parse(clock())).toBeGreaterThan(before);
});

for (const operationFails of [false, true]) {
  test(`fixture time preserves ${operationFails ? 'operation and restoration failures' : 'the restoration failure after success'}`, async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Date, 'now');
    if (descriptor === undefined) throw new Error('Missing original clock descriptor');
    const original = Date.now;
    const operationFailure = new Error('owned callback failure');
    const restorationFailure = new Error('owned restoration failure');
    let observed: unknown;
    try {
      try {
        await withRegistryFixtureTime(new Date(original() + 8 * day).toISOString(), () => {
          const shifted = Date.now;
          Object.defineProperty(Date, 'now', {
            configurable: true,
            get: () => shifted,
            set: () => {
              throw restorationFailure;
            },
          });
          if (operationFails) return Promise.reject(operationFailure);
          return Promise.resolve('complete');
        });
      } catch (cause) {
        observed = cause;
      }
    } finally {
      Object.defineProperty(Date, 'now', descriptor);
    }
    expect(Date.now).toBe(original);
    if (operationFails) {
      expect(observed).toBeInstanceOf(AggregateError);
      if (!(observed instanceof AggregateError)) throw new Error('Missing compound failure');
      expect(observed.cause).toBe(operationFailure);
      expect(observed.errors).toEqual([operationFailure, restorationFailure]);
    } else expect(observed).toBe(restorationFailure);
  });
}

async function readUploadCompletion() {
  const source = await readFile(
    new URL('./registry-maintenance-clock.fixture.ts', import.meta.url),
    'utf8',
  );
  const owner = source.indexOf('export async function proveRegistryUploadGrace(');
  const start = source.indexOf('  const original = Date.now;', owner);
  const end = source.lastIndexOf('\n}');
  if (owner < 0 || start < owner || end < start)
    throw new Error('Missing actual upload completion tail');
  const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    'async function runCompletion() {\n' + source.slice(start, end) + '\n}',
  );
  // Boundary: actual completion tail; privilege/namespace/census preflight is excluded, and clock, action and file effects are modeled.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(
    'Date',
    'withRegistryFixtureTime',
    'executeRegistryHostAction',
    'appendFile',
    'input',
    'stamp',
    body + '\nreturn runCompletion();',
  ) as (
    clock: { now: () => number },
    withTime: (stamp: string, run: () => Promise<string>) => Promise<string>,
    action: (input: unknown) => Promise<string>,
    append: (path: string, contents: string, options: { mode: number }) => Promise<void>,
    input: unknown,
    stamp: string,
  ) => Promise<string>;
}

for (const operationFails of [false, true])
  for (const clockRestored of [true, false])
    for (const reportFails of [false, true])
      test(`upload grace completion preserves operation=${String(operationFails)} clock=${String(clockRestored)} report=${String(reportFails)}`, async () => {
        const invoke = await readUploadCompletion();
        const clock = { now: () => 0 };
        const request = Symbol('exact modeled upload action');
        const operationFailure = new Error('owned upload failure');
        const reportFailure = new Error('owned report failure');
        const calls: string[] = [];
        const frames: string[] = [];
        const completion = await invoke(
          clock,
          (stamp, run) => {
            expect(stamp).toBe('fixture-stamp');
            calls.push('with-time');
            if (!clockRestored) clock.now = () => 1;
            return run();
          },
          (input) => {
            expect(input).toBe(request);
            calls.push('action');
            return operationFails ? Promise.reject(operationFailure) : Promise.resolve('discarded');
          },
          (path, contents, options) => {
            expect(path).toBe('/root/task8-fixture/upload-grace-proof.log');
            expect(options).toEqual({ mode: 0o600 });
            calls.push('report');
            frames.push(contents);
            return reportFails ? Promise.reject(reportFailure) : Promise.resolve();
          },
          request,
          'fixture-stamp',
        ).then(
          (value) => ({ kind: 'complete' as const, value }),
          (failure: unknown) => ({ kind: 'failed' as const, failure }),
        );
        expect(calls).toEqual(['with-time', 'action', 'report']);
        expect(frames).toEqual([JSON.stringify({ realClockRestored: clockRestored }) + '\n']);
        const expected: (Error | 'clock')[] = [
          ...(operationFails ? [operationFailure] : []),
          ...(!clockRestored ? ['clock' as const] : []),
          ...(reportFails ? [reportFailure] : []),
        ];
        if (expected.length === 0) {
          expect(completion).toEqual({ kind: 'complete', value: 'discarded' });
          return;
        }
        expect(completion.kind).toBe('failed');
        if (completion.kind !== 'failed') throw new Error('Required upload failure was lost');
        const failure = completion.failure;
        let observed: unknown[];
        if (expected.length > 1) {
          expect(failure).toBeInstanceOf(AggregateError);
          if (!(failure instanceof AggregateError))
            throw new Error('Missing compound upload failure');
          observed = failure.errors;
          expect(failure.cause).toBe(observed.at(0));
        } else {
          expect(failure).not.toBeInstanceOf(AggregateError);
          observed = [failure];
        }
        expect(observed).toHaveLength(expected.length);
        for (const [index, expectedFailure] of expected.entries()) {
          const observedFailure = observed.at(index);
          if (expectedFailure === 'clock') {
            expect(observedFailure).toBeInstanceOf(Error);
            if (!(observedFailure instanceof Error)) throw new Error('Missing restoration failure');
            expect(observedFailure.message).toBe('Upload proof did not restore real clock');
          } else expect(observedFailure).toBe(expectedFailure);
        }
      });

for (const failure of [undefined, null, 'owned non-error report']) {
  test(
    'upload clock report rejects a non-error cause with context: ' + String(failure),
    async () => {
      const invoke = await readUploadCompletion();
      let reports = 0;
      const completion = await invoke(
        { now: () => 0 },
        (_stamp, run) => run(),
        () => Promise.resolve('discarded'),
        () => {
          reports++;
          // Fault: the modeled filesystem port violates its Error rejection convention.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject(failure);
        },
        Symbol('modeled action'),
        'fixture-stamp',
      ).then(
        (value) => ({ kind: 'complete' as const, value }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      );
      expect(reports).toBe(1);
      expect(completion.kind).toBe('failed');
      if (completion.kind !== 'failed') throw new Error('Non-error filesystem rejection was lost');
      expect(completion.cause).toBeInstanceOf(Error);
      if (!(completion.cause instanceof Error))
        throw new Error('Missing filesystem boundary error');
      expect(completion.cause.message).toBe('Upload clock report rejected a non-error value');
      expect(Object.hasOwn(completion.cause, 'cause')).toBe(true);
      expect(completion.cause.cause).toBe(failure);
    },
  );
}
