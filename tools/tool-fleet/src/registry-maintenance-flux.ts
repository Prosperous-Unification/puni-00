import { randomUUID } from 'node:crypto';

/** Captured prior state plus installed source/artifact identity; observation adapters verify these against actual server resources. */
export interface RegistryFluxOwner {
  readonly name: string;
  readonly uid: string;
  readonly cluster: string;
  readonly source: string;
  readonly path: string;
  readonly specificationSha256: string;
  readonly sourceRevision: string;
  readonly suspended: boolean;
  readonly requestedAt: string | null;
}
export interface RegistryControllerPorts {
  withdraw(): Promise<void>;
  verify(): Promise<void>;
  patch(owner: RegistryFluxOwner, requestedAt: string): Promise<void>;
  observe(owner: RegistryFluxOwner): Promise<{ suspended: boolean; requestedAt: string | null }>;
  stop(): Promise<void>;
  hasWriters(): Promise<boolean>;
}

/**
 * Drain both Flux parent graphs before stopping writers. Distribution readonly acknowledgements
 * are deliberately not an input: a full registry cannot write them. The caller already owns
 * a durable fence and records this fresh receipt before backup/deletion. Failures never resume
 * controllers, reopen the endpoint or infer writer absence from an unconfirmed pressure report.
 */
export async function fenceRegistryControllers(
  owners: readonly RegistryFluxOwner[],
  ports: RegistryControllerPorts,
  waitMs = 120000,
  pollMs = 1000,
): Promise<{ name: string; requestedAt: string }[]> {
  const order = ['puni-cluster', 'fleet-helsinki', 'registry-storage', 'platform'];
  if (JSON.stringify(owners.map((owner) => owner.name)) !== JSON.stringify(order))
    throw new Error('Incomplete or unordered registry controller ownership graph');
  if (
    !Number.isSafeInteger(waitMs) ||
    waitMs < 1 ||
    waitMs > 120000 ||
    !Number.isSafeInteger(pollMs) ||
    pollMs < 1 ||
    pollMs > waitMs
  )
    throw new Error('Invalid controller convergence bounds');
  await ports.verify();
  await ports.withdraw();
  const acknowledgements: { name: string; requestedAt: string }[] = [];
  for (const owner of owners) {
    await ports.verify();
    const requestedAt = randomUUID();
    await ports.patch(owner, requestedAt);
    const deadline = Date.now() + waitMs;
    for (;;) {
      const observation = await ports.observe(owner);
      // Proof: each stale parent/child token and revived storage owner fails before stopping writers.
      if (observation.suspended && observation.requestedAt === requestedAt) break;
      if (Date.now() >= deadline)
        throw new Error(`Flux suspension was not acknowledged: ${owner.name}`);
      await Bun.sleep(pollMs);
    }
    await ports.verify();
    acknowledgements.push({ name: owner.name, requestedAt });
  }
  await ports.stop();
  const deadline = Date.now() + waitMs;
  while (await ports.hasWriters()) {
    // Proof: the surviving writer fault refuses the fence even after all four valid Flux acknowledgements.
    if (Date.now() >= deadline) throw new Error('Registry writers did not terminate');
    await Bun.sleep(pollMs);
  }
  await ports.verify();
  return acknowledgements;
}
