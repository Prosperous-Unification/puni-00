import { expect, test } from 'bun:test';

import { observeRegistryUnsafe } from './registry-unsafe-observation.fixture';

for (const fault of [
  'normal',
  'spawn',
  'exit',
  'invalid-pid',
  'duplicate',
  'argv',
  'admission',
  'root',
  'action',
  'topology',
  'no-child',
  'unterminated',
  'reporter',
] as const)
  test('unsafe GC exact actual dispatch boundary ' + fault, async () => {
    const proof = await observeRegistryUnsafe({ fault });
    if (fault === 'normal') {
      expect(proof.value).toBe('verified');
      expect(proof.commands).toEqual([
        [
          ['/pinned/registry', 'garbage-collect', '--delete-untagged', '/pinned/deletion.json'],
          { uid: 59001, gid: 59001, stdio: ['ignore', 'pipe', 'pipe', 3] },
        ],
      ]);
      expect(proof.records).toEqual([{ unsafeGc: { started: true, pid: 123, exitCode: 0 } }]);
      expect(proof.hasForwardedOptions).toBe(true);
      expect(proof.hasReturnedChild).toBe(true);
    } else {
      expect(proof.state).toBe('rejected');
      if (fault === 'unterminated') expect(proof.settlementBeforeRelease).toBe('rejected');
      if (fault === 'no-child') {
        expect(proof.message).toBe('Unsafe GC did not complete successfully');
        expect(proof.records).toEqual([
          { unsafeGc: { started: false, pid: null, exitCode: null } },
        ]);
      }
      if (fault === 'reporter') {
        expect(proof.isAggregateError).toBe(true);
        expect(proof.hasOriginalFirst).toBe(true);
        expect(proof.hasReporterSecond).toBe(true);
        expect(proof.hasReporterCause).toBe(true);
        expect(proof.memberCount).toBe(2);
      }
      if (fault === 'admission') expect(proof.commands).toHaveLength(0);
      if (fault === 'spawn')
        expect(proof.records).toEqual([
          { unsafeGc: { started: false, pid: null, exitCode: null } },
        ]);
    }
    if (['exit', 'duplicate', 'unterminated'].includes(fault))
      expect(proof.hasReturnedChild).toBe(true);
    expect(proof.hasRestoredSpawn).toBe(true);
    expect(proof.hasForwardedInput).toBe(!['root', 'action', 'topology'].includes(fault));
  });
for (const fault of ['null-admission', 'undefined-admission', 'opaque-admission'] as const)
  test('unsafe GC preserves ' + fault, async () => {
    const proof = await observeRegistryUnsafe({ fault });
    expect(proof.state).toBe('rejected');
    expect(proof.isOriginalFailure).toBe(true);
    expect(proof.records).toEqual([{ unsafeGc: { started: false, pid: null, exitCode: null } }]);
    expect(proof.hasRestoredSpawn).toBe(true);
  });
test('unsafe GC preserves sole reporter refusal after completed child', async () => {
  const proof = await observeRegistryUnsafe({ fault: 'reporter-only' });
  expect(proof.state).toBe('rejected');
  expect(proof.isReporterFailure).toBe(true);
  expect(proof.isAggregateError).toBe(false);
  expect(proof.hasRestoredSpawn).toBe(true);
});
