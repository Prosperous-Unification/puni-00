import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { createRegistryPressureReporter } from './registry-pressure-report';
import {
  initializeRegistryPressureFixture,
  registryPressureFixtureIdentity,
} from './registry-pressure-report.fixture';
import { requireRejection } from './registry-rejection.fixture';

test('actual reporter captures warning before publishing its replaceable report and propagates capture failure', async () => {
  const root = await scratchAsync('registry-alert-capture-');
  await writeFile(
    join(root, 'sample.json'),
    JSON.stringify({ usedBytes: 35 * 1024 ** 3, at: '2026-11-01T00:00:00.000Z' }),
  );
  const fixture = await initializeRegistryPressureFixture(root);
  const captured: string[] = [];
  const reporter = createRegistryPressureReporter(registryPressureFixtureIdentity, {
    state: 'required',
    capture: (report) => {
      captured.push(report.pressure);
      return Promise.reject(new Error('durable capture failed'));
    },
  });
  expect(
    (await requireRejection(reporter(fixture.directory, fixture.ports, fixture.reports)))
      .throwCause,
  ).toThrow('durable capture failed');
  expect(captured).toEqual(['warn']);
  expect(await Bun.file(join(fixture.reports, 'report.json')).exists()).toBe(false);
});

import { initializeRegistryAlertFixture } from './registry-alert.fixture';
import { readRegistryAlertSnapshot } from './registry-alert-store';
import * as maintenance from './registry-maintenance-cli';
import { executeRegistryCommand, runRegistryMaintenance } from './registry-managed-journal';

test('common ordinary maintenance boundary captures crash-before-enqueue failure before retry can clear it', async () => {
  const root = await scratchAsync('registry-alert-maintenance-');
  await writeFile(
    join(root, 'sample.json'),
    JSON.stringify({ usedBytes: 1024 ** 3, at: '2026-11-01T00:00:00.000Z' }),
  );
  const source = await initializeRegistryPressureFixture(root),
    context = await initializeRegistryAlertFixture(root);
  await executeRegistryCommand(source.directory, { command: 'upgrade-maintenance' }, source.ports);
  expect(
    (
      await requireRejection(
        runRegistryMaintenance(
          source.directory,
          { operationId: 'failed-backup', owner: 'owner', kind: 'backup', recover: false },
          source.ports,
          () => Promise.reject(new Error('backup broken')),
        ),
      )
    ).throwCause,
  ).toThrow('backup broken');
  let observedBeforeRetry = -1;
  const retryFailure = new Error('modeled retry failed');
  const refusal = await requireRejection(
    maintenance.withRegistryMaintenanceAlertCapture({ directory: source.directory, context }, () =>
      runRegistryMaintenance(
        source.directory,
        { operationId: 'failed-backup', owner: 'owner', kind: 'backup', recover: true },
        source.ports,
        async () => {
          const snapshot = await readRegistryAlertSnapshot(context);
          observedBeforeRetry = snapshot.events.length;
          throw retryFailure;
        },
      ),
    ),
  );
  expect(observedBeforeRetry).toBe(1);
  expect(refusal.cause).toBe(retryFailure);
  expect((await readRegistryAlertSnapshot(context)).events).toHaveLength(2);
});

for (const kind of ['backup', 'retirement'] as const) {
  test(`ordinary ${kind} failure preserves primary error and captures truthful canonical owner scope`, async () => {
    const root = await scratchAsync('registry-alert-owning-failure-');
    await writeFile(
      join(root, 'sample.json'),
      JSON.stringify({ usedBytes: 1024 ** 3, at: '2026-11-01T00:00:00.000Z' }),
    );
    const source = await initializeRegistryPressureFixture(root),
      context = await initializeRegistryAlertFixture(root);
    await executeRegistryCommand(
      source.directory,
      { command: 'upgrade-maintenance' },
      source.ports,
    );
    const primary = new Error('original maintenance failure');
    const failure = await requireRejection(
      maintenance.withRegistryMaintenanceAlertCapture(
        { directory: source.directory, context },
        () =>
          runRegistryMaintenance(
            source.directory,
            { operationId: `failed-${kind}`, owner: 'owner', kind, recover: false },
            source.ports,
            () => Promise.reject(primary),
          ),
      ),
    );
    expect(failure.cause).toBe(primary);
    const snapshot = await readRegistryAlertSnapshot(context);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]).toMatchObject({
      kind: kind === 'backup' ? 'backup-failure' : 'cleanup-failure',
      capacity: { state: 'unavailable' },
      owners: { scope: 'explicit-canonical-obligations', count: 0, omitted: 0 },
    });
  });
}

test('ordinary failure before canonical acquisition creates typed launcher failure with unavailable evidence', async () => {
  const root = await scratchAsync('registry-alert-launcher-failure-');
  await writeFile(
    join(root, 'sample.json'),
    JSON.stringify({ usedBytes: 1024 ** 3, at: '2026-11-01T00:00:00.000Z' }),
  );
  const source = await initializeRegistryPressureFixture(root),
    context = await initializeRegistryAlertFixture(root),
    primary = new Error('pre-acquisition failure');
  const failure = await requireRejection(
    maintenance.withRegistryMaintenanceAlertCapture(
      { directory: source.directory, context, now: () => '2026-11-01T00:00:00.000Z' },
      () => Promise.reject(primary),
    ),
  );
  expect(failure.cause).toBe(primary);
  expect((await readRegistryAlertSnapshot(context)).events[0]).toMatchObject({
    kind: 'launcher-failure',
    capacity: { state: 'unavailable' },
    owners: { scope: 'unavailable', count: 0 },
  });
});

test('capture failure preserves both primary maintenance error and durable outbox failure', async () => {
  const root = await scratchAsync('registry-alert-dual-failure-');
  await writeFile(
    join(root, 'sample.json'),
    JSON.stringify({ usedBytes: 1024 ** 3, at: '2026-11-01T00:00:00.000Z' }),
  );
  const source = await initializeRegistryPressureFixture(root),
    context = await initializeRegistryAlertFixture(root),
    primary = new Error('primary maintenance failure');
  const capture = new Error('capture storage failure');
  const failure = await requireRejection(
    maintenance.withRegistryMaintenanceAlertCapture(
      { directory: source.directory, context },
      () => {
        context.io!.sync = () => Promise.reject(capture);
        return Promise.reject(primary);
      },
    ),
  );
  expect(failure.cause).toBeInstanceOf(AggregateError);
  const causes = (failure.cause as AggregateError).errors as unknown[];
  expect(causes[0]).toBe(primary);
  expect(causes[1]).toBeInstanceOf(AggregateError);
  expect((causes[1] as AggregateError).errors).toEqual([capture, capture]);
});

test('periodic sender recovers a killed producer failure without maintenance retry or repeated effects', async () => {
  const root = await scratchAsync('registry-alert-killed-maintenance-');
  await writeFile(
    join(root, 'sample.json'),
    JSON.stringify({ usedBytes: 1024 ** 3, at: '2026-11-01T00:00:00.000Z' }),
  );
  const source = await initializeRegistryPressureFixture(root),
    context = await initializeRegistryAlertFixture(root);
  const producer = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, 'registry-alert.fixture.ts'),
      root,
      'fail-before-enqueue',
    ],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  const reader = producer.stdout.getReader();
  try {
    const ready = await Promise.race([
      reader.read(),
      Bun.sleep(3000).then(() => {
        throw new Error('Producer did not reach durable failure');
      }),
    ]);
    expect(new TextDecoder().decode(ready.value)).toContain('failure-persisted');
  } finally {
    reader.releaseLock();
    if (producer.exitCode === null) producer.kill('SIGKILL');
    await producer.exited;
  }
  expect(producer.exitCode).not.toBe(0);
  expect((await readRegistryAlertSnapshot(context)).events).toHaveLength(0);
  const received: string[] = [];
  const receiver = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      received.push(await request.text());
      return new Response('ok');
    },
  });
  try {
    const runSender = async (stamp: string) => {
      await writeFile(
        join(root, 'receiver.json'),
        JSON.stringify({ url: `http://127.0.0.1:${String(receiver.port)}`, now: stamp }),
      );
      const sender = Bun.spawn(
        [process.execPath, join(import.meta.dir, 'registry-alert.fixture.ts'), root, 'send'],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      expect(await sender.exited).toBe(0);
    };
    await runSender('2026-11-01T00:00:00.000Z');
    expect(received).toHaveLength(1);
    expect(received[0]).toContain('backup-failure');
    const first = (await readRegistryAlertSnapshot(context)).events[0];
    const { readRegistryJournalSnapshot } = await import('./registry-managed-journal');
    const current = await readRegistryJournalSnapshot(source.directory);
    // Model an unrelated trusted revision update without replacing the durable operation or its attempt identity.
    current.revision += 1;
    current.updatedAt = '2026-11-01T00:00:01.000Z';
    await writeFile(join(source.directory, 'journal.json'), JSON.stringify(current));
    await runSender('2026-11-01T00:00:02.000Z');
    expect(received).toHaveLength(1);
    expect((await readRegistryAlertSnapshot(context)).events[0]).toEqual(first);
    expect(await readFile(join(root, 'effect-count'), 'utf8')).toBe('1');
  } finally {
    await receiver.stop(true);
  }
});
