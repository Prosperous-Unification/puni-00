import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { executeRegistryCommand as executeFoundationCommand } from './registry-journal';

const { executeRegistryCommand: executeManagedCommand } =
  await import('./registry-publication-facade');

const GiB = 1024 ** 3;
const ports = {
  now: () => '2026-11-08T00:00:00.000Z',
  measureJournal: () =>
    Promise.resolve({
      usableBytes: GiB,
      usedBytes: 1000,
      totalInodes: 10000,
      usedInodes: 10,
      allocationUnitBytes: 4096,
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
const initialize = {
  command: 'initialize',
  enrollment: {
    registryId: 'profiles',
    storageId: 'store',
    owners: ['owner'],
    registryPath: '/unused-registry',
    rootPath: '/',
    maximumBytes: 50 * GiB,
    journalMaximumBytes: GiB,
  },
};

test('foundation path initializes schema1 while the publication facade retains managed schema3', async () => {
  const foundationDirectory = await scratchAsync('registry-foundation-profile-');
  const managedDirectory = await scratchAsync('registry-managed-profile-');
  const foundation = await executeFoundationCommand(foundationDirectory, initialize, ports);
  const managed = await executeManagedCommand(managedDirectory, initialize, ports);
  expect(managed.state.schemaVersion).toBe(3);
  expect(foundation.state.schemaVersion).toBe(1);
});
