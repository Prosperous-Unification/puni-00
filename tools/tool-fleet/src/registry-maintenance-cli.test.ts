import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { parseRegistryCommandResponse } from './registry-journal';
import { parseRegistryMaintenanceResume } from './registry-maintenance-cli';
import type { RegistryPressureReport } from './registry-pressure-report';
import { requireRejection } from './registry-rejection.fixture';

test('recovery CLI requires an exact existing operation and explicit retry or restore mode', () => {
  expect(
    parseRegistryMaintenanceResume({ operationId: 'owned', kind: 'retirement', mode: 'restore' }),
  ).toEqual({ operationId: 'owned', kind: 'retirement', mode: 'restore' });
});
for (const fault of [
  {},
  { operationId: 'owned', kind: 'retirement', mode: 'restore', registryPath: '/arbitrary' },
  { operationId: 'owned', kind: 'retirement', mode: 'force' },
  { operationId: 'owned', kind: 'retirement', mode: 'restore', token: 'caller' },
]) {
  test(`recovery CLI rejects unknown or insufficient request fields: ${JSON.stringify(fault)}`, () => {
    expect(() => parseRegistryMaintenanceResume(fault)).toThrow();
  });
}

async function pressureFixture() {
  const { writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { initializeRegistryPressureFixture, registryPressureFixtureIdentity } =
    await import('./registry-pressure-report.fixture');
  const { createRegistryPressureReporter } = await import('./registry-pressure-report');
  const root = await scratchAsync('registry-pressure-status-');
  await writeFile(
    join(root, 'sample.json'),
    JSON.stringify({ usedBytes: 1024 ** 3, at: '2026-11-01T00:00:00.000Z' }),
  );
  const fixture = await initializeRegistryPressureFixture(root);
  await createRegistryPressureReporter(registryPressureFixtureIdentity, { state: 'local-only' })(
    fixture.directory,
    fixture.ports,
    fixture.reports,
  );
  return {
    ...fixture,
    root,
    identity: registryPressureFixtureIdentity,
    now: '2026-11-01T00:00:00.000Z',
    recoveryTarget: 'unenrolled' as const,
  };
}

test('actual status consumes fresh report with explicit unavailable physical and census dimensions', async () => {
  const { collectRegistryMaintenanceStatus } = await import('./registry-maintenance-cli');
  const status = await collectRegistryMaintenanceStatus(await pressureFixture());
  expect(status.pressure.state).toBe('fresh');
  expect(status.protectedContent).toEqual({
    state: 'unavailable',
    reason: 'fresh-complete-census-required',
  });
  expect(status.backup.state).toBe('unsupported-before-schema4');
  expect(status.physicalBackup).toEqual({
    state: 'unavailable',
    reason: 'physical-admission-closed',
  });
  expect(status.lastMaintenance.state).toBe('unavailable');
  expect(status.delivery.state).toBe('unverified');
});

for (const fault of [
  'stale',
  'clock',
  'machine',
  'boot',
  'storage',
  'registry',
  'path',
  'revision',
  'hash',
  'fence',
  'future',
  'schema',
] as const) {
  test(`status cannot refresh cached success after ${fault}`, async () => {
    const { readFile, writeFile, utimes } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { collectRegistryMaintenanceStatus } = await import('./registry-maintenance-cli');
    const fixture = await pressureFixture();
    const path = join(fixture.reports, 'report.json');
    const report = JSON.parse(await readFile(path, 'utf8')) as RegistryPressureReport;
    if (fault === 'stale') fixture.now = '2026-11-01T00:05:01.000Z';
    if (fault === 'clock') fixture.now = 'not-a-date';
    if (fault === 'machine') report.machineId = 'c'.repeat(32);
    if (fault === 'boot') report.bootId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    if (fault === 'storage') report.storageId = 'other';
    if (fault === 'registry') report.registryId = 'other';
    if (fault === 'path') report.registryPath = '/other';
    if (fault === 'revision') report.measurement.journalRevision += 1;
    if (fault === 'hash') report.journalSha256 = 'd'.repeat(64);
    if (fault === 'fence') {
      report.fenced = true;
      report.reason = 'pressure';
    }
    if (fault === 'future') report.emittedAt = '2026-11-01T00:00:01.000Z';
    if (fault === 'schema') report.sequence = 0;
    await writeFile(path, JSON.stringify(report));
    await utimes(path, new Date(), new Date());
    if (fault === 'future' || fault === 'schema' || fault === 'clock')
      expect(
        (await requireRejection(collectRegistryMaintenanceStatus(fixture))).throwCause,
      ).toThrow();
    else
      expect((await collectRegistryMaintenanceStatus(fixture)).pressure.state).toBe(
        fault === 'stale' || fault === 'boot' ? 'stale' : 'binding-mismatch',
      );
  });
}

test('valid report cannot hide corrupt canonical state or invent never-reported for absent runtime directory', async () => {
  const { writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { collectRegistryMaintenanceStatus } = await import('./registry-maintenance-cli');
  const fixture = await pressureFixture();
  await writeFile(join(fixture.directory, 'journal.json'), '{}');
  expect((await requireRejection(collectRegistryMaintenanceStatus(fixture))).throwCause).toThrow(
    'registry journal',
  );
});

test('status never creates an authority lock and empty cache stays explicitly never-reported', async () => {
  const { unlink } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { collectRegistryMaintenanceStatus } = await import('./registry-maintenance-cli');
  const fixture = await pressureFixture();
  await unlink(join(fixture.directory, 'authority.lock'));
  await unlink(join(fixture.reports, 'report.json'));
  expect((await collectRegistryMaintenanceStatus(fixture)).pressure.state).toBe('never-reported');
  expect(await Bun.file(join(fixture.directory, 'authority.lock')).exists()).toBe(false);
  expect(
    (
      await requireRejection(
        collectRegistryMaintenanceStatus({ ...fixture, reports: join(fixture.reports, 'absent') }),
      )
    ).throwCause,
  ).toThrow();
});

test('status output bound refuses a valid oversized canonical obligation list', async () => {
  const { readFile, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { collectRegistryMaintenanceStatus } = await import('./registry-maintenance-cli');
  const fixture = await pressureFixture();
  const path = join(fixture.directory, 'journal.json');
  const journal = parseRegistryCommandResponse({
    state: JSON.parse(await readFile(path, 'utf8')) as unknown,
  }).state;
  journal.protections = Array.from({ length: 600 }, (_, index) => ({
    operationId: `protection-${String(index)}`,
    owner: `owner-${String(index)}-${'x'.repeat(200)}`,
    token: '11111111-1111-4111-8111-111111111111',
    roots: ['sha256:' + 'a'.repeat(64)],
    references: [{ repository: 'repository', digest: 'sha256:' + 'a'.repeat(64) }],
    reason: 'pin',
  }));
  journal.enrollment.owners = [
    'owner',
    ...journal.protections.map((protection: { owner: string }) => protection.owner),
  ];
  await writeFile(path, JSON.stringify(journal));
  expect((await requireRejection(collectRegistryMaintenanceStatus(fixture))).throwCause).toThrow(
    'status exceeds output bound',
  );
});

test('backup age comes from original verified receipt and future verification throws', async () => {
  const { readFile, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { executeRegistryCommand } = await import('./registry-journal');
  const { collectRegistryMaintenanceStatus } = await import('./registry-maintenance-cli');
  const fixture = await pressureFixture();
  await executeRegistryCommand(
    fixture.directory,
    { command: 'upgrade-maintenance' },
    fixture.ports,
  );
  const path = join(fixture.directory, 'journal.json');
  const journal = parseRegistryCommandResponse({
    state: JSON.parse(await readFile(path, 'utf8')) as unknown,
  }).state;
  if (journal.schemaVersion !== 4) throw new Error('Expected maintenance journal');
  journal.lastVerifiedBackup = {
    snapshotId: 'a'.repeat(64),
    verifiedAt: '2026-11-01T00:00:00.000Z',
    registryId: 'proof',
    storageId: 'old-store',
    registryPath: '/old-registry',
    journalPath: fixture.directory,
    journalRevision: 0,
    journalSha256: 'a'.repeat(64),
    censusSha256: 'a'.repeat(64),
    bytes: 1,
  };
  await writeFile(path, JSON.stringify(journal));
  fixture.now = '2026-11-01T00:05:01.000Z';
  const before = (await collectRegistryMaintenanceStatus(fixture)).backup;
  expect(before).toMatchObject({ state: 'verified', lineage: 'historical-store', ageSeconds: 301 });
  journal.lastVerifiedBackup.verifiedAt = '2026-11-01T00:06:00.000Z';
  await writeFile(path, JSON.stringify(journal));
  expect((await requireRejection(collectRegistryMaintenanceStatus(fixture))).throwCause).toThrow(
    'Backup verification is from the future',
  );
});

for (const future of ['measurement-and-emission', 'emission-only'] as const) {
  test(`status rejects expanded-year future ${future} after actual reader accepts numeric ordering`, async () => {
    const { readFile, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { collectRegistryMaintenanceStatus } = await import('./registry-maintenance-cli');
    const { readRegistryPressureReport } = await import('./registry-pressure-report');
    const fixture = await pressureFixture();
    const path = join(fixture.reports, 'report.json');
    const report = JSON.parse(await readFile(path, 'utf8')) as RegistryPressureReport;
    if (future === 'measurement-and-emission')
      report.measurement.at = '+010000-01-01T00:00:00.000Z';
    report.emittedAt = '+010000-01-01T00:00:00.000Z';
    await writeFile(path, JSON.stringify(report));
    expect((await readRegistryPressureReport(fixture.reports)).state).toBe('reported');
    expect((await requireRejection(collectRegistryMaintenanceStatus(fixture))).throwCause).toThrow(
      'Pressure observation is from the future',
    );
  });
}

test('reservation summary exposes empty count and totals separately from measured usage', async () => {
  const { collectRegistryMaintenanceStatus } = await import('./registry-maintenance-cli');
  const status = await collectRegistryMaintenanceStatus(await pressureFixture());
  expect(status.reservations).toEqual({ count: 0, bytes: 0, inodes: 0, entries: [] });
  expect(status.pressure.state).toBe('fresh');
  if (status.pressure.state !== 'fresh') throw new Error('Expected fresh capacity');
  expect(status.pressure.report.measurement.usedBytes).toBe(1024 ** 3);
});

test('reservation summary preserves populated exact safe-integer amounts without adding physical usage', async () => {
  const { readFile, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { executeRegistryCommand } = await import('./registry-journal');
  const { collectRegistryMaintenanceStatus } = await import('./registry-maintenance-cli');
  const { createRegistryPressureReporter } = await import('./registry-pressure-report');
  const fixture = await pressureFixture();
  const digest = 'sha256:' + 'a'.repeat(64);
  await executeRegistryCommand(
    fixture.directory,
    {
      command: 'reserve-publication',
      expectedRevision: 0,
      operationId: 'reserved',
      owner: 'owner',
      product: 'proof',
      roots: [digest],
      references: [{ repository: 'repository', digest }],
      envelope: { bytes: 123456789, inodes: 321 },
    },
    fixture.ports,
  );
  await createRegistryPressureReporter(fixture.identity, { state: 'local-only' })(
    fixture.directory,
    fixture.ports,
    fixture.reports,
  );
  let status = await collectRegistryMaintenanceStatus(fixture);
  expect(status.reservations).toEqual({
    count: 1,
    bytes: 123456789,
    inodes: 321,
    entries: [{ operationId: 'reserved', bytes: 123456789, inodes: 321 }],
  });
  if (status.pressure.state !== 'fresh') throw new Error('Expected fresh capacity');
  expect(status.pressure.report.measurement.usedBytes).toBe(1024 ** 3);
  const path = join(fixture.directory, 'journal.json');
  const journal = parseRegistryCommandResponse({
    state: JSON.parse(await readFile(path, 'utf8')) as unknown,
  }).state;
  for (const reservation of journal.reservations) {
    reservation.bytes = Number.MAX_SAFE_INTEGER;
    reservation.inodes = Number.MAX_SAFE_INTEGER;
  }
  await writeFile(path, JSON.stringify(journal));
  status = await collectRegistryMaintenanceStatus(fixture);
  expect(status.reservations).toMatchObject({
    count: 1,
    bytes: Number.MAX_SAFE_INTEGER,
    inodes: Number.MAX_SAFE_INTEGER,
  });
});

for (const lineage of ['current-store', 'historical-store'] as const) {
  test(`verified backup exposes original ${lineage} identity and keeps age after actual operation failure`, async () => {
    const { readFile, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { executeRegistryCommand, runRegistryMaintenance } = await import('./registry-journal');
    const { collectRegistryMaintenanceStatus } = await import('./registry-maintenance-cli');
    const fixture = await pressureFixture();
    await executeRegistryCommand(
      fixture.directory,
      { command: 'upgrade-maintenance' },
      fixture.ports,
    );
    const path = join(fixture.directory, 'journal.json');
    const journal = parseRegistryCommandResponse({
      state: JSON.parse(await readFile(path, 'utf8')) as unknown,
    }).state;
    if (journal.schemaVersion !== 4) throw new Error('Expected maintenance journal');
    const source =
      lineage === 'current-store'
        ? { registryId: 'proof', storageId: 'store', registryPath: '/registry' }
        : {
            registryId: 'original-proof',
            storageId: 'original-store',
            registryPath: '/original-registry',
          };
    journal.lastVerifiedBackup = {
      snapshotId: 'a'.repeat(64),
      verifiedAt: '2026-11-01T00:00:00.000Z',
      ...source,
      journalPath: fixture.directory,
      journalRevision: 0,
      journalSha256: 'a'.repeat(64),
      censusSha256: 'a'.repeat(64),
      bytes: 1,
    };
    await writeFile(path, JSON.stringify(journal));
    fixture.now = '2026-11-01T00:05:01.000Z';
    const before = (await collectRegistryMaintenanceStatus(fixture)).backup;
    expect(before).toMatchObject({
      state: 'verified',
      lineage,
      ...source,
      verifiedAt: '2026-11-01T00:00:00.000Z',
      ageSeconds: 301,
    });
    fixture.ports.now = () => '2026-11-01T00:04:00.000Z';
    expect(
      (
        await requireRejection(
          runRegistryMaintenance(
            fixture.directory,
            { operationId: 'backup-failed', owner: 'owner', kind: 'backup', recover: false },
            fixture.ports,
            () => Promise.reject(new Error('backup failed')),
          ),
        )
      ).throwCause,
    ).toThrow('backup failed');
    const after = await collectRegistryMaintenanceStatus(fixture);
    expect(after.operation?.phase).toBe('failed');
    expect(after.backup).toEqual(before);
  });
}
