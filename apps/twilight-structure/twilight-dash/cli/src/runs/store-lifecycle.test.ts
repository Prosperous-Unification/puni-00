import { ok, rejects, strictEqual } from 'node:assert/strict';

import { test } from 'bun:test';

import { organizationId, ownerId } from './record-codecs';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';

test('memory close repeats successful outcome and immediately fences both ports', async () => {
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
  });
  const active = stores.runs.acquireOwnership(ownerId('active'), 0);
  const closing = stores.close();
  ok(
    closing instanceof Promise,
    'MEMORY-LIFECYCLE-01: close must return observable Promise completion',
  );
  const repeated = stores.close();
  ok(
    repeated instanceof Promise,
    'MEMORY-LIFECYCLE-02: close must return observable Promise completion',
  );
  const lateRun = rejects(
    stores.runs.acquireOwnership(ownerId('late'), 0),
    /closed/,
    'MEMORY-LIFECYCLE-03: operation invoked after close must reject through the existing lifecycle fence',
  );
  const lateArtifact = rejects(
    stores.artifacts.retainArtifact(new Uint8Array([9]), 'test/bytes'),
    /closed/,
    'MEMORY-LIFECYCLE-04: operation invoked after close must reject through the existing lifecycle fence',
  );
  strictEqual(
    (await active).kind,
    'applied',
    'MEMORY-LIFECYCLE-05: an operation published before close retains its original outcome',
  );
  await lateRun;
  await lateArtifact;
  await closing;
  await repeated;
  await stores.close();
});
