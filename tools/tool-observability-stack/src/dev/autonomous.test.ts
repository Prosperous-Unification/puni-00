import { expect, test } from 'bun:test';

import {
  createStorageReader,
  encodeHealthMetrics,
  type HealthCheckpoint,
  parseStorage,
  writeHealthCheckpoint,
} from './autonomous';

const complete = { state: 'complete' as const, signals: { log: [], metric: [], trace: [] } };
const application = {
  state: 'incomplete' as const,
  reason: 'unsupported' as const,
  checkedAt: 100000,
  containerId: 'd'.repeat(64),
  accepted: 2,
  unsupported: 1,
  invalid: 0,
};

test('health metrics emit every state/reason including zero and never raw observation IDs/errors', () => {
  const encoded = encodeHealthMetrics({
    checkedAt: 100000,
    observationId: 'private-observation-id',
    health: {
      state: 'incomplete',
      signals: { log: ['unavailable: secret-error'], metric: [], trace: [] },
    },
    application,
    storage: { state: 'unavailable', reason: 'source-unavailable', checkedAt: 100000 },
  });
  const metrics = encoded.resourceMetrics[0].scopeMetrics[0].metrics;
  expect(JSON.stringify(encoded)).not.toContain('private-observation-id');
  expect(JSON.stringify(encoded)).not.toContain('secret-error');
  expect(
    metrics
      .find((metric) => metric.name === 'puni_dev_observation_health')
      ?.gauge.dataPoints.map((point) => point.asDouble),
  ).toEqual([0, 1, 0, 0]);
  expect(
    metrics.find((metric) => metric.name === 'puni_dev_observation_checked_timestamp_seconds')
      ?.gauge.dataPoints[0].asDouble,
  ).toBe(100);
  expect(
    metrics
      .find((metric) => metric.name === 'puni_dev_application_log_collection_state')
      ?.gauge.dataPoints.map((point) => point.asDouble),
  ).toEqual([0, 1, 0]);
  expect(metrics.some((metric) => metric.name === 'puni_dev_storage_available_bytes')).toBe(false);
});

test('actual storage reading publishes measured bytes/time and rejects malformed impossible df output', () => {
  const storage = parseStorage(
    'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda1 1000 500 500 50% /\n',
    100000,
  );
  expect(storage.state).toBe('complete');
  const encoded = encodeHealthMetrics({
    checkedAt: 100000,
    observationId: null,
    health: complete,
    application,
    storage,
  });
  const metrics = encoded.resourceMetrics[0].scopeMetrics[0].metrics;
  expect(
    metrics.find((metric) => metric.name === 'puni_dev_storage_available_bytes')?.gauge
      .dataPoints[0].asDouble,
  ).toBe(512000);
  expect(
    metrics.find((metric) => metric.name === 'puni_dev_storage_capacity_bytes')?.gauge.dataPoints[0]
      .asDouble,
  ).toBe(1024000);
  expect(
    metrics.find((metric) => metric.name === 'puni_dev_storage_observed_timestamp_seconds')?.gauge
      .dataPoints[0].asDouble,
  ).toBe(100);
  for (const text of [
    '',
    'bad',
    'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda1 1000 500 500 50% /\nextra',
    'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda1 100 0 500 0% /\n',
  ])
    expect(() => parseStorage(text, 100000)).toThrow();
});

test('actual CLI once publishes shared health checkpoint and explicit collection states without rehearsal live claims', async () => {
  const { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } =
    await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'puni-autonomous-cli-'));
  const executablePath = process.env['PATH'];
  if (executablePath === undefined) throw new Error('PATH is required for subprocess fixtures');
  writeFileSync(
    join(directory, 'ssh'),
    `#!${process.execPath}\nimport {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(join(directory, 'ssh-called'))},'called');process.exit(91);`,
  );
  chmodSync(join(directory, 'ssh'), 0o700);
  const batches: string[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === '/health')
        return Response.json({ status: 'ok', commit: 'a'.repeat(40) });
      batches.push(await request.text());
      return Response.json({});
    },
  });
  try {
    const endpoint = `http://127.0.0.1:${String(server.port)}`;
    const child = Bun.spawn(
      [
        process.execPath,
        new URL('./probe-cli.ts', import.meta.url).pathname,
        '--local',
        `${endpoint}/health`,
        '--otlp',
        endpoint,
        '--version',
        'test',
        '--checkpoint',
        join(directory, 'observation.json'),
        '--initialize',
        '--once',
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, PATH: `${directory}:${executablePath}` },
      },
    );
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
    const checkpoint = JSON.parse(
      readFileSync(join(directory, 'observation.json.health'), 'utf8'),
    ) as HealthCheckpoint;
    expect(existsSync(join(directory, 'ssh-called'))).toBe(false);
    expect(
      batches
        .filter((batch) => batch.includes('puni_resource_collection_state'))
        .every((batch) => !batch.includes('puni_resource_host_memory')),
    ).toBe(true);
    expect(checkpoint.health.state).toBe('incomplete');
    expect(checkpoint.application.state).toBe('unavailable');
    expect(checkpoint.storage.state).toBe('unavailable');
    expect(checkpoint).toMatchObject({
      resources: { state: 'unavailable', reason: 'source-unavailable' },
    });
    expect(batches.some((batch) => batch.includes('puni_resource_collection_state'))).toBe(true);
    expect(batches.some((batch) => batch.includes('puni_dev_observation_health'))).toBe(true);
  } finally {
    await server.stop(true);
    rmSync(directory, { recursive: true });
  }
});

test('health checkpoint is atomically replaced and oversized evidence preserves the previous checkpoint', async () => {
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'puni-health-checkpoint-'));
  try {
    const checkpoint: HealthCheckpoint = {
      checkedAt: 100000,
      observationId: null,
      health: complete,
      application,
      storage: { state: 'unavailable', reason: 'source-unavailable', checkedAt: 100000 },
    };
    const path = join(directory, 'health.json');
    writeHealthCheckpoint(path, checkpoint);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(checkpoint);
    expect(() => {
      writeHealthCheckpoint(path, {
        ...checkpoint,
        health: {
          state: 'incomplete',
          signals: { log: ['x'.repeat(8192)], metric: [], trace: [] },
        },
      });
    }).toThrow('size bound');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(checkpoint);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('actual storage SSH fixture reports bounded malformed output, command failure and cancellation independently', async () => {
  const { chmodSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'puni-storage-source-'));
  try {
    for (const fault of ['none', 'oversized', 'exit', 'blocked'] as const) {
      const path = join(directory, fault);
      writeFileSync(
        path,
        `#!/usr/bin/env bun\nif(!Bun.argv.includes('h3mon')||!Bun.argv.some(arg=>arg.includes('df -Pk /var/lib/docker')))throw new Error('foreign source');\nif(${JSON.stringify(fault)}==='exit')process.exit(1);\nif(${JSON.stringify(fault)}==='blocked')await Bun.sleep(1000);\nif(${JSON.stringify(fault)}==='oversized')console.log('x'.repeat(32769));else console.log('Filesystem 1024-blocks Used Available Capacity Mounted on\\n/dev/vda1 1000 500 500 50% /\\n'+Math.floor(Date.now()/1000));\n`,
      );
      chmodSync(path, 0o700);
      const reading = await createStorageReader(path)(
        fault === 'blocked' ? AbortSignal.timeout(40) : new AbortController().signal,
      );
      expect(reading.state).toBe(fault === 'none' ? 'complete' : 'unavailable');
      if (reading.state === 'unavailable')
        expect(reading.reason).toBe(
          fault === 'oversized'
            ? 'invalid-reading'
            : fault === 'blocked'
              ? 'deadline'
              : 'source-unavailable',
        );
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});

async function readStorageFixture(stdout: string) {
  const { chmodSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'puni-storage-header-'));
  try {
    const path = join(directory, 'ssh');
    writeFileSync(
      path,
      `#!/usr/bin/env bun\nif(!Bun.argv.includes('h3mon')||!Bun.argv.some(arg=>arg.includes('df -Pk /var/lib/docker')))throw new Error('foreign source');\nconsole.log(${JSON.stringify(stdout)});\n`,
    );
    chmodSync(path, 0o700);
    return await createStorageReader(path)(new AbortController().signal);
  } finally {
    rmSync(directory, { recursive: true });
  }
}

test('actual padded df header survives the production SSH reader while ordered header tokens remain required', async () => {
  const observedSeconds = Math.floor(Date.now() / 1000);
  const body = `/dev/sda1 157149496 23500788 127227868 16% /\n${String(observedSeconds)}`;
  const reading = await readStorageFixture(
    `Filesystem     1024-blocks     Used Available Capacity Mounted on\n${body}`,
  );
  expect(reading).toMatchObject({
    state: 'complete',
    observedAt: observedSeconds * 1000,
    availableBytes: 127227868 * 1024,
    capacityBytes: 157149496 * 1024,
  });
  for (const header of [
    'Filesystem 1024-blocks Available Used Capacity Mounted on',
    'Filesystem 1024-blocks Used Available Capacity Mounted',
  ]) {
    expect((await readStorageFixture(`${header}\n${body}`)).state).toBe('unavailable');
  }
});

test('production storage reader rejects just-next-second remote time with otherwise valid source evidence', async () => {
  const clock = Date.now();
  const nextSecond = Math.floor(clock / 1000) + 1;
  const originalClock = Date.now;
  Date.now = () => clock;
  try {
    const reading = await readStorageFixture(
      `Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 157149496 23500788 127227868 16% /\n${String(nextSecond)}`,
    );
    expect(reading).toMatchObject({ state: 'unavailable', reason: 'invalid-reading' });
  } finally {
    Date.now = originalClock;
  }
});
