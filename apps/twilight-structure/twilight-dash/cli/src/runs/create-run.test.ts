import { expect, test } from 'bun:test';

import { createRun, type RunCreation } from './create-run';
import { manifestDigest, organizationId, ownerId, projectId, workItemId } from './record-codecs';
import { createManifest, FixtureClock, unwrapReply } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';

const creation: RunCreation = {
  projectId: projectId('project-17'),
  workItemId: workItemId('work-42'),
  manifestDigest: manifestDigest('a'.repeat(64)),
  maxAttempts: 3,
};

test('separate creations generate distinct UUIDv4 run identities for the same work item', () => {
  const first = createRun(creation);
  const second = createRun(creation);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  expect(first.runId).toMatch(uuid);
  expect(second.runId).toMatch(uuid);
  expect(first.runId).not.toBe(second.runId);
  for (const run of [first, second]) {
    expect(run).toEqual({
      version: 1,
      runId: run.runId,
      revision: 0,
      projectId: projectId('project-17'),
      workItemId: workItemId('work-42'),
      manifestDigest: manifestDigest('a'.repeat(64)),
      maxAttempts: 3,
    });
  }
});

test('creation returns a frozen snapshot independent of later input edits', () => {
  const input = { ...creation };
  const run = createRun(input);
  const retained = { ...run };

  input.projectId = projectId('edited-project');
  input.workItemId = workItemId('edited-work');
  input.manifestDigest = manifestDigest('b'.repeat(64));
  input.maxAttempts = 7;

  expect(Object.isFrozen(run)).toBe(true);
  for (const field of Object.keys(run)) {
    expect(Reflect.set(run, field, 'edited')).toBe(false);
  }
  expect(run).toEqual(retained);
});

test('retained creation retries reuse exact identity and original payload after store read', async () => {
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
  });
  try {
    const ownership = unwrapReply(
      await stores.runs.acquireOwnership(ownerId('owner'), stores.ownership.epoch),
    );
    const manifest = createManifest();
    unwrapReply(await stores.runs.retainManifest(ownership, manifest));
    const run = createRun({ ...creation, manifestDigest: manifest.digest });

    expect(await stores.runs.createRun(ownership, run)).toEqual({ kind: 'applied', value: run });
    const snapshot = await stores.runs.readRun(run.runId);
    expect(snapshot.run).toEqual(run);
    expect(snapshot.run.runId).toBe(run.runId);
    expect(await stores.runs.createRun(ownership, run)).toEqual({ kind: 'duplicate', value: run });
    expect(await stores.runs.readRun(run.runId)).toEqual(snapshot);
  } finally {
    await stores.close();
  }
});

test.each([
  ['empty project', { projectId: '' }],
  ['overlong project', { projectId: 'p'.repeat(257) }],
  ['missing project', { projectId: undefined }],
  ['empty work item', { workItemId: '' }],
  ['overlong work item', { workItemId: 'w'.repeat(257) }],
  ['null work item', { workItemId: null }],
  ['uppercase manifest', { manifestDigest: 'A'.repeat(64) }],
  ['short manifest', { manifestDigest: 'a'.repeat(63) }],
  ['missing manifest', { manifestDigest: undefined }],
  ['zero budget', { maxAttempts: 0 }],
  ['negative budget', { maxAttempts: -1 }],
  ['fractional budget', { maxAttempts: 1.5 }],
  ['infinite budget', { maxAttempts: Infinity }],
  ['unsafe budget', { maxAttempts: Number.MAX_SAFE_INTEGER + 1 }],
  ['missing budget', { maxAttempts: undefined }],
])('constructor validation rejects %s before returning a run', (_label, changes) => {
  expect(() => createRun({ ...creation, ...changes } as never)).toThrow();
});
