import { lstat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import { requireRejection } from './registry-rejection.fixture';

for (const [name, primary] of [
  ['error', new Error('owned operation')],
  ['aggregate', new AggregateError([new Error('owned member')], 'owned operation aggregate')],
  ['undefined', undefined],
  ['null', null],
  ['string', 'owned operation'],
] as const) {
  test('fixture completion retains an exact sole operation rejection: ' + name, async () => {
    const trace: string[] = [];
    const pending = completeRegistryFixture(
      () =>
        invokeRegistryCallback(() => {
          trace.push('operation');
          // Test boundary: primitive/nullish throws exercise exact rejection preservation.
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw primary;
        }),
      [
        () =>
          invokeRegistryCallback(() => {
            trace.push('close');
          }),
      ],
    );
    expect((await requireRejection(pending)).cause).toBe(primary);
    expect(trace).toEqual(['operation', 'close']);
  });
}

for (const [name, value] of [
  ['undefined', undefined],
  ['object', { owned: true }],
  ['error-value', new Error('owned fulfilled error')],
] as const) {
  test('fixture completion retains exact fulfillment after awaited cleanup: ' + name, async () => {
    const trace: string[] = [];
    const pending = completeRegistryFixture(
      () =>
        invokeRegistryCallback(() => {
          trace.push('operation');
          return value;
        }),
      [
        async () => {
          await Bun.sleep(5);
          trace.push('close');
        },
      ],
    );
    expect(await pending).toBe(value);
    expect(trace).toEqual(['operation', 'close']);
  });
}

for (const fault of ['first', 'second', 'both', 'operation+first', 'operation+both'] as const) {
  test(
    'fixture completion observes every real-file cleanup and ordered failure: ' + fault,
    async () => {
      const directory = await scratchAsync('registry-fixture-completion-');
      const first = join(directory, 'first');
      const second = join(directory, 'second');
      await writeFile(first, 'owned first', { flag: 'wx', mode: 0o600 });
      await writeFile(second, 'owned second', { flag: 'wx', mode: 0o600 });
      const primary = new Error('owned operation');
      const firstFailure = new Error('owned first cleanup');
      const secondFailure = new Error('owned second cleanup');
      const trace: string[] = [];
      const operationFailed = fault.startsWith('operation+');
      const firstFailed = fault !== 'second';
      const secondFailed = fault === 'second' || fault.endsWith('both');
      const pending = completeRegistryFixture(
        () =>
          invokeRegistryCallback(() => {
            trace.push('operation');
            if (operationFailed) throw primary;
            return 'owned';
          }),
        [
          async () => {
            await unlink(first);
            trace.push('first');
            if (firstFailed) throw firstFailure;
          },
          async () => {
            await unlink(second);
            trace.push('second');
            if (secondFailed) throw secondFailure;
          },
        ],
      );
      const expected = [
        ...(operationFailed ? [primary] : []),
        ...(firstFailed ? [firstFailure] : []),
        ...(secondFailed ? [secondFailure] : []),
      ];
      const refused = await requireRejection(pending);
      if (expected.length === 1) expect(refused.cause).toBe(expected[0]);
      else {
        expect(refused.cause).toBeInstanceOf(AggregateError);
        // Test boundary: the preceding instance assertion fixes the observed aggregate shape.
        const compound = refused.cause as AggregateError;
        expect(compound.errors).toEqual(expected);
        expect(compound.cause).toBe(expected[0]);
      }
      expect(trace).toEqual(['operation', 'first', 'second']);
      expect((await requireRejection(lstat(first))).cause).toMatchObject({ code: 'ENOENT' });
      expect((await requireRejection(lstat(second))).cause).toMatchObject({ code: 'ENOENT' });
    },
  );
}
