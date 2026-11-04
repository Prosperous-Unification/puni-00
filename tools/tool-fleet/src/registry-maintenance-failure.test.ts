import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { executeRegistryCommand, runRegistryMaintenance } from './registry-journal';
import { requireRejection } from './registry-rejection.fixture';

const GiB = 1024 ** 3;
const ports = {
  measureJournal: () =>
    Promise.resolve({
      usableBytes: GiB,
      allocationUnitBytes: 4096,
      usedBytes: 1000,
      totalInodes: 10000,
      usedInodes: 10,
    }),
  measureRegistry: () =>
    Promise.resolve({
      maximumBytes: 50 * GiB,
      usableBytes: 50 * GiB,
      usedBytes: GiB,
      totalInodes: 10000,
      usedInodes: 10,
      rootFreeBytes: 30 * GiB,
    }),
};
for (const fault of ['absent', 'unreadable', 'malformed', 'schema'] as const)
  for (const primary of [new Error('owned operation failed'), null, undefined])
    test(
      'actual maintenance preserves original failure when canonical reread is ' +
        fault +
        ': ' +
        String(primary),
      async () => {
        const directory = await scratchAsync('registry-maintenance-failure-');
        await chmod(directory, 0o700);
        await executeRegistryCommand(
          directory,
          {
            command: 'initialize',
            enrollment: {
              registryId: 'failure',
              storageId: 'owned',
              owners: ['operator'],
              registryPath: '/registry',
              rootPath: '/',
              maximumBytes: 50 * GiB,
              journalMaximumBytes: GiB,
            },
          },
          ports,
        );
        await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
        const journal = join(directory, 'journal.json');
        const refused = await requireRejection(
          runRegistryMaintenance(
            directory,
            { operationId: 'failure', owner: 'operator', kind: 'backup', recover: false },
            ports,
            async () => {
              const saved = await readFile(journal);
              await writeFile(join(directory, 'journal.preserved.json'), saved, { mode: 0o600 });
              if (fault === 'absent') await rename(journal, join(directory, 'journal.absent.json'));
              if (fault === 'unreadable') await chmod(journal, 0o000);
              if (fault === 'malformed') await writeFile(journal, '{');
              if (fault === 'schema')
                await writeFile(journal, JSON.stringify({ schemaVersion: 0 }));
              // Deliberately inject Error, null and undefined at the real owned callback boundary.
              // eslint-disable-next-line @typescript-eslint/only-throw-error
              throw primary;
            },
          ),
        );
        expect(refused.cause).toBeInstanceOf(AggregateError);
        if (!(refused.cause instanceof AggregateError))
          throw new Error('Lost original operation failure');
        expect(refused.cause.errors).toHaveLength(2);
        expect(refused.cause.errors[0]).toBe(primary);
        expect(refused.cause.errors[1]).toBeInstanceOf(Error);
        expect(refused.cause.cause).toBe(primary);
        // Preserved canonical bytes must still show fenced ownership, never a fabricated success.
        const saved = JSON.parse(
          await readFile(join(directory, 'journal.preserved.json'), 'utf8'),
        ) as { fenced: boolean; maintenance: { phase: string } };
        expect(saved.fenced).toBe(true);
        expect(saved.maintenance.phase).toBe('acquired');
        if (fault === 'unreadable') await chmod(journal, 0o600);
      },
    );
