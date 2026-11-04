import { expect, test } from 'bun:test';

import { observeRegistryBackupDeadline } from './registry-backup-deadline-observation.fixture';
import { observeRegistryBackupProcess } from './registry-backup-process-observation.fixture';
test('exact fixture reader reports rejecting input only and preserves production refusal', async () => {
  for (const sample of [
    { fault: 'none', at: 99, reads: 26 },
    { fault: 'state', at: 2, reads: 12 },
    { fault: 'uid', at: 4, reads: 20 },
    { fault: 'gid', at: 1, reads: 6 },
    { fault: 'unknown-state', at: 1, reads: 6 },
    { fault: 'io', at: 1, reads: 6 },
    { fault: 'logger', at: 1, reads: 6 },
  ] as const) {
    const proof = await observeRegistryBackupProcess({
      family: 'process-read',
      fault: sample.fault,
      at: sample.at,
    });
    if (proof.family !== 'process-read')
      throw new Error('Missing exact process reader observation');
    if (sample.fault === 'none') {
      expect(proof.value).toEqual({
        pid: 123,
        startTicks: '456',
        parent: 100,
        group: 123,
        command: '/fixed/PRIVATE_ARGV_TOKEN\0',
      });
      expect(proof.output).toEqual([]);
    } else {
      if (sample.fault === 'logger') {
        expect(proof.isAggregateError).toBe(true);
        expect(proof.hasOriginalAndLogger).toBe(true);
      } else expect(proof.isOriginalFailure).toBe(true);
      expect(proof.isError).toBe(true);
      if (['io', 'logger'].includes(sample.fault)) expect(proof.output).toEqual([]);
      else
        expect(proof.output.map((line): unknown => JSON.parse(line))).toEqual([
          {
            backupProcessObservation: {
              role: 'candidate-child',
              uidRoot: sample.fault !== 'uid',
              gidRoot: sample.fault !== 'gid',
              live: !['state', 'unknown-state'].includes(sample.fault),
              state:
                sample.fault === 'state' ? 'Z' : sample.fault === 'unknown-state' ? 'other' : 'S',
            },
          },
        ]);
    }
    expect(proof.paths.length).toBe(sample.reads);
    expect(
      proof.fileReads.every(
        ({ path, encoding }) =>
          encoding === 'utf8' && !['/proc/self', '/proc/self/ns/pid'].includes(path),
      ),
    ).toBe(true);
    expect(proof.linkReads).toEqual(
      Array.from({ length: sample.fault === 'none' ? 4 : sample.at === 4 ? 3 : sample.at }, () => [
        '/proc/self/ns/pid',
        '/proc/self',
      ]).flat(),
    );
    expect(proof.output.join('\n')).not.toContain('PRIVATE');
    expect(proof.paths.filter((path) => path === '/proc/self').length).toBe(
      sample.fault === 'none' ? 4 : sample.at === 4 ? 3 : sample.at,
    );
  }
});
for (const fault of ['identity-gap', 'stat-gap'] as const) {
  test('whole-module process snapshot refuses ' + fault, async () => {
    const proof = await observeRegistryBackupProcess({ family: 'process-read', fault, at: 3 });
    expect(proof).toMatchObject({
      state: 'rejected',
      isError: true,
      value: null,
      message: 'Owned backup changed during process observation',
      output: [],
    });
    expect(proof.paths).toHaveLength(26);
  });
}
test('whole-module process reader preserves a forged non-Error refusal without diagnostics', async () => {
  const proof = await observeRegistryBackupProcess({
    family: 'process-read',
    fault: 'non-error-io',
    at: 1,
  });
  expect(proof).toMatchObject({
    state: 'rejected',
    isError: false,
    isOriginalFailure: true,
    value: null,
    message: null,
    output: [],
  });
  expect(proof.paths).toHaveLength(6);
});
for (const role of ['selected-guardian', 'pre-kill-guardian'] as const)
  test(`actual interruption routes ${role} through exact input observation`, async () => {
    const observed = await observeRegistryBackupDeadline({ family: 'role', role });
    expect(observed.state).toBe('rejected');
    expect(observed.message).toBe('Guardian is not a live current root process');
    expect(observed.isExactGuardianFailure).toBe(true);
    expect(observed.roles).toEqual([role]);
    expect(observed.selectedGuardianReads).toBeGreaterThan(0);
    expect(observed.kills).toEqual([]);
    expect(observed.signals).toEqual(role === 'selected-guardian' ? [] : [[30, 'SIGSTOP']]);
    expect(observed.writes).toHaveLength(role === 'selected-guardian' ? 0 : 1);
    expect(observed.descriptorReads).toBe(role === 'selected-guardian' ? 0 : 1);
    expect(observed.ffiOpens).toBe(0);
  });
