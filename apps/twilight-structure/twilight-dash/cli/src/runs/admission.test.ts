import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { planAdmission, planManifestRetention, planRunCreation } from './plan-admission';
import { planOwnership } from './plan-ownership';
import {
  ArtifactRefCodec,
  decodeAdmission,
  decodeAttempt,
  decodeOwnership,
  decodeRun,
  manifestDigest,
  occurrenceId,
  organizationId,
  ownerId,
  runId,
} from './record-codecs';
import { createAdmissionFixture, createManifest, unwrapReply } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';

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
  for (const version of [1, 3]) expect(() => decodeAttempt({ ...attempt, version })).toThrow();
  expect(() => decodeAttempt({ ...attempt, state: { kind: 'unknown' } })).toThrow();
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
