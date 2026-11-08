import { expect, test } from 'bun:test';

import { observeRegistryContender } from './registry-contender-observation.fixture';

test('actual offline contender retains journal admission without absent ordinary supervisor', async () => {
  const proof = await observeRegistryContender({ family: 'acquire', fault: 'absent' });
  expect(proof.hasSetupFailure).toBe(true);
  expect(proof.state).toBe('fulfilled');
  expect(proof.measurements).toBeGreaterThan(0);
  expect(proof.permissions).toBe(0);
  expect(proof.output).toEqual(['backup-authority-acquired-after-group-absence']);
  expect(proof.probes).toEqual([[-123, 0]]);
});
test('actual failed invoke emits bounded existing diagnostic and preserves reporter failure', async () => {
  for (const fault of ['stage', 'reporter-once'] as const) {
    const proof = await observeRegistryContender({ family: 'invoke', fault });
    expect(proof.state).toBe('rejected');
    if (fault === 'reporter-once') {
      expect(proof.isAggregateError).toBe(true);
      expect(proof.hasStageFirst).toBe(true);
      expect(proof.memberCount).toBe(2);
      expect(proof.hasReporterSecond).toBe(true);
      expect(proof.hasReporterCause).toBe(true);
    } else {
      expect(proof.message).toBe('Backup interruption owner stage failed');
      const records = proof.output.map((line): unknown => JSON.parse(line));
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({
        backupOwnerFailure: { command: 'initialize', observed: { unexpectedLines: true } },
      });
      expect(records[1]).toMatchObject({
        backupInterruptionFailure: { mode: 'owner-eof', stage: 'setup', category: 'unknown' },
      });
      expect(proof.output.join('')).not.toContain('PRIVATE');
    }
    expect(proof.commands).toEqual(['initialize']);
  }
});
test('outer backup diagnostic preserves original compound refusal when reporter also fails', async () => {
  const proof = await observeRegistryContender({ family: 'invoke', fault: 'reporter-always' });
  expect(proof.state).toBe('rejected');
  expect(proof.isAggregateError).toBe(true);
  expect(proof.hasNestedStageFirst).toBe(true);
  expect(proof.memberCount).toBe(2);
  expect(proof.nestedMemberCount).toBe(2);
  expect(proof.hasNestedReporterSecond).toBe(true);
  expect(proof.hasNestedReporterCause).toBe(true);
  expect(proof.hasReporterSecond).toBe(true);
  expect(proof.hasReporterCause).toBe(true);
  expect(proof.output).toEqual([]);
});
for (const fault of ['live', 'denied', 'unknown', 'opaque'] as const)
  test('actual offline contender refuses group ' + fault, async () => {
    const proof = await observeRegistryContender({ family: 'acquire', fault });
    expect(proof.state).toBe('rejected');
    if (fault === 'unknown' || fault === 'opaque') expect(proof.isOriginalFailure).toBe(true);
    else expect(proof.message).toBe('Authority acquired with owned backup group remaining');
    expect(proof.output).toEqual([]);
    expect(proof.permissions).toBe(0);
    expect(proof.probes).toEqual([[-123, 0]]);
  });
