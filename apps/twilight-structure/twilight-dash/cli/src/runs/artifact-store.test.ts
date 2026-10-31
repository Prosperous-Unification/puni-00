import { rejects } from 'node:assert/strict';

import { test } from 'bun:test';

import { organizationId } from './record-codecs';
import { artifactStoreContract } from './testing/artifact-store-contract';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';

artifactStoreContract(
  'memory artifacts',
  async () =>
    await Promise.resolve(
      createMemoryStores({
        organizationId: organizationId('organization'),
        capacity: 1,
        leaseMilliseconds: 100,
        clock: new FixtureClock(),
      }),
    ),
);

test('memory retention requires readback after a failed map write', async () => {
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
  });
  const descriptor = Object.getOwnPropertyDescriptor(Map.prototype, 'set');
  if (descriptor === undefined) throw new Error('map set descriptor absent');
  const set = descriptor.value as (
    this: Map<unknown, unknown>,
    key: unknown,
    entry: unknown,
  ) => Map<unknown, unknown>;
  Object.defineProperty(Map.prototype, 'set', {
    ...descriptor,
    value(this: Map<unknown, unknown>, key: unknown, entry: unknown) {
      if (
        typeof key === 'string' &&
        key.length === 64 &&
        typeof entry === 'object' &&
        entry !== null &&
        'content' in entry
      )
        return this;
      return set.call(this, key, entry);
    },
  });
  try {
    await rejects(
      stores.artifacts.retainArtifact(new TextEncoder().encode('hello'), 'text/plain'),
      /artifact does not exist after retention/,
    );
  } finally {
    Object.defineProperty(Map.prototype, 'set', descriptor);
    await stores.close();
  }
});
