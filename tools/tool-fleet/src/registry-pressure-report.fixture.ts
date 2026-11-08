import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import { collectRegistryMaintenanceStatus } from './registry-maintenance-cli';
import {
  executeRegistryCommand,
  type RegistryJournalPorts,
  runRegistryMaintenance,
} from './registry-managed-journal';
import { monitorRegistryPressure } from './registry-managed-journal-cli';
import { createRegistryPressureReporter } from './registry-pressure-report';

export const registryPressureFixtureIdentity = {
  machineId: 'a'.repeat(32),
  bootId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};
const GiB = 1024 ** 3;
const Sample = type({ usedBytes: 'number.safe >= 0', at: 'string', '+': 'reject' });
/** Ordinary test-only measured boundary; no installed host, mount or notification proof. */
export async function createRegistryPressureFixture(root: string) {
  const directory = join(root, 'journal');
  const reports = join(root, 'reports');
  let sample = Sample.assert(JSON.parse(await readFile(join(root, 'sample.json'), 'utf8')));
  const ports: RegistryJournalPorts = {
    now: () => sample.at,
    measureJournal: () =>
      Promise.resolve({
        usableBytes: GiB,
        allocationUnitBytes: 4096,
        usedBytes: 4096,
        totalInodes: 10000,
        usedInodes: 10,
      }),
    measureRegistry: async () => {
      sample = Sample.assert(JSON.parse(await readFile(join(root, 'sample.json'), 'utf8')));
      return {
        maximumBytes: 50 * GiB,
        usableBytes: 50 * GiB,
        usedBytes: sample.usedBytes,
        totalInodes: 10000,
        usedInodes: 10,
        rootFreeBytes: 30 * GiB,
      };
    },
  };
  return { directory, reports, ports, readTime: () => sample.at };
}
export async function initializeRegistryPressureFixture(root: string) {
  const fixture = await createRegistryPressureFixture(root);
  await mkdir(fixture.directory, { mode: 0o700 });
  await mkdir(fixture.reports, { mode: 0o700 });
  await executeRegistryCommand(
    fixture.directory,
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
    fixture.ports,
  );
  return fixture;
}
if (import.meta.main) {
  const root = process.argv.at(2);
  const mode = process.argv.at(3);
  if (root === undefined) throw new Error('Fixture root required');
  const fixture = await createRegistryPressureFixture(root);
  if (mode === 'monitor') {
    await monitorRegistryPressure(
      fixture.directory,
      fixture.ports,
      fixture.reports,
      registryPressureFixtureIdentity,
      { state: 'local-only' },
    );
  } else if (mode === 'status') {
    console.log(
      JSON.stringify(
        await collectRegistryMaintenanceStatus({
          directory: fixture.directory,
          reports: fixture.reports,
          identity: registryPressureFixtureIdentity,
          now: fixture.readTime(),
          recoveryTarget: 'unenrolled',
        }),
      ),
    );
  } else if (mode === 'hold') {
    await executeRegistryCommand(
      fixture.directory,
      { command: 'upgrade-maintenance' },
      fixture.ports,
    );
    await runRegistryMaintenance(
      fixture.directory,
      { operationId: 'held', owner: 'owner', kind: 'backup', recover: false },
      fixture.ports,
      async () => {
        console.log('held');
        await Bun.stdin.text();
        throw new Error('Fixture hold ended');
      },
    );
  } else if (mode === 'alerts') {
    const { initializeRegistryAlertFixture } = await import('./registry-alert.fixture');
    const { captureRegistryPressureAlert } = await import('./registry-alert-store');
    const context = await initializeRegistryAlertFixture(root);
    await createRegistryPressureReporter(registryPressureFixtureIdentity, {
      state: 'required',
      capture: (report) => captureRegistryPressureAlert(context, report),
    })(fixture.directory, fixture.ports, fixture.reports);
  } else if (mode === 'produce' || mode === 'produce-wait') {
    await createRegistryPressureReporter(registryPressureFixtureIdentity, { state: 'local-only' })(
      fixture.directory,
      fixture.ports,
      fixture.reports,
    );
    console.log('reported');
    if (mode === 'produce-wait') await Bun.stdin.text();
  } else throw new Error('Unknown fixture action');
}
