import type { WallClock } from '../../clock';
import {
  decodeAdmission,
  decodeManifest,
  decodeRun,
  digestManifest,
  manifestDigest,
  organizationId,
  ownerId,
} from '../record-codecs';
import type { Manifest, Run } from '../records';
import type { StoreReply } from '../run-store';
import { createMemoryStores } from './memory-stores';

export class FixtureClock implements WallClock {
  #timestamp = 1000;
  read(): number {
    return this.#timestamp;
  }
  advance(milliseconds: number): void {
    this.#timestamp += milliseconds;
  }
}

export function unwrapReply<T>(reply: StoreReply<T>): T {
  if (reply.kind === 'refused') throw new Error(`unexpected refusal: ${reply.reason}`);
  return reply.value;
}

export function createManifest(overrides: Partial<Manifest> = {}): Manifest {
  const manifest = {
    version: 1,
    digest: manifestDigest('0'.repeat(64)),
    bindingVersion: 1,
    canonicalBinding: '{"binding":"fixture"}',
    prompts: [],
    toolPolicies: [],
    executorVersions: { executor: '1' },
    credentialReferences: [],
    ...overrides,
  };
  return decodeManifest({ ...manifest, digest: digestManifest(manifest) });
}

export function createRun(overrides: Partial<Run> = {}): Run {
  return decodeRun({
    version: 1,
    runId: 'run',
    revision: 0,
    projectId: 'project',
    workItemId: 'work',
    manifestDigest: createManifest().digest,
    maxAttempts: 3,
    ...overrides,
  });
}

export async function createAdmissionFixture(options: {
  capacity: number;
  leaseMilliseconds: number;
}) {
  const clock = new FixtureClock();
  const stores = createMemoryStores({
    ...options,
    organizationId: organizationId('organization'),
    clock,
  });
  const ownership = unwrapReply(
    await stores.runs.acquireOwnership(ownerId('owner'), stores.ownership.epoch),
  );
  unwrapReply(await stores.runs.retainManifest(ownership, createManifest()));
  const run = unwrapReply(await stores.runs.createRun(ownership, createRun()));
  const admission = decodeAdmission({
    attemptId: 'attempt',
    identity: {
      version: 1,
      runId: run.runId,
      occurrenceId: 'occurrence',
      operationKey: 'operation',
    },
    ordinal: 1,
  });
  return {
    runs: stores.runs,
    clock,
    ownership,
    run,
    admission,
    close: () => {
      stores.close();
    },
  };
}
