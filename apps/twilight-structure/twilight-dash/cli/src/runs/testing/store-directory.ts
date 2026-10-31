import { type RmOptions, rmSync } from 'node:fs';
import { dirname } from 'node:path';

import { closeFixtures } from './close-fixtures';

/** Owns one test directory. Register every opened bundle/probe; its single cleanup waits for all disposal before removing storage. */
export function createStoreDirectory(directory: string, removal: RmOptions) {
  const stores: { close(): Promise<void> }[] = [];
  const probes: { close(): void }[] = [];
  async function close(): Promise<void> {
    const failures: unknown[] = [];
    // Proof: I1-R skipped registered raw probes; the actual signals owner failed STORE-DIRECTORY-I1-07. Exact restoration passed.
    for (const probe of probes) {
      try {
        probe.close();
      } catch (cause) {
        failures.push(cause);
      }
    }
    try {
      // Proof: I1-P closed only the first real provider; the peer-attempt assertion failed STORE-DIRECTORY-I1-09. Exact restoration passed.
      await closeFixtures(stores);
    } catch (cause) {
      failures.push(cause);
    }
    // Proof: I1-S removed this disposal-failure barrier; the actual directory hook deleted storage and failed STORE-DIRECTORY-I1-04. Exact restoration passed.
    if (failures.length > 0)
      throw new AggregateError(failures, 'owned store directory disposal failed');
    rmSync(directory, removal);
  }
  return {
    directory,
    retainStore<T extends { close(): Promise<void> }>(store: T): T {
      stores.push(store);
      return store;
    },
    retainProbe<T extends { close(): void }>(probe: T): T {
      probes.push(probe);
      return probe;
    },
    close,
    /** Preserves the work cause if finally cleanup fails, including thrown undefined; cleanup still attempts every connection. */
    async runTest<T>(operation: () => Promise<T>): Promise<T> {
      let completion: { kind: 'completed'; value: T } | { kind: 'failed'; cause: unknown };
      let cleanup: { kind: 'completed' } | { kind: 'failed'; cause: unknown } = {
        kind: 'completed',
      };
      try {
        try {
          completion = { kind: 'completed', value: await operation() };
        } catch (cause) {
          completion = { kind: 'failed', cause };
        }
      } finally {
        try {
          await close();
        } catch (cause) {
          cleanup = { kind: 'failed', cause };
        }
      }
      if (cleanup.kind === 'failed') {
        if (completion.kind === 'failed')
          throw new AggregateError(
            // Proof: I1-C dropped the original work cause; real provider cleanup failed STORE-DIRECTORY-I1-08. Exact restoration passed.
            [completion.cause, cleanup.cause],
            'store test and directory cleanup failed',
            { cause: cleanup.cause },
          );
        throw cleanup.cause;
      }
      if (completion.kind === 'failed') throw completion.cause;
      return completion.value;
    },
  };
}

/** Finds the owner only after a factory succeeds, preserving the factory's input-validation order. */
export function findStoreDirectory(
  directories: readonly ReturnType<typeof createStoreDirectory>[],
  path: string,
) {
  const owner = directories.find((directory) => directory.directory === dirname(path));
  if (owner === undefined) throw new Error('store directory was not registered');
  return owner;
}
