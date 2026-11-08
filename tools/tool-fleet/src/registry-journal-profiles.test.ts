import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { executeRegistryCommand as executeFoundationCommand } from './registry-journal';
import { requireRejection } from './registry-rejection.fixture';

const { executeRegistryCommand: executeManagedCommand } =
  await import('./registry-publication-facade');

const GiB = 1024 ** 3;
const ports = {
  now: () => '2026-11-08T00:00:00.000Z',
  measureJournal: () =>
    Promise.resolve({
      usableBytes: GiB,
      usedBytes: 1000,
      totalInodes: 10000,
      usedInodes: 10,
      allocationUnitBytes: 4096,
    }),
  measureRegistry: () =>
    Promise.resolve({
      maximumBytes: 50 * GiB,
      usableBytes: 50 * GiB,
      usedBytes: GiB,
      totalInodes: 10000,
      usedInodes: 10,
      rootFreeBytes: 30 * GiB,
    }),
};
const initialize = {
  command: 'initialize',
  enrollment: {
    registryId: 'profiles',
    storageId: 'store',
    owners: ['owner'],
    registryPath: '/unused-registry',
    rootPath: '/',
    maximumBytes: 50 * GiB,
    journalMaximumBytes: GiB,
  },
};

test('foundation path initializes schema1 while the publication facade retains managed schema3', async () => {
  const foundationDirectory = await scratchAsync('registry-foundation-profile-');
  const managedDirectory = await scratchAsync('registry-managed-profile-');
  const foundation = await executeFoundationCommand(foundationDirectory, initialize, ports);
  const managed = await executeManagedCommand(managedDirectory, initialize, ports);
  expect(managed.state.schemaVersion).toBe(3);
  expect(foundation.state.schemaVersion).toBe(1);
});

const digest = `sha256:${'1'.repeat(64)}`;
const tokenPattern = '11111111-1111-4111-8111-111111111111';
async function createProfile(profile: 'foundation' | 'managed') {
  const directory = await scratchAsync(`registry-${profile}-matrix-`);
  const execute = profile === 'foundation' ? executeFoundationCommand : executeManagedCommand;
  await execute(directory, initialize, ports);
  return { directory, execute };
}
type ProfileFixture = Awaited<ReturnType<typeof createProfile>>;
async function mutate(proof: ProfileFixture, request: Record<string, unknown>) {
  const current = await proof.execute(proof.directory, { command: 'read' }, ports);
  return proof.execute(
    proof.directory,
    { owner: 'owner', expectedRevision: current.state.revision, ...request },
    ports,
  );
}
function requireToken(receipt: { token?: string }): string {
  if (receipt.token === undefined) throw new Error('Missing actual operation token');
  return receipt.token;
}
async function writeLegacy(version: 1 | 2) {
  const proof = await createProfile('managed');
  const first = await mutate(proof, {
    command: 'acquire-protection',
    operationId: 'closed',
    roots: [digest],
    references: [{ repository: 'proof/app', digest }],
    reason: 'retained',
  });
  await mutate(proof, {
    command: 'release-protection',
    operationId: 'closed',
    token: requireToken(first),
    reconciled: true,
  });
  await mutate(proof, {
    command: 'acquire-protection',
    operationId: 'protected',
    roots: [digest],
    references: [{ repository: 'proof/app', digest }],
    reason: 'retained',
  });
  const reserved = await mutate(proof, {
    command: 'reserve-publication',
    operationId: 'publication',
    product: 'proof',
    roots: [digest],
    references: [{ repository: 'proof/app', digest }],
    envelope: { bytes: 1, inodes: 1 },
  });
  const state = reserved.state;
  if (state.schemaVersion !== 3) throw new Error('Expected actual managed schema3 fixture');
  const legacy = {
    schemaVersion: version,
    enrollment: state.enrollment,
    revision: state.revision,
    updatedAt: state.updatedAt,
    fenced: state.fenced,
    protections: state.protections,
    bundles: state.bundles,
    reservations: state.reservations,
    publication: state.publication,
    maintenance: state.maintenance,
    closedOperations: state.closedOperations,
    ...(version === 2
      ? {
          fenceReason: state.fenceReason,
          maintenanceVerified: state.maintenanceVerified,
          measurement: state.measurement,
        }
      : {}),
  };
  await writeFile(join(proof.directory, 'journal.json'), JSON.stringify(legacy));
  return { ...proof, legacy };
}

for (const version of [3, 4] as const) {
  test(`foundation ordinary read refuses managed${String(version)} before orphan reclamation`, async () => {
    const proof = await createProfile('managed');
    if (version === 4)
      await executeManagedCommand(proof.directory, { command: 'upgrade-maintenance' }, ports);
    const path = join(proof.directory, 'journal.json');
    const before = await readFile(path, 'utf8');
    const orphan = join(proof.directory, `journal.${tokenPattern}.json`);
    await writeFile(orphan, 'retain recovery evidence', { mode: 0o600 });
    await requireRejection(executeFoundationCommand(proof.directory, { command: 'read' }, ports));
    expect(await readFile(path, 'utf8')).toBe(before);
    expect(await readFile(orphan, 'utf8')).toBe('retain recovery evidence');
  });
}
for (const version of [1, 2] as const) {
  test(`managed ordinary read refuses legacy${String(version)} before orphan reclamation`, async () => {
    const proof = await writeLegacy(version);
    const path = join(proof.directory, 'journal.json');
    const before = await readFile(path, 'utf8');
    const orphan = join(proof.directory, `journal.${tokenPattern}.json`);
    await writeFile(orphan, 'retain recovery evidence', { mode: 0o600 });
    await requireRejection(executeManagedCommand(proof.directory, { command: 'read' }, ports));
    expect(await readFile(path, 'utf8')).toBe(before);
    expect(await readFile(orphan, 'utf8')).toBe('retain recovery evidence');
  });
  test(`explicit managed upgrade preserves every legacy${String(version)} obligation and token`, async () => {
    const proof = await writeLegacy(version);
    const upgraded = await executeManagedCommand(proof.directory, { command: 'upgrade' }, ports);
    expect(upgraded.state.schemaVersion).toBe(3);
    expect(upgraded.state.fenced).toBe(true);
    expect(upgraded.state.revision).toBe(proof.legacy.revision + 1);
    for (const key of [
      'protections',
      'bundles',
      'reservations',
      'publication',
      'maintenance',
      'closedOperations',
    ] as const)
      expect(upgraded.state[key]).toEqual(proof.legacy[key]);
  });
}

test('foundation promoted publication remains valid', async () => {
  const proof = await createProfile('foundation');
  const reserved = await mutate(proof, {
    command: 'reserve-publication',
    operationId: 'publication',
    product: 'proof',
    roots: [digest],
    references: [{ repository: 'proof/app', digest }],
    envelope: { bytes: 1, inodes: 1 },
  });
  const completed = await mutate(proof, {
    command: 'finish-publication',
    operationId: 'publication',
    token: requireToken(reserved),
    outcome: 'promoted',
    reconciled: true,
  });
  expect(completed.state.bundles[0]?.receipt.state).toBe('promoted');
});
test('managed promoted request rejects before deferred authority and lock effects', async () => {
  const directory = await scratchAsync('registry-managed-grammar-');
  let bootstraps = 0;
  await requireRejection(
    executeManagedCommand(
      directory,
      {
        command: 'finish-publication',
        expectedRevision: 0,
        operationId: 'publication',
        owner: 'owner',
        token: tokenPattern,
        outcome: 'promoted',
        reconciled: true,
      },
      () => {
        bootstraps++;
        return Promise.resolve(ports);
      },
    ),
  );
  expect(bootstraps).toBe(0);
  expect(await readdir(directory)).toEqual([]);
});
for (const profile of ['foundation', 'managed'] as const) {
  test(`${profile} retains its own low-water completion reopening rule`, async () => {
    const proof = await createProfile(profile);
    const started = await mutate(proof, {
      command: 'begin-maintenance',
      operationId: 'maintenance',
      kind: 'backup',
    });
    for (const phase of [
      'reconciled',
      'fenced',
      'stopped',
      'backed-up',
      'verified',
      'restored',
      'completed',
    ])
      await mutate(proof, {
        command: 'advance-maintenance',
        operationId: 'maintenance',
        token: requireToken(started),
        phase,
      });
    const completed = await proof.execute(proof.directory, { command: 'read' }, ports);
    expect(completed.state.fenced).toBe(profile === 'managed');
  });
}
test('managed schema4 refuses phase-only maintenance without changing canonical bytes', async () => {
  const proof = await createProfile('managed');
  await executeManagedCommand(proof.directory, { command: 'upgrade-maintenance' }, ports);
  const path = join(proof.directory, 'journal.json');
  const before = await readFile(path, 'utf8');
  const refused = await requireRejection(
    mutate(proof, { command: 'begin-maintenance', operationId: 'maintenance', kind: 'backup' }),
  );
  expect(String(refused.cause)).toContain(
    'Schema4 maintenance requires the verified maintenance session',
  );
  expect(await readFile(path, 'utf8')).toBe(before);
});

test('foundation read preserves permit entries outside its replacement namespace', async () => {
  const proof = await createProfile('foundation');
  const permit = join(proof.directory, `permit-${tokenPattern}`);
  await writeFile(permit, 'managed replacement evidence', { mode: 0o600 });
  const current = await executeFoundationCommand(proof.directory, { command: 'read' }, ports);
  expect(current.state.schemaVersion).toBe(1);
  expect(await readFile(permit, 'utf8')).toBe('managed replacement evidence');
});
