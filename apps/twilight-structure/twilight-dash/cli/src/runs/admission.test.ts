import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { planAdmission, planManifestRetention, planRunCreation } from './plan-admission';
import { planOwnership } from './plan-ownership';
import {
  ArtifactRefCodec,
  attemptId,
  decodeAdmission,
  decodeAttempt,
  decodeOwnership,
  decodeRun,
  digestManifest,
  manifestDigest,
  occurrenceId,
  operationKey,
  organizationId,
  ownerId,
  runId,
} from './record-codecs';
import { createAdmissionFixture, createManifest, createRun, unwrapReply } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';

test('capacity one admits exactly one concurrent run without changing the loser', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  const second = createRun({ ...fixture.run, runId: runId('second') });
  unwrapReply(await fixture.runs.createRun(fixture.ownership, second));
  const replies = await Promise.all(
    [fixture.run, second].map((run, index) =>
      fixture.runs.admitAttempt(
        { ownership: fixture.ownership, runId: run.runId, expectedRevision: run.revision },
        {
          ...fixture.admission,
          attemptId: attemptId(`attempt-${String(index)}`),
          identity: { ...fixture.admission.identity, runId: run.runId },
        },
      ),
    ),
  );
  expect(replies.map((reply) => reply.kind).sort()).toEqual(['applied', 'refused']);
  expect(replies.find((reply) => reply.kind === 'refused')).toEqual({
    kind: 'refused',
    reason: 'capacity_full',
  });
  const snapshots = await Promise.all(
    [fixture.run, second].map((run) => fixture.runs.readRun(run.runId)),
  );
  expect(snapshots.map((snapshot) => snapshot.capacity.reserved)).toEqual([1, 1]);
  expect(snapshots.flatMap((snapshot) => snapshot.attempts)).toHaveLength(1);
  expect(snapshots.find((snapshot) => snapshot.attempts.length === 0)?.run.revision).toBe(0);
});

test('takeover fences writes without freeing surviving work', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  const guard = {
    ownership: fixture.ownership,
    runId: fixture.run.runId,
    expectedRevision: fixture.run.revision,
  };
  unwrapReply(await fixture.runs.admitAttempt(guard, fixture.admission));
  const before = await fixture.runs.readRun(fixture.run.runId);
  expect(
    await fixture.runs.acquireOwnership(ownerId('replacement'), fixture.ownership.epoch),
  ).toEqual({ kind: 'refused', reason: 'owner_busy' });
  fixture.clock.advance(101);
  const next = unwrapReply(
    await fixture.runs.acquireOwnership(ownerId('owner'), fixture.ownership.epoch),
  );
  expect(next.epoch).toBe(2);
  expect(await fixture.runs.admitAttempt(guard, fixture.admission)).toEqual({
    kind: 'refused',
    reason: 'owner_stale',
  });
  expect(await fixture.runs.readRun(fixture.run.runId)).toEqual(before);
  expect(before.capacity.reserved).toBe(1);
  expect(await fixture.runs.retainManifest(fixture.ownership, createManifest())).toEqual({
    kind: 'refused',
    reason: 'owner_stale',
  });
  expect(await fixture.runs.createRun(fixture.ownership, fixture.run)).toEqual({
    kind: 'refused',
    reason: 'owner_stale',
  });
});

test('expired ownership refuses all writes even without takeover and ignores forged expiry', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  fixture.clock.advance(100);
  const ownership = { ...fixture.ownership, expiresAt: 999999 };
  expect(await fixture.runs.renewOwnership(ownership)).toEqual({
    kind: 'refused',
    reason: 'owner_stale',
  });
  expect(await fixture.runs.retainManifest(ownership, createManifest())).toEqual({
    kind: 'refused',
    reason: 'owner_stale',
  });
  expect(await fixture.runs.createRun(ownership, fixture.run)).toEqual({
    kind: 'refused',
    reason: 'owner_stale',
  });
  expect(
    await fixture.runs.admitAttempt(
      { ownership, runId: fixture.run.runId, expectedRevision: 0 },
      fixture.admission,
    ),
  ).toEqual({ kind: 'refused', reason: 'owner_stale' });
  expect((await fixture.runs.readRun(fixture.run.runId)).capacity.reserved).toBe(0);
});

test('stale authority refuses before reading an absent target run', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  fixture.clock.advance(100);
  expect(
    await fixture.runs.admitAttempt(
      { ownership: fixture.ownership, runId: runId('absent'), expectedRevision: 0 },
      fixture.admission,
    ),
  ).toEqual({ kind: 'refused', reason: 'owner_stale' });
});

test('renewal uses configured duration and rejects store organization owner and epoch mismatches', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  fixture.clock.advance(50);
  const renewed = unwrapReply(
    await fixture.runs.renewOwnership({ ...fixture.ownership, expiresAt: 1 }),
  );
  expect(renewed.expiresAt).toBe(1150);
  const other = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  for (const requested of [
    other.ownership,
    { ...renewed, organizationId: organizationId('elsewhere') },
    { ...renewed, ownerId: ownerId('elsewhere') },
    { ...renewed, epoch: 2 },
  ]) {
    expect(await fixture.runs.renewOwnership(requested)).toEqual({
      kind: 'refused',
      reason: 'owner_stale',
    });
  }
  expect(await fixture.runs.acquireOwnership(ownerId('next'), 0)).toEqual({
    kind: 'refused',
    reason: 'owner_stale',
  });
});

test('unowned bootstrap refuses mutations before inspecting target records', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  const stores = createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: fixture.clock,
  });
  expect(stores.ownership).toMatchObject({ epoch: 0, owner: null });
  expect(await stores.runs.renewOwnership(fixture.ownership)).toEqual({
    kind: 'refused',
    reason: 'owner_stale',
  });
  expect(await stores.runs.retainManifest(fixture.ownership, createManifest())).toEqual({
    kind: 'refused',
    reason: 'owner_stale',
  });
  expect(await stores.runs.createRun(fixture.ownership, fixture.run)).toEqual({
    kind: 'refused',
    reason: 'owner_stale',
  });
  expect(
    await stores.runs.admitAttempt(
      { ownership: fixture.ownership, runId: fixture.run.runId, expectedRevision: 0 },
      fixture.admission,
    ),
  ).toEqual({ kind: 'refused', reason: 'owner_stale' });
});

test('clock regression and invalid clock observations throw without changing work', async () => {
  for (const delta of [-1, -1001, 0.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
    const before = await fixture.runs.readRun(fixture.run.runId);
    fixture.clock.advance(delta);
    await rejects(fixture.runs.renewOwnership(fixture.ownership));
    expect(await fixture.runs.readRun(fixture.run.runId)).toEqual(before);
  }
});

test('refused ownership acquisition persists the greatest clock observation', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  fixture.clock.advance(50);
  expect(await fixture.runs.acquireOwnership(ownerId('next'), 1)).toEqual({
    kind: 'refused',
    reason: 'owner_busy',
  });
  fixture.clock.advance(-1);
  await rejects(fixture.runs.renewOwnership(fixture.ownership), /clock regressed/);
});

test('exact run and admission identities are idempotent after revision advances', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  const guard = { ownership: fixture.ownership, runId: fixture.run.runId, expectedRevision: 0 };
  const attempt = unwrapReply(await fixture.runs.admitAttempt(guard, fixture.admission));
  expect(attempt).toMatchObject({
    ordinal: 1,
    revision: 0,
    admittedEpoch: 1,
    holdsCapacity: true,
    state: { kind: 'queued', claim: null },
  });
  expect(await fixture.runs.admitAttempt(guard, fixture.admission)).toEqual({
    kind: 'duplicate',
    value: attempt,
  });
  expect(await fixture.runs.createRun(fixture.ownership, fixture.run)).toMatchObject({
    kind: 'duplicate',
    value: { revision: 1 },
  });
  expect((await fixture.runs.readRun(fixture.run.runId)).capacity.reserved).toBe(1);
  expect(
    await fixture.runs.createRun(fixture.ownership, { ...fixture.run, maxAttempts: 4 }),
  ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
  expect(await fixture.runs.createRun(fixture.ownership, { ...fixture.run, revision: 1 })).toEqual({
    kind: 'refused',
    reason: 'revision_conflict',
  });
  for (const admission of [
    { ...fixture.admission, ordinal: 2 },
    {
      ...fixture.admission,
      identity: { ...fixture.admission.identity, operationKey: operationKey('changed') },
    },
  ]) {
    expect(await fixture.runs.admitAttempt(guard, admission)).toEqual({
      kind: 'refused',
      reason: 'identity_conflict',
    });
  }
});

test('stale run revision cannot reserve another slot', async () => {
  const fixture = await createAdmissionFixture({ capacity: 2, leaseMilliseconds: 100 });
  const guard = { ownership: fixture.ownership, runId: fixture.run.runId, expectedRevision: 0 };
  unwrapReply(await fixture.runs.admitAttempt(guard, fixture.admission));
  const before = await fixture.runs.readRun(fixture.run.runId);
  expect(
    await fixture.runs.admitAttempt(guard, {
      ...fixture.admission,
      attemptId: attemptId('second'),
      identity: { ...fixture.admission.identity, occurrenceId: occurrenceId('second') },
    }),
  ).toEqual({ kind: 'refused', reason: 'revision_conflict' });
  expect(await fixture.runs.readRun(fixture.run.runId)).toEqual(before);
});

test('admission enforces run identity, stored budget, contiguous ordinals and active occurrence', async () => {
  const fixture = await createAdmissionFixture({ capacity: 5, leaseMilliseconds: 100 });
  const guard = { ownership: fixture.ownership, runId: fixture.run.runId, expectedRevision: 0 };
  expect(
    await fixture.runs.admitAttempt(guard, {
      ...fixture.admission,
      identity: { ...fixture.admission.identity, runId: runId('other') },
    }),
  ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
  expect(await fixture.runs.admitAttempt(guard, { ...fixture.admission, ordinal: 4 })).toEqual({
    kind: 'refused',
    reason: 'retry_exhausted',
  });
  expect(await fixture.runs.admitAttempt(guard, { ...fixture.admission, ordinal: 2 })).toEqual({
    kind: 'refused',
    reason: 'identity_conflict',
  });
  unwrapReply(await fixture.runs.admitAttempt(guard, fixture.admission));
  const retry = { ...fixture.admission, attemptId: attemptId('retry'), ordinal: 2 };
  const current = { ...guard, expectedRevision: 1 };
  expect(await fixture.runs.admitAttempt(current, retry)).toEqual({
    kind: 'refused',
    reason: 'attempt_active',
  });
  expect(
    await fixture.runs.admitAttempt(current, {
      ...retry,
      identity: { ...retry.identity, operationKey: operationKey('changed') },
    }),
  ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
  const second = createRun({ ...fixture.run, runId: runId('second') });
  unwrapReply(await fixture.runs.createRun(fixture.ownership, second));
  expect(
    await fixture.runs.admitAttempt(
      { ...guard, runId: second.runId },
      { ...fixture.admission, identity: { ...fixture.admission.identity, runId: second.runId } },
    ),
  ).toEqual({ kind: 'refused', reason: 'identity_conflict' });
  expect((await fixture.runs.readRun(fixture.run.runId)).capacity.reserved).toBe(1);
});

test('manifest hash and canonical binding integrity refuse before persistence', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  const manifest = createManifest();
  expect(await fixture.runs.retainManifest(fixture.ownership, manifest)).toEqual({
    kind: 'duplicate',
    value: manifest,
  });
  for (const changed of [
    { ...manifest, credentialReferences: ['changed'] },
    { ...manifest, digest: manifestDigest('f'.repeat(64)) },
    { ...manifest, canonicalBinding: '{ "binding": "fixture" }' },
  ]) {
    await rejects(fixture.runs.retainManifest(fixture.ownership, changed));
  }
  const noncanonical = { ...manifest, canonicalBinding: '{ "binding": "fixture" }' };
  await rejects(
    fixture.runs.retainManifest(fixture.ownership, {
      ...noncanonical,
      digest: digestManifest(noncanonical),
    }),
    /not canonical JSON/,
  );
  expect(await fixture.runs.readManifest(manifest.digest)).toEqual(manifest);
});

test('manifest codecs reject invalid references and digest spellings', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  const manifest = createManifest();
  const reference = {
    version: 1,
    digest: 'a'.repeat(64),
    byteLength: 1,
    mediaType: 'text/plain',
    retention: 'retain',
  };
  for (const changed of [
    { ...reference, version: 2 },
    { ...reference, digest: 'BAD' },
    { ...reference, byteLength: -1 },
    { ...reference, retention: 'expire' },
  ]) {
    expect(() => ArtifactRefCodec.assert(changed)).toThrow();
    await rejects(
      fixture.runs.retainManifest(fixture.ownership, { ...manifest, prompts: [changed] } as never),
    );
  }
  for (const digest of ['A'.repeat(64), 'a'.repeat(63), '', 'sha256:abc'])
    expect(() => manifestDigest(digest)).toThrow();
  expect(() =>
    decodeAdmission({
      ...fixture.admission,
      identity: { ...fixture.admission.identity, version: 2 },
    }),
  ).toThrow();
});

test('portable codecs reject unknown versions kinds malformed IDs and unsafe integers', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  await rejects(
    fixture.runs.retainManifest(fixture.ownership, { ...createManifest(), version: 2 } as never),
  );
  await rejects(fixture.runs.createRun(fixture.ownership, { ...fixture.run, version: 2 } as never));
  await rejects(fixture.runs.renewOwnership({ ...fixture.ownership, version: 2 } as never));
  for (const count of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await rejects(
      fixture.runs.createRun(fixture.ownership, { ...fixture.run, maxAttempts: count }),
    );
    expect(() => decodeAdmission({ ...fixture.admission, ordinal: count })).toThrow();
  }
  for (const identity of ['', 'x'.repeat(257), null, 1]) expect(() => runId(identity)).toThrow();
  const attempt = unwrapReply(
    await fixture.runs.admitAttempt(
      { ownership: fixture.ownership, runId: fixture.run.runId, expectedRevision: 0 },
      fixture.admission,
    ),
  );
  expect(() => decodeAttempt({ ...attempt, version: 2 })).toThrow();
  expect(() => decodeAttempt({ ...attempt, state: { kind: 'unknown', claim: null } })).toThrow();
  expect(() => decodeOwnership({ ...fixture.ownership, epoch: 0 })).toThrow();
  expect(() => decodeRun({ ...fixture.run, revision: -1 })).toThrow();
  expect(() => decodeRun({ ...fixture.run, unexpected: true })).toThrow();
});

test('bootstrap requires valid configuration and clock and closed stores reject every operation', async () => {
  for (const count of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() =>
      createMemoryStores({
        organizationId: organizationId('org'),
        capacity: count,
        leaseMilliseconds: 100,
        clock: { read: () => 1000 },
      }),
    ).toThrow();
    expect(() =>
      createMemoryStores({
        organizationId: organizationId('org'),
        capacity: 1,
        leaseMilliseconds: count,
        clock: { read: () => 1000 },
      }),
    ).toThrow();
  }
  expect(() =>
    createMemoryStores({
      organizationId: organizationId('org'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock: undefined as never,
    }),
  ).toThrow('Validation failed');
  expect(() =>
    createMemoryStores({
      organizationId: organizationId('org'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock: {} as never,
    }),
  ).toThrow('Validation failed');
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  fixture.close();
  const operations = [
    () => fixture.runs.acquireOwnership(ownerId('owner'), 1),
    () => fixture.runs.renewOwnership(fixture.ownership),
    () => fixture.runs.retainManifest(fixture.ownership, createManifest()),
    () => fixture.runs.readManifest(fixture.run.manifestDigest),
    () => fixture.runs.createRun(fixture.ownership, fixture.run),
    () => fixture.runs.readRun(fixture.run.runId),
    () =>
      fixture.runs.admitAttempt(
        { ownership: fixture.ownership, runId: fixture.run.runId, expectedRevision: 0 },
        fixture.admission,
      ),
  ];
  for (const operation of operations) await rejects(operation(), /closed/);
});

test('trusted missing records and arithmetic overflow throw without reservations', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  await rejects(fixture.runs.readRun(runId('absent')), /run does not exist/);
  await rejects(
    fixture.runs.readManifest(manifestDigest('f'.repeat(64))),
    /manifest does not exist/,
  );
  const guard = {
    ownership: fixture.ownership,
    runId: fixture.run.runId,
    expectedRevision: Number.MAX_SAFE_INTEGER,
  };
  const facts = {
    ownership: fixture.ownership,
    observedAt: 1000,
    lastObservedAt: 1000,
    capacity: { limit: 1, reserved: 0 },
    run: { ...fixture.run, revision: Number.MAX_SAFE_INTEGER },
    manifest: createManifest(),
    attempts: [],
    admissions: [],
  };
  expect(() => planAdmission(facts, guard, fixture.admission)).toThrow('integer');
  expect(() =>
    planAdmission({ ...facts, manifest: undefined as never }, guard, fixture.admission),
  ).toThrow('manifest does not exist');
  expect(() =>
    planAdmission(
      { ...facts, manifest: createManifest({ credentialReferences: ['other'] }) },
      guard,
      fixture.admission,
    ),
  ).toThrow('run manifest differs');
  expect(() =>
    planAdmission({ ...facts, admissions: [fixture.admission] }, guard, fixture.admission),
  ).toThrow('admitted attempt does not exist');
  const authority = {
    current: fixture.ownership,
    requested: fixture.ownership,
    observedAt: 1000,
    lastObservedAt: 1000,
  };
  expect(() =>
    planManifestRetention(authority, createManifest(), {
      ...createManifest(),
      credentialReferences: ['corrupt'],
    }),
  ).toThrow('manifest integrity conflict');
  expect(() =>
    planRunCreation(authority, fixture.run, fixture.run, undefined, createManifest()),
  ).toThrow('run does not exist');
  expect(() =>
    planRunCreation(
      authority,
      fixture.run,
      undefined,
      undefined,
      createManifest({ credentialReferences: ['other'] }),
    ),
  ).toThrow('run manifest differs');
  expect(() =>
    planOwnership(
      { ...fixture.ownership, epoch: Number.MAX_SAFE_INTEGER, owner: null },
      ownerId('owner'),
      Number.MAX_SAFE_INTEGER,
      1000,
      1000,
      100,
    ),
  ).toThrow('integer');
  fixture.clock.advance(Number.MAX_SAFE_INTEGER - 1000);
  await rejects(fixture.runs.acquireOwnership(ownerId('new'), 1), /integer/);
  expect((await fixture.runs.readRun(fixture.run.runId)).capacity.reserved).toBe(0);
});

async function createAdmissionFacts() {
  const fixture = await createAdmissionFixture({ capacity: 2, leaseMilliseconds: 100 });
  unwrapReply(
    await fixture.runs.admitAttempt(
      { ownership: fixture.ownership, runId: fixture.run.runId, expectedRevision: 0 },
      fixture.admission,
    ),
  );
  const snapshot = await fixture.runs.readRun(fixture.run.runId);
  return {
    fixture,
    guard: {
      ownership: fixture.ownership,
      runId: fixture.run.runId,
      expectedRevision: snapshot.run.revision,
    },
    facts: {
      ownership: fixture.ownership,
      observedAt: 1000,
      lastObservedAt: 1000,
      capacity: snapshot.capacity,
      run: snapshot.run,
      manifest: createManifest(),
      attempts: snapshot.attempts,
      admissions: [fixture.admission],
    },
    authority: {
      current: fixture.ownership,
      requested: fixture.ownership,
      observedAt: 1000,
      lastObservedAt: 1000,
    },
  };
}

test('run creation rejects a current run without its immutable initial identity', async () => {
  const { fixture, facts, authority } = await createAdmissionFacts();
  expect(() =>
    planRunCreation(authority, fixture.run, undefined, facts.run, facts.manifest),
  ).toThrow('run initial identity does not exist');
  expect((await fixture.runs.readRun(fixture.run.runId)).run.revision).toBe(1);
});

test('run creation rejects an initial identity without its current run before collision checks', async () => {
  const { fixture, facts, authority } = await createAdmissionFacts();
  expect(() =>
    planRunCreation(
      authority,
      { ...fixture.run, maxAttempts: 4 },
      fixture.run,
      undefined,
      facts.manifest,
    ),
  ).toThrow('run does not exist');
});

test('admission rejects an attempt collision without its immutable admission identity', async () => {
  const { fixture, facts, guard } = await createAdmissionFacts();
  const changed = {
    ...fixture.admission,
    identity: { ...fixture.admission.identity, occurrenceId: occurrenceId('changed') },
  };
  expect(() => planAdmission({ ...facts, admissions: [] }, guard, changed)).toThrow(
    'admission identity does not exist',
  );
  expect((await fixture.runs.readRun(fixture.run.runId)).capacity.reserved).toBe(1);
});

test('admission rejects an immutable identity without its attempt before collision checks', async () => {
  const { fixture, facts, guard } = await createAdmissionFacts();
  const changed = {
    ...fixture.admission,
    identity: { ...fixture.admission.identity, occurrenceId: occurrenceId('changed') },
  };
  expect(() => planAdmission({ ...facts, attempts: [] }, guard, changed)).toThrow(
    'admitted attempt does not exist',
  );
});

test('run creation requires a retained manifest before any reservation', async () => {
  const fixture = await createAdmissionFixture({ capacity: 1, leaseMilliseconds: 100 });
  await rejects(
    fixture.runs.createRun(
      fixture.ownership,
      createRun({
        ...fixture.run,
        runId: runId('absent'),
        manifestDigest: manifestDigest('a'.repeat(64)),
      }),
    ),
    /manifest does not exist/,
  );
  expect((await fixture.runs.readRun(fixture.run.runId)).capacity.reserved).toBe(0);
});

test('caller mutation cannot change retained manifests, runs, attempts or returned snapshots', async () => {
  const fixture = await createAdmissionFixture({ capacity: 2, leaseMilliseconds: 100 });
  const manifest = createManifest({ credentialReferences: ['credential-ref'] });
  const retained = unwrapReply(await fixture.runs.retainManifest(fixture.ownership, manifest));
  (manifest.credentialReferences as string[]).push('mutated');
  (retained.credentialReferences as string[]).push('returned');
  expect((await fixture.runs.readManifest(retained.digest)).credentialReferences).toEqual([
    'credential-ref',
  ]);
  const run = createRun({ ...fixture.run, runId: runId('mutable') });
  unwrapReply(await fixture.runs.createRun(fixture.ownership, run));
  Object.assign(run, { maxAttempts: 99 });
  expect((await fixture.runs.readRun(run.runId)).run.maxAttempts).toBe(3);
  const guard = {
    ownership: fixture.ownership,
    runId: fixture.run.runId,
    expectedRevision: fixture.run.revision,
  };
  const admitted = unwrapReply(await fixture.runs.admitAttempt(guard, fixture.admission));
  Object.assign(fixture.admission.identity, { operationKey: 'mutated' });
  Object.assign(admitted.state, { claim: { broken: true } });
  const snapshot = await fixture.runs.readRun(fixture.run.runId);
  expect(String(snapshot.attempts[0]?.identity.operationKey)).toBe('operation');
  expect(snapshot.attempts[0]?.state).toEqual({ kind: 'queued', claim: null });
  Object.assign(snapshot.capacity, { reserved: 99 });
  expect((await fixture.runs.readRun(fixture.run.runId)).capacity.reserved).toBe(1);
});
