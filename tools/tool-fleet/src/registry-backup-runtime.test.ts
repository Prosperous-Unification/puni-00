import { afterEach, expect, spyOn, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import * as host from './registry-maintenance-host';
import { createRegistryMaintenanceRuntime } from './registry-maintenance-runtime';
import { requireRejection } from './registry-rejection.fixture';
let connected: ReturnType<typeof spyOn<typeof host, 'connectRegistryMaintenanceHost'>> | undefined;
afterEach(
  /** Preserve the observed hook return: Bun1.4.4 mockRestore returns the spy while its declaration exposes only void. */
  () => connected?.mockRestore.call<unknown, [], unknown>(connected),
);
for (const stale of [false, true]) {
  test(`snapshot ${stale ? 'refuses the pre-attempt revision' : 'binds the durably prepared worker revision'}`, async () => {
    const source = {
      operationId: 'owned',
      registryId: 'registry',
      storageId: 'store',
      registryPath: '/registry',
      journalPath: '/journal',
      journalRevision: 7,
      maximumBytes: 1024,
      journalMaximumBytes: 1024,
      censusSha256: 'c'.repeat(64),
    };
    const receipt = {
      snapshotId: 'a'.repeat(64),
      registryId: source.registryId,
      storageId: source.storageId,
      registryPath: source.registryPath,
      journalPath: source.journalPath,
      journalRevision: stale ? 7 : 8,
      censusSha256: source.censusSha256,
      journalSha256: 'b'.repeat(64),
      bytes: 123,
      verifiedAt: new Date().toISOString(),
    };
    let state = {
      revision: 7,
      maintenanceEvidence: {
        backupCensusSha256: source.censusSha256,
        backupAttempts: [] as unknown[],
      },
    };
    connected = spyOn(host, 'connectRegistryMaintenanceHost').mockImplementation(() =>
      invokeRegistryCallback(() => {
        state = {
          revision: 9,
          maintenanceEvidence: {
            backupCensusSha256: source.censusSha256,
            backupAttempts: [
              {
                action: 'backup-snapshot',
                operationId: 'owned',
                state: 'settled',
                journalRevision: 8,
              },
            ],
          },
        };
        return {
          receipt: JSON.stringify(receipt),
          close: () => invokeRegistryCallback(() => undefined),
        };
      }),
    );
    const pending = createRegistryMaintenanceRuntime().backup.snapshot(source, {
      read: () => state,
    } as never);
    if (stale) expect((await requireRejection(pending)).throwCause).toThrow('canonical source');
    else expect(await pending).toEqual(receipt);
  });
}
