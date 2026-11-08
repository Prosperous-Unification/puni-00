import { expect, test } from 'bun:test';

import { assessCapacity, readCPUMilli, readMemoryMiB } from './observability-capacity';

const refuse = (reason: string): never => {
  throw new Error(reason);
};

test('fractional binary and decimal quantities retain preflight precision', () => {
  expect(readMemoryMiB('1.5Gi', refuse)).toBe(1536);
  expect(readMemoryMiB('1000K', refuse)).toBe(1000000 / 1048576);
  expect(readCPUMilli('500u', refuse)).toBe(0.5);
  expect(readCPUMilli('10n', refuse)).toBeCloseTo(0.00001, 10);
});

test('capacity fits exact contributions and exposes a one-unit deficit', () => {
  const charges = [{ identity: 'a', memoryMiB: 100, cpuMilli: 200, diskMiB: 300 }];
  expect(assessCapacity({ memoryMiB: 100, cpuMilli: 200, diskMiB: 300 }, charges)).toEqual({
    state: 'fits',
    required: { memoryMiB: 100, cpuMilli: 200, diskMiB: 300 },
    deficits: [],
  });
  expect(assessCapacity({ memoryMiB: 99, cpuMilli: 200, diskMiB: 300 }, charges)).toEqual({
    state: 'deficit',
    required: { memoryMiB: 100, cpuMilli: 200, diskMiB: 300 },
    deficits: [{ dimension: 'memoryMiB', required: 100, available: 99, missing: 1 }],
  });
});

for (const quantity of ['unknown', '-1Mi', '9'.repeat(400)])
  test(`capacity rejects malformed memory ${quantity.slice(0, 10)}`, () => {
    expect(() => readMemoryMiB(quantity, refuse)).toThrow('memory-unknown');
  });
for (const quantity of ['unknown', '-1', '9'.repeat(400)])
  test(`capacity rejects malformed CPU ${quantity.slice(0, 10)}`, () => {
    expect(() => readCPUMilli(quantity, refuse)).toThrow('cpu-unknown');
  });

test('capacity refuses nonfinite demand and duplicate charge identity', () => {
  const capacity = { memoryMiB: 100, cpuMilli: 100, diskMiB: 100 };
  const charge = { identity: 'a', memoryMiB: 1, cpuMilli: 1, diskMiB: 1 };
  expect(() => assessCapacity(capacity, [{ ...charge, memoryMiB: Infinity }])).toThrow();
  expect(() => assessCapacity(capacity, [charge, charge])).toThrow();
});

test('capacity refuses invalid availability, negative demand and summed overflow', () => {
  const capacity = { memoryMiB: 100, cpuMilli: 100, diskMiB: 100 };
  const charge = { identity: 'a', memoryMiB: 1, cpuMilli: 1, diskMiB: 1 };
  expect(() => assessCapacity({ ...capacity, diskMiB: NaN }, [charge])).toThrow(
    'invalid available',
  );
  expect(() => assessCapacity(capacity, [{ ...charge, cpuMilli: -1 }])).toThrow(
    'invalid contribution',
  );
  expect(() =>
    assessCapacity(capacity, [
      { ...charge, memoryMiB: Number.MAX_VALUE },
      { ...charge, identity: 'b', memoryMiB: Number.MAX_VALUE },
    ]),
  ).toThrow('sum overflow');
});
