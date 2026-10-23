import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import {
  describeFixtureFailure,
  FixtureCommandFailure,
  FixtureFailure,
  type FixtureStage,
  requireFixtureRefusal,
  summarizeFixtureFailure,
  withFixtureStage,
} from './fixture-failure';
import { boundedCommand } from './solver-drain-transport';

// The external rejection boundary may carry non-Errors; this test deliberately preserves that runtime value.
const rejectUnknown = async (failure: unknown): Promise<never> => {
  await Promise.resolve();
  throw failure;
};

test('nested fixture failure retains closed source stage and known assertion category', () => {
  const failure = new Error('OUTER_PRIVATE_SENTINEL', {
    cause: new FixtureFailure(
      'fixture-tag-negative',
      new Error('source dev requires typed init, private PID, unprivileged and no added caps'),
    ),
  });
  const report = summarizeFixtureFailure(failure);
  expect(report.stage).toBe('fixture-tag-negative');
  expect(report.chain.some((entry) => entry.category === 'source-host-config')).toBe(true);
  expect(JSON.stringify(report)).not.toContain('OUTER_PRIVATE_SENTINEL');
});
test('nested command failure retains only closed operation class and numeric exit', () => {
  const failure = new FixtureFailure(
    'fixture-edge-attach',
    new Error('PRIVATE_COMMAND_WRAPPER', {
      cause: new FixtureCommandFailure(['docker', 'network', 'connect', 'PRIVATE_ARG'], 17),
    }),
  );
  const report = summarizeFixtureFailure(failure);
  expect(report.stage).toBe('fixture-edge-attach');
  expect(
    report.chain.some(
      (entry) =>
        entry.category === 'command-exit' &&
        entry.command === 'docker-network-connect' &&
        entry.status === 17,
    ),
  ).toBe(true);
  expect(JSON.stringify(report)).not.toContain('PRIVATE_');
});
test('unclassified executable and malformed command metadata never retain arbitrary fields', () => {
  const command = new FixtureCommandFailure(['PRIVATE_EXECUTABLE', 'PRIVATE_ARGUMENT'], 23);
  const unknown = summarizeFixtureFailure(command);
  expect(unknown.chain[0]?.category).toBe('unclassified-command');
  expect(unknown.chain[0]?.command).toBe('unclassified');
  expect(unknown.chain[0]?.status).toBe(23);
  Reflect.set(command, 'command', 'PRIVATE_FORGED_CLASS');
  Reflect.set(command, 'status', 'PRIVATE_FORGED_STATUS');
  const contents = describeFixtureFailure(command);
  expect(contents).toContain('unclassified-command');
  expect(contents).not.toContain('PRIVATE_');
});
test('unknown error name message enumerable properties and raw causes stay hash-only', () => {
  const failure = new Error('PRIVATE_ENV=secret', {
    cause: new SyntaxError('PRIVATE_JSON_PAYLOAD'),
  });
  failure.name = 'PRIVATE_ERROR_NAME';
  Reflect.set(failure, 'Config', { Env: ['PRIVATE_ENUMERABLE'] });
  Reflect.set(failure, 'toJSON', () => {
    throw new Error('error serialization must never execute');
  });
  const report = summarizeFixtureFailure(failure);
  expect(report.chain).toHaveLength(2);
  for (const entry of report.chain) expect(entry.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(report)).not.toContain('PRIVATE_');
});
test('cause cycle depth and oversized errors terminate with explicit bounded markers', () => {
  const cycle = new Error('cycle');
  Reflect.set(cycle, 'cause', cycle);
  expect(summarizeFixtureFailure(cycle).chain.some((entry) => entry.category === 'cycle')).toBe(
    true,
  );
  let deep: Error = new Error('last');
  for (let index = 0; index < 20; index++) deep = new Error('depth', { cause: deep });
  const depth = summarizeFixtureFailure(deep);
  expect(depth.chain.length).toBeLessThanOrEqual(9);
  expect(depth.chain.at(-1)?.category).toBe('depth-limit');
  const huge = summarizeFixtureFailure(new Error('PRIVATE_LONG'.repeat(10000)));
  expect(huge.chain.at(-1)?.category).toBe('size-limit');
  expect(JSON.stringify(huge).length).toBeLessThan(1500);
});
test('throwing error accessors and non-error payloads remain visibly unclassified', () => {
  const unreadable = new Error('hidden');
  Object.defineProperty(unreadable, 'cause', {
    get() {
      throw new Error('PRIVATE_ACCESSOR');
    },
  });
  expect(summarizeFixtureFailure(unreadable).chain.at(-1)?.category).toBe('unreadable-error');
  const report = summarizeFixtureFailure({ Config: { Env: ['PRIVATE_OBJECT'] } });
  expect(report.chain.at(-1)?.category).toBe('non-error');
  expect(JSON.stringify(report)).not.toContain('PRIVATE_OBJECT');
});
test('stage wrapper preserves known failures and never converts unknown failure to success', async () => {
  const original = new FixtureFailure('fixture-tag-negative', new Error('opaque'));
  await rejects(
    withFixtureStage('fixture-images', () => Promise.reject(original)),
    (failure: unknown) => failure === original,
  );
  await rejects(
    withFixtureStage('fixture-component-cleanup', () => rejectUnknown('PRIVATE_STRING')),
    (failure: unknown) => {
      const report = summarizeFixtureFailure(failure);
      expect(report.stage).toBe('fixture-component-cleanup');
      expect(JSON.stringify(report)).not.toContain('PRIVATE_STRING');
      return true;
    },
  );
});

test('diagnostic metadata is captured once before closed-value validation', () => {
  const staged = new FixtureFailure('fixture-tag-negative', new Error('known'));
  let stageReads = 0;
  Object.defineProperty(staged, 'stage', {
    get: () => (++stageReads === 1 ? 'fixture-tag-negative' : 'PRIVATE_STAGE_AFTER_CHECK'),
  });
  const command = new FixtureCommandFailure(['docker', 'network', 'connect'], 17);
  let commandReads = 0,
    statusReads = 0;
  Object.defineProperty(command, 'command', {
    get: () => (++commandReads === 1 ? 'docker-network-connect' : 'PRIVATE_COMMAND_AFTER_CHECK'),
  });
  Object.defineProperty(command, 'status', {
    get: () => (++statusReads === 1 ? 17 : 'PRIVATE_STATUS_AFTER_CHECK'),
  });
  const contents = JSON.stringify([
    summarizeFixtureFailure(staged),
    summarizeFixtureFailure(command),
  ]);
  expect(contents).not.toContain('PRIVATE_');
  expect(stageReads).toBe(1);
  expect(commandReads).toBe(1);
  expect(statusReads).toBe(1);
});

test('actual bounded command failure keeps closed stage exit attribution and discards stderr', async () => {
  await rejects(
    withFixtureStage('fixture-edge-attach', () =>
      boundedCommand(
        [process.execPath, '-e', "process.stderr.write('PRIVATE_STDERR_PAYLOAD');process.exit(17)"],
        2000,
      ),
    ),
    (failure: unknown) => {
      const report = summarizeFixtureFailure(failure);
      expect(report.stage).toBe('fixture-edge-attach');
      expect(
        report.chain.some(
          (entry) =>
            entry.category === 'command-exit' && entry.command === 'bun' && entry.status === 17,
        ),
      ).toBe(true);
      expect(JSON.stringify(report)).not.toContain('PRIVATE_STDERR_PAYLOAD');
      return true;
    },
  );
});

test('expected negative preserves known refusal and rejects unknown or missing failures', async () => {
  const known = await requireFixtureRefusal('fixture-tag-negative', 'source-tag-resolution', () =>
    Promise.reject(
      new Error(
        'managed cohort source dev mutable image tag resolution changed or was not excluded',
      ),
    ),
  );
  expect(known.chain[0]?.category).toBe('source-tag-resolution');
  const unexpected = new Error('PRIVATE_UNEXPECTED_CAUSE');
  await rejects(
    requireFixtureRefusal('fixture-tag-negative', 'source-tag-resolution', () =>
      Promise.reject(unexpected),
    ),
    (failure: unknown) => {
      expect(failure).toBeInstanceOf(FixtureFailure);
      if (!(failure instanceof Error)) return false;
      expect(failure.cause).toBe(unexpected);
      expect(JSON.stringify(summarizeFixtureFailure(failure))).not.toContain('PRIVATE_');
      return true;
    },
  );
  await rejects(
    requireFixtureRefusal('fixture-tag-negative', 'source-tag-resolution', () => Promise.resolve()),
    (failure: unknown) => {
      expect(
        summarizeFixtureFailure(failure).chain.some(
          (entry) => entry.category === 'missing-expected-refusal',
        ),
      ).toBe(true);
      return true;
    },
  );
  await rejects(
    requireFixtureRefusal('fixture-tag-negative', 'source-tag-resolution', () =>
      Promise.reject(
        new Error(
          'managed cohort source dev mutable image tag resolution changed or was not excluded PRIVATE_SUFFIX',
        ),
      ),
    ),
  );
});

test('invalid external diagnostic coordinates fail closed without retaining their values', async () => {
  // Controlled untyped JS boundary faults exercise runtime checks despite internal literal unions.
  expect(() => new FixtureFailure('PRIVATE_STAGE' as FixtureStage, new Error('opaque'))).toThrow(
    'fixture stage invalid',
  );
  expect(() =>
    summarizeFixtureFailure(new Error('opaque'), 'PRIVATE_FALLBACK' as FixtureStage),
  ).toThrow('fixture diagnostic fallback invalid');
  await rejects(
    requireFixtureRefusal('fixture-tag-negative', 'unclassified' as 'source-tag-resolution', () =>
      Promise.reject(new Error('opaque')),
    ),
    /expected refusal category invalid/,
  );
});
for (const status of [-1, 256, NaN])
  test(`command status ${String(status)} is outside the receipt grammar`, () => {
    expect(() => new FixtureCommandFailure(['docker', 'inspect'], status)).toThrow(
      'fixture command exit status invalid',
    );
  });
