import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { executeRegistryCommand, type RegistryJournalPorts } from './registry-journal';
import type { RegistryPressureReport } from './registry-pressure-report';
import {
  createRegistryPressureReporter,
  readRegistryPressureReport,
} from './registry-pressure-report';
import { requireRejection } from './registry-rejection.fixture';
const GiB = 1024 ** 3;
const identity = { machineId: 'a'.repeat(32), bootId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
async function prepare() {
  const root = await scratchAsync('registry-pressure-report-');
  const directory = join(root, 'journal');
  const reports = join(root, 'reports');
  await mkdir(directory, { mode: 0o700 });
  await mkdir(reports, { mode: 0o700 });
  let usedBytes = GiB;
  let stamp = '2026-11-01T00:00:00.000Z';
  const ports: RegistryJournalPorts = {
    measureJournal: () =>
      Promise.resolve({
        usableBytes: GiB,
        allocationUnitBytes: 4096,
        usedBytes: 4096,
        totalInodes: 10000,
        usedInodes: 10,
      }),
    measureRegistry: () =>
      Promise.resolve({
        maximumBytes: 50 * GiB,
        usableBytes: 50 * GiB,
        usedBytes,
        totalInodes: 10000,
        usedInodes: 10,
        rootFreeBytes: 30 * GiB,
      }),
    now: () => stamp,
  };
  await executeRegistryCommand(
    directory,
    {
      command: 'initialize',
      enrollment: {
        registryId: 'proof',
        storageId: 'store',
        owners: ['owner'],
        registryPath: '/registry',
        rootPath: '/',
        maximumBytes: 50 * GiB,
        journalMaximumBytes: GiB,
      },
    },
    ports,
  );
  const cached = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  cached.measurement = { at: stamp, ...(await ports.measureRegistry(cached.enrollment)) };
  await writeFile(join(directory, 'journal.json'), JSON.stringify(cached), { mode: 0o600 });
  return {
    directory,
    reports,
    ports,
    setUsed: (bytes: number) => {
      usedBytes = bytes;
    },
    setTime: (at: string) => {
      stamp = at;
    },
  };
}
test('fresh report follows real capacity while healthy canonical bytes and revision stay unchanged', async () => {
  const fixture = await prepare();
  const before = await readFile(join(fixture.directory, 'journal.json'), 'utf8');
  const report = createRegistryPressureReporter(identity, { state: 'local-only' });
  await report(fixture.directory, fixture.ports, fixture.reports);
  fixture.setUsed(35 * GiB);
  fixture.setTime('2026-11-01T00:00:10.000Z');
  await report(fixture.directory, fixture.ports, fixture.reports);
  const observed = await readRegistryPressureReport(fixture.reports);
  if (observed.state !== 'reported') throw new Error('Expected report');
  expect(observed.report.measurement.usedBytes).toBe(35 * GiB);
  expect(observed.report.measurement.at).toBe('2026-11-01T00:00:10.000Z');
  expect(observed.report.pressure).toBe('warn');
  expect(observed.report.sequence).toBe(2);
  expect(await readFile(join(fixture.directory, 'journal.json'), 'utf8')).toBe(before);
  fixture.setUsed(45 * GiB);
  await report(fixture.directory, fixture.ports, fixture.reports);
  const cutoff = await readRegistryPressureReport(fixture.reports);
  if (cutoff.state !== 'reported') throw new Error('Expected cutoff');
  expect(cutoff.report.fenced).toBe(true);
  expect(cutoff.report.pressure).toBe('fenced');
});
test('each successful ten-second observation replaces the cache with newly measured success', async () => {
  const fixture = await prepare();
  const report = createRegistryPressureReporter(identity, { state: 'local-only' });
  await report(fixture.directory, fixture.ports, fixture.reports);
  const before = await readFile(join(fixture.reports, 'report.json'), 'utf8');
  fixture.setTime('2026-11-01T00:00:50.000Z');
  await report(fixture.directory, fixture.ports, fixture.reports);
  expect(await readFile(join(fixture.reports, 'report.json'), 'utf8')).not.toBe(before);
  fixture.setTime('2026-11-01T00:01:00.000Z');
  await report(fixture.directory, fixture.ports, fixture.reports);
  expect(await readFile(join(fixture.reports, 'report.json'), 'utf8')).not.toBe(before);
});
test('validated empty directory is never-reported; missing, malformed, unreadable and pending state throw distinctly', async () => {
  const fixture = await prepare();
  expect(await readRegistryPressureReport(fixture.reports)).toEqual({ state: 'never-reported' });
  expect(
    (await requireRejection(readRegistryPressureReport(join(fixture.reports, 'missing'))))
      .throwCause,
  ).toThrow();
  await writeFile(join(fixture.reports, 'report.json'), '{}', { mode: 0o600 });
  expect(
    (await requireRejection(readRegistryPressureReport(fixture.reports))).throwCause,
  ).toThrow();
  const { unlink } = await import('node:fs/promises');
  await unlink(join(fixture.reports, 'report.json'));
  await createRegistryPressureReporter(identity, { state: 'local-only' })(
    fixture.directory,
    fixture.ports,
    fixture.reports,
  );
  await chmod(join(fixture.reports, 'report.json'), 0o000);
  expect((await requireRejection(readRegistryPressureReport(fixture.reports))).cause).toMatchObject(
    { code: 'EACCES' },
  );
  await chmod(join(fixture.reports, 'report.json'), 0o600);
  await writeFile(join(fixture.reports, 'report.pending'), '', { mode: 0o600 });
  expect((await requireRejection(readRegistryPressureReport(fixture.reports))).throwCause).toThrow(
    'pending',
  );
});

test('failed capacity check preserves the previous observation instead of refreshing success', async () => {
  const fixture = await prepare();
  const report = createRegistryPressureReporter(identity, { state: 'local-only' });
  await report(fixture.directory, fixture.ports, fixture.reports);
  const before = await readFile(join(fixture.reports, 'report.json'), 'utf8');
  fixture.ports.measureRegistry = () => Promise.reject(new Error('measurement lost'));
  expect(
    (await requireRejection(report(fixture.directory, fixture.ports, fixture.reports))).throwCause,
  ).toThrow();
  expect(await readFile(join(fixture.reports, 'report.json'), 'utf8')).toBe(before);
});

for (const fault of [
  'directory-mode',
  'unknown-entry',
  'symlink',
  'hardlink',
  'oversized',
  'file-mode',
  'json',
  'schema',
] as const) {
  test(`report reader rejects actual ${fault} before accepting success`, async () => {
    const { link, symlink, unlink } = await import('node:fs/promises');
    const fixture = await prepare();
    const path = join(fixture.reports, 'report.json');
    await createRegistryPressureReporter(identity, { state: 'local-only' })(
      fixture.directory,
      fixture.ports,
      fixture.reports,
    );
    const valid = await readFile(path, 'utf8');
    if (fault === 'directory-mode') await chmod(fixture.reports, 0o755);
    if (fault === 'unknown-entry') await writeFile(join(fixture.reports, 'foreign'), '');
    if (fault === 'symlink' || fault === 'hardlink') {
      const outside = join(fixture.directory, 'outside');
      await writeFile(outside, valid, { mode: 0o600 });
      await unlink(path);
      if (fault === 'symlink') await symlink(outside, path);
      else await link(outside, path);
    }
    if (fault === 'oversized') await writeFile(path, valid + ' '.repeat(16385), { mode: 0o600 });
    if (fault === 'file-mode') await chmod(path, 0o644);
    if (fault === 'json') await writeFile(path, '{', { mode: 0o600 });
    if (fault === 'schema') await writeFile(path, '{}', { mode: 0o600 });
    expect(
      (await requireRejection(readRegistryPressureReport(fixture.reports))).throwCause,
    ).toThrow();
  });
}

test('report writer refuses unresolved replacement before creating a new success', async () => {
  const fixture = await prepare();
  await writeFile(join(fixture.reports, 'report.pending'), 'old', { mode: 0o600 });
  const report = createRegistryPressureReporter(identity, { state: 'local-only' });
  expect((await requireRejection(readRegistryPressureReport(fixture.reports))).throwCause).toThrow(
    'pending',
  );
  expect(
    (await requireRejection(report(fixture.directory, fixture.ports, fixture.reports))).throwCause,
  ).toThrow('pending');
  expect(await readFile(join(fixture.reports, 'report.pending'), 'utf8')).toBe('old');
  expect(await Bun.file(join(fixture.reports, 'report.json')).exists()).toBe(false);
});

for (const fault of ['bytes', 'inodes'] as const) {
  test(`modeled ${fault} exhaustion refuses report publication before creating a file`, async () => {
    const fixture = await prepare();
    const report = createRegistryPressureReporter(
      identity,
      { state: 'local-only' },
      {
        filesystem: () =>
          Promise.resolve({
            bsize: 4096n,
            blocks: 100000n,
            bfree: 50000n,
            bavail: fault === 'bytes' ? 0n : 50000n,
            files: 1000n,
            ffree: fault === 'inodes' ? 2n : 500n,
          }),
      },
    );
    let failure: unknown;
    try {
      await report(fixture.directory, fixture.ports, fixture.reports);
    } catch (cause) {
      failure = cause;
    }
    expect(await Bun.file(join(fixture.reports, 'report.json')).exists()).toBe(false);
    expect(await Bun.file(join(fixture.reports, 'report.pending')).exists()).toBe(false);
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error('Expected headroom failure');
    expect(failure.message).toContain('headroom');
  });
}

test('injected report sync failure closes and removes only its own pending replacement', async () => {
  const fixture = await prepare();
  const failure = new Error('report sync fault');
  const report = createRegistryPressureReporter(
    identity,
    { state: 'local-only' },
    {
      sync: () => Promise.reject(failure),
    },
  );
  expect(
    (await requireRejection(report(fixture.directory, fixture.ports, fixture.reports))).cause,
  ).toBe(failure);
  expect(await Bun.file(join(fixture.reports, 'report.json')).exists()).toBe(false);
  expect(await Bun.file(join(fixture.reports, 'report.pending')).exists()).toBe(false);
});

test('actual rename and cleanup EACCES retain both causes and leave no success', async () => {
  const fixture = await prepare();
  const report = createRegistryPressureReporter(
    identity,
    { state: 'local-only' },
    {
      sync: async (descriptor) => {
        await descriptor.sync();
        await chmod(fixture.reports, 0o500);
      },
    },
  );
  try {
    let failure: unknown;
    try {
      await report(fixture.directory, fixture.ports, fixture.reports);
    } catch (cause) {
      failure = cause;
    }
    expect(await Bun.file(join(fixture.reports, 'report.json')).exists()).toBe(false);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error('Expected dual failure');
    expect(failure.errors).toHaveLength(2);
    expect(failure.errors[0]).toMatchObject({ code: 'EACCES', syscall: 'rename' });
    expect(failure.errors[1]).toMatchObject({ code: 'EACCES', syscall: 'unlink' });
  } finally {
    await chmod(fixture.reports, 0o700);
  }
});

for (const fault of ['pressure', 'fence-reason', 'cutoff-without-fence'] as const) {
  test(`report rejects semantically inconsistent ${fault} with valid field schemas`, async () => {
    const fixture = await prepare();
    await createRegistryPressureReporter(identity, { state: 'local-only' })(
      fixture.directory,
      fixture.ports,
      fixture.reports,
    );
    const path = join(fixture.reports, 'report.json');
    const report = JSON.parse(await readFile(path, 'utf8')) as RegistryPressureReport;
    if (fault === 'pressure') report.pressure = 'warn';
    if (fault === 'fence-reason') report.reason = 'pressure';
    if (fault === 'cutoff-without-fence') {
      report.measurement.usedBytes = 45 * GiB;
      report.pressure = 'fenced';
    }
    await writeFile(path, JSON.stringify(report));
    expect(
      (await requireRejection(readRegistryPressureReport(fixture.reports))).throwCause,
    ).toThrow('Inconsistent pressure report');
  });
}

test('report timestamps cannot run backwards between capture and emission', async () => {
  const fixture = await prepare();
  let reads = 0;
  fixture.ports.now = () =>
    ++reads === 1 ? '2026-11-01T00:00:10.000Z' : '2026-11-01T00:00:05.000Z';
  expect(
    (
      await requireRejection(
        createRegistryPressureReporter(identity, { state: 'local-only' })(
          fixture.directory,
          fixture.ports,
          fixture.reports,
        ),
      )
    ).throwCause,
  ).toThrow();
  expect(await Bun.file(join(fixture.reports, 'report.json')).exists()).toBe(false);
});

test('actual local machine identity must match the installed expected machine', async () => {
  const { readRegistryPressureIdentity } = await import('./registry-pressure-report');
  expect(
    (await requireRejection(readRegistryPressureIdentity('not-a-machine'))).throwCause,
  ).toThrow('differs from installation');
});

for (const order of ['reversed-expanded-year', 'supported-expanded-year'] as const) {
  test(`actual reader enforces numeric capture ordering for ${order}`, async () => {
    const fixture = await prepare();
    await createRegistryPressureReporter(identity, { state: 'local-only' })(
      fixture.directory,
      fixture.ports,
      fixture.reports,
    );
    const path = join(fixture.reports, 'report.json');
    const report = JSON.parse(await readFile(path, 'utf8')) as RegistryPressureReport;
    report.measurement.at =
      order === 'reversed-expanded-year'
        ? '+010000-01-01T00:00:00.000Z'
        : '2026-11-01T00:00:00.000Z';
    report.emittedAt =
      order === 'reversed-expanded-year'
        ? '2026-11-01T00:00:00.000Z'
        : '+010000-01-01T00:00:00.000Z';
    await writeFile(path, JSON.stringify(report));
    if (order === 'reversed-expanded-year') {
      expect(
        (await requireRejection(readRegistryPressureReport(fixture.reports))).throwCause,
      ).toThrow();
    } else {
      const accepted = await readRegistryPressureReport(fixture.reports);
      expect(accepted.state).toBe('reported');
      if (accepted.state !== 'reported') throw new Error('Expected supported numeric ordering');
      expect(accepted.report.emittedAt).toBe('+010000-01-01T00:00:00.000Z');
    }
  });
}
