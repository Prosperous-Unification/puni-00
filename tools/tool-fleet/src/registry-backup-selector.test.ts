import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import { observeRegistryBackupProcess } from './registry-backup-process-observation.fixture';

for (const fault of [
  'none',
  'missing-once',
  'uid',
  'zombie',
  'start',
  'parent',
  'group',
  'changed-command',
  'access',
  'oversize',
] as const)
  test(`actual backup selector ${fault}`, async () => {
    const proof = await observeRegistryBackupProcess({ family: 'selector', fault });
    if (proof.family !== 'selector') throw new Error('Missing exact backup selector observation');
    if (fault === 'none' || fault === 'missing-once') {
      expect(proof.value?.restic.pid).toBe(203);
      expect(proof.value?.lockId).toBe(
        createHash('sha256').update(Buffer.from('modeled ciphertext')).digest('hex'),
      );
      expect(proof.paths).not.toContain('/proc/201/stat');
      expect(proof.paths).not.toContain('/proc/202/stat');
      expect(proof.selectedCommands).toBe(fault === 'missing-once' ? 3 : 2);
    } else if (fault === 'access') expect(proof.isOriginalFailure).toBe(true);
    else if (fault === 'oversize')
      expect(proof).toMatchObject({
        state: 'rejected',
        isError: true,
        message: 'Backup candidate command exceeds bound',
      });
    else if (fault === 'uid' || fault === 'zombie')
      expect(proof).toMatchObject({
        state: 'rejected',
        isError: true,
        message: 'Guardian is not a live current root process',
      });
    else if (fault === 'start')
      expect(proof).toMatchObject({
        state: 'rejected',
        isError: true,
        message: 'Root guardian identity changed during fresh observation',
      });
    else
      expect(proof).toMatchObject({
        state: 'rejected',
        isError: true,
        message: 'Exact owned backup process identity changed',
      });
  });
