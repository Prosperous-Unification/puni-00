import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { observeRegistryBackupDeadline } from './registry-backup-deadline-observation.fixture';

for (const fault of [
  'none',
  'normal',
  'guardian',
  'worker',
  'worker-read',
  'restic',
  'owner',
  'descriptor',
  'state',
  'late-interrupt',
  'not-aborted',
  'other',
  'schema',
  'pre-failure',
  'root-deadline',
  'not-owner',
  'duplicate',
  'malformed',
  'oversize',
  'missing-post',
  'reap',
  'owner-live',
  'reporter',
  'caller-uid',
  'caller-pid',
] as const)
  test('actual deadline rescue ' + fault, async () => {
    const observed = await observeRegistryBackupDeadline({ family: 'deadline', fault });
    if (fault === 'caller-uid' || fault === 'caller-pid') {
      expect(observed.state).toBe('rejected');
      expect(observed.message).toBe('Backup interruption requires private root PID1');
      expect(observed.paths).toEqual([]);
      expect(observed.signals).toEqual([]);
      expect(observed.writes).toEqual([]);
      return;
    }
    expect(observed.ffiOpens).toBe(observed.ffiCloses);
    if (fault === 'normal') {
      expect(observed.state).toBe('fulfilled');
      expect(observed.kills).toEqual([]);
      expect(observed.reaped).toBe(true);
      expect(observed.value).toMatchObject({
        pid: 20,
        parent: 10,
        startTicks: '20',
        resticPid: 30,
        attemptId: 'owned',
        mode: 'deadline',
      });
      expect(observed.signals).toEqual([
        [30, 'SIGSTOP'],
        [-20, 0],
      ]);
      return;
    }
    expect(observed.state).toBe('rejected');
    if (fault === 'none') {
      expect(observed.message).toBe('Root maintenance deadline did not interrupt owned backup');
      expect(observed.isAggregateError).toBe(false);
      expect(observed.kills).toEqual(['SIGTERM']);
      expect(observed.reaped).toBe(true);
      expect(observed.ownerReads).toBeGreaterThanOrEqual(3);
      expect(observed.descriptorReads).toBe(2);
      const receipts = observed.output.map(
        (line) =>
          type({ backupDeadlineRescue: { stage: 'string' } }).assert(JSON.parse(line))
            .backupDeadlineRescue,
      );
      expect(receipts.map((receipt) => receipt.stage)).toEqual(['before-rescue', 'after-rescue']);
      expect(receipts[0]).toMatchObject({
        pendingSIGINT: false,
        rootDeadlineObserved: false,
        ownedIdentitiesFresh: true,
        workerHeldCanonicalDescriptor: true,
      });
      expect(receipts[1]).toMatchObject({
        ownerTerminal: true,
        exactGroupAbsent: true,
        rootDeadline: false,
        ownerCancellation: true,
      });
      expect(observed.clock).toBeGreaterThanOrEqual(130000);
      expect(observed.signals).toEqual([
        [30, 'SIGSTOP'],
        [-20, 0],
      ]);
    } else {
      expect(observed.isAggregateError).toBe(true);
      expect(observed.hasMissingFirst).toBe(true);
      expect(
        observed.output.some(
          (line) =>
            type({ backupDeadlineRescue: { stage: 'string' } }).assert(JSON.parse(line))
              .backupDeadlineRescue.stage === 'after-rescue',
        ),
      ).toBe(false);
      if (fault === 'missing-post' || fault === 'owner-live')
        expect(observed.memberMessages[1]).toBe(
          'Deadline rescue owner or failure evidence did not terminate',
        );
      if (['owner', 'descriptor', 'reap', 'reporter', 'worker-read'].includes(fault))
        expect(observed.hasInjectedMember).toBe(true);
    }
    expect(observed.output.join('')).not.toContain('PRIVATE');
  });
