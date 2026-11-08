import * as fs from 'node:fs/promises';

import { afterEach, expect, spyOn, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { planRegistryClientPulls } from './registry-client-plan';
import { createRegistryClientPlanFixture } from './registry-client-plan.fixture';
import type { RegistryInventory } from './registry-inventory';
import * as host from './registry-maintenance-host';
import { createRegistryMaintenanceRuntime } from './registry-maintenance-runtime';
import { requireRejection } from './registry-rejection.fixture';

let connected: ReturnType<typeof spyOn<typeof host, 'connectRegistryMaintenanceHost'>> | undefined;
let measured: ReturnType<typeof spyOn<typeof fs, 'statfs'>> | undefined;
afterEach(() => {
  connected?.mockRestore();
  measured?.mockRestore();
});
async function fixture() {
  const physical = await createRegistryClientPlanFixture();
  await physical.image('kept');
  const plan = await planRegistryClientPulls(physical.journal, 4096, new AbortController().signal);
  const identity = {
    registryId: 'proof',
    storageId: 'proof',
    node: 'fixture',
    pvcUid: 'fixture',
    mountIdentity: 'fixture',
    distributionDigest: 'sha256:' + 'a'.repeat(64),
    binarySha256: 'b'.repeat(64),
  };
  // Boundary: consumer/API inventory is modeled here; metadata and each platform pull plan are read from the actual physical fixture.
  const inventory: RegistryInventory = {
    identity,
    journal: physical.journal,
    graph: { complete: true, nodes: [] },
    revisions: plan.revisions,
    tags: [],
    uploads: [],
    orphanBlobs: [],
    unreferencedContent: [],
    partialOperations: [],
    neverUploaded: [],
    protections: [],
    consumerReferences: [],
    binding: { ...plan.binding, obligationsSha256: 'a'.repeat(64), identity },
  };
  measured = spyOn(fs, 'statfs').mockImplementation((path, options) =>
    invokeRegistryCallback(() => {
      expect(path).toBe('/var/lib/puni-registry/pulls/contents');
      expect(options).toEqual({ bigint: true });
      return {
        bsize: 4096n,
        blocks: 10000n,
        bfree: 9000n,
        bavail: 9000n,
        files: 10000n,
        ffree: 9000n,
      } as never;
    }),
  );
  return { inventory, plan };
}
for (const recovery of [false, true])
  test(
    'runtime binds parent plan before fixed ' +
      (recovery ? 'recovery' : 'current') +
      ' client transport',
    async () => {
      const proof = await fixture();
      const authority = { read: () => proof.inventory.journal };
      let closed = 0;
      connected = spyOn(host, 'connectRegistryMaintenanceHost').mockImplementation(
        (received, action, plan) =>
          invokeRegistryCallback(() => {
            expect(Object.is(received, authority)).toBe(true);
            expect(action).toBe(recovery ? 'verify-recovery-images' : 'verify-images');
            expect(plan).toEqual(proof.plan);
            return {
              receipt: 'terminal completion',
              close: () =>
                invokeRegistryCallback(() => {
                  closed++;
                }),
            };
          }),
      );
      const runtime = createRegistryMaintenanceRuntime();
      await (recovery ? runtime.recovery : runtime).verifyImages(
        authority as never,
        proof.inventory,
      );
      expect(connected).toHaveBeenCalledTimes(1);
      expect(closed).toBe(1);
    },
  );
for (const fault of [
  'census',
  'repository',
  'scratch-counters',
  'scratch-unreadable',
  'transport',
] as const)
  test('client runtime refuses ' + fault + ' before restoring service', async () => {
    const proof = await fixture();
    if (fault === 'census')
      proof.inventory = {
        ...proof.inventory,
        binding: { ...proof.inventory.binding, censusSha256: 'd'.repeat(64) },
      };
    if (fault === 'repository')
      proof.inventory = {
        ...proof.inventory,
        revisions: proof.inventory.revisions.map((revision) => ({
          ...revision,
          repository: 'foreign',
        })),
      };
    if (fault === 'scratch-counters' || fault === 'scratch-unreadable')
      measured?.mockImplementation(() =>
        invokeRegistryCallback(() => {
          if (fault === 'scratch-unreadable') throw new Error('scratch denied');
          return {
            bsize: 0n,
            blocks: 10000n,
            bfree: 9000n,
            bavail: 9000n,
            files: 10000n,
            ffree: 9000n,
          } as never;
        }),
      );
    connected = spyOn(host, 'connectRegistryMaintenanceHost').mockRejectedValue(
      new Error('root transport failed'),
    );
    expect(
      (
        await requireRejection(
          createRegistryMaintenanceRuntime().verifyImages({} as never, proof.inventory),
        )
      ).throwCause,
    ).toThrow();
    if (fault !== 'transport') expect(connected).not.toHaveBeenCalled();
    else expect(connected).toHaveBeenCalledTimes(1);
  });
