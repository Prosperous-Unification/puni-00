import { expect, test } from 'bun:test';

import { observeRegistryBackupFixture } from './registry-backup-observation.fixture';

async function fixture(
  fault:
    'normal' | 'operation-fails' | 'bad-pid' | 'bad-exit' | 'bad-signal' | 'write-fails' = 'normal',
) {
  const observed = await observeRegistryBackupFixture({ family: 'terminal-observer', fault });
  if (observed.family !== 'terminal-observer') throw new Error('Missing owned terminal observer');
  return observed;
}

test('fixed restic observer forwards unchanged and waits for actual terminal receipt', async () => {
  const proof = await fixture();
  expect(proof.hasSettledBeforeRelease).toBe(false);
  expect(proof.recordsBeforeRelease).toEqual([]);
  expect(proof).toMatchObject({ state: 'fulfilled', value: 'complete' });
  expect(proof.records).toEqual([
    { worker: proof.workerPid, pid: 123, exitCode: 130, signal: null },
  ]);
  expect(proof.hasForwardedCommand).toBe(true);
  expect(proof.hasForwardedOptions).toBe(true);
  expect(proof.hasPreservedReturnedChild).toBe(true);
  expect(proof.hasRestoredSpawn).toBe(true);
});
test('fixed restic observer preserves original failure after terminal observation', async () => {
  const proof = await fixture('operation-fails');
  expect(proof.isOriginalFailure).toBe(true);
  expect(proof.hasPreservedReturnedChild).toBe(true);
  expect(proof.records).toHaveLength(1);
  expect(proof.hasRestoredSpawn).toBe(true);
});
for (const mode of ['bad-pid', 'bad-exit', 'bad-signal', 'write-fails'] as const)
  test('fixed restic observer refuses ' + mode, async () => {
    const proof = await fixture(mode);
    expect(proof).toMatchObject({ state: 'rejected', isError: true });
    if (mode !== 'bad-pid') expect(proof.hasPreservedReturnedChild).toBe(true);
    if (mode === 'write-fails') expect(proof.hasOriginalMember).toBe(true);
    expect(proof.records).toEqual([]);
    expect(proof.hasRestoredSpawn).toBe(true);
  });
