import { randomUUID } from 'node:crypto';

import type { RegistryBackupEffectPort } from './registry-backup-reservation';

/** Compatibility model for tests of other boundaries. This port establishes no persistence, physical admission, installed root access or replay proof; reservation tests use the real file journal instead. */
export function modelRegistryBackupEffects(): RegistryBackupEffectPort {
  return {
    bindPhase: () => Promise.resolve(),
    consumeEffect: () => Promise.resolve({ id: randomUUID() }),
    settleEffect: () => Promise.resolve(),
  };
}

if (import.meta.main) {
  const { openRegistryBackupReservation } = await import('./registry-backup-reservation');
  // Boundary: only the ordinary parent test serializes this fixture input; no production entrypoint invokes it.
  const configuration = JSON.parse(process.argv[2] ?? '') as Parameters<
    typeof openRegistryBackupReservation
  >[0];
  const stage = process.argv[3];
  const port = openRegistryBackupReservation({
    ...configuration,
    authorityDescriptor: 3,
    signal: new AbortController().signal,
    requireLineage: () => Promise.resolve(),
    measure: () =>
      Promise.resolve({
        usableBytes: 1073741824,
        allocationUnitBytes: 4096,
        usedBytes: 1024,
        totalInodes: 100000,
        usedInodes: 10,
      }),
    sync: async (descriptor) => {
      await descriptor.sync();
      const isDirectory = (await descriptor.stat()).isDirectory();
      if ((stage === 'prepublish' && !isDirectory) || (stage === 'postconsume' && isDirectory))
        process.kill(process.pid, 'SIGKILL');
    },
  });
  await port.consumeEffect({
    slot: 'repository-direct',
    kind: 'read',
    targetSha256: 'd'.repeat(64),
  });
  throw new Error('Crash fixture failed to interrupt consumption');
}
