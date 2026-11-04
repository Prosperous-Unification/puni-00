import { expect, test } from 'bun:test';

import { observeRegistryOwner } from './registry-owner-observation.fixture';

test('actual owner outcome boundary reports bounded rejected slots and preserves original errors', async () => {
  for (const sample of [
    { fault: 'monitor', slots: ['monitor'], formatterFails: false },
    { fault: 'all', slots: ['owner-exit', 'stdout', 'stderr', 'monitor'], formatterFails: false },
    { fault: 'formatter', slots: ['monitor'], formatterFails: true },
  ] as const) {
    const proof = await observeRegistryOwner({ fault: sample.fault });
    expect(proof.isAggregateError).toBe(true);
    expect(proof.failureSlots).toEqual([
      ...sample.slots,
      ...(sample.formatterFails ? ['formatter'] : []),
    ]);
    if (sample.formatterFails) {
      expect(proof.output).toEqual([]);
      continue;
    }
    expect(proof.output.map((line): unknown => JSON.parse(line))).toEqual(
      sample.slots.map((slot) => ({
        backupInterruptionOutcome: {
          mode: 'owner-eof',
          slot,
          category: 'access-denied',
          location: { kind: 'frame', frame: { file: 'fixture-bundle', line: 123, column: 45 } },
        },
      })),
    );
    expect(proof.output.join('\n')).not.toContain('PRIVATE_TOKEN');
    expect(proof.output.length).toBeLessThanOrEqual(4);
  }
});
for (const fault of ['delayed-exit', 'delayed-stdout', 'delayed-stderr'] as const)
  test('whole-module owner awaits ' + fault, async () => {
    const proof = await observeRegistryOwner({ fault });
    expect(proof.hasSettledBeforeRelease).toBe(false);
    expect(proof.hasObservedHeldCompletion).toBe(true);
    expect(proof.state).toBe('rejected');
    expect(proof.failureSlots).toEqual(['monitor']);
  });
test('whole-module owner preserves failed logger after original monitor', async () => {
  const proof = await observeRegistryOwner({ fault: 'logger' });
  expect(proof.state).toBe('rejected');
  expect(proof.failureSlots).toEqual(['monitor', 'logger']);
  expect(proof.output).toEqual([]);
});
test('whole-module owner preserves undefined monitor refusal as an aggregate member', async () => {
  const proof = await observeRegistryOwner({ fault: 'opaque-monitor' });
  expect(proof.state).toBe('rejected');
  expect(proof.failureSlots).toEqual(['monitor']);
  expect(proof.output.map((line): unknown => JSON.parse(line))).toEqual([
    {
      backupInterruptionOutcome: {
        mode: 'owner-eof',
        slot: 'monitor',
        category: 'unknown',
        location: { kind: 'absent' },
      },
    },
  ]);
});
test('whole-module owner returns complete unmonitored outcome and exact fixed launch', async () => {
  const proof = await observeRegistryOwner({ fault: 'no-fault' });
  expect(proof.state).toBe('fulfilled');
  expect(proof.value).toEqual({ code: 1, stdout: '', stderr: '', worker: null });
  expect(proof.output).toEqual([
    JSON.stringify({ ownerStage: 'backup-interruption', exitCode: 1 }),
  ]);
  expect(proof.reads).toEqual([]);
  expect(proof.spawnCommand).toEqual([
    '/usr/bin/setpriv',
    '--reuid=59001',
    '--regid=59001',
    '--clear-groups',
    '--',
    process.execPath,
    '/usr/local/libexec/puni-registry-maintenance/proof.js',
    'backup-interruption',
  ]);
  expect(proof.spawnOptions).toEqual({
    env: { PATH: '/usr/bin:/bin', LANG: 'C' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
});
