import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { expect, test } from 'bun:test';

import type { RegistryPressureReport } from './registry-pressure-report';
import { initializeRegistryPressureFixture } from './registry-pressure-report.fixture';
import { readRegistryBytes } from './registry-stream';

const WorkerStatus = type({
  pressure: { state: 'string', '+': 'ignore' },
  operation: type({ operationId: 'string', '+': 'ignore' }).or('null'),
  '+': 'ignore',
});
function launch(root: string, mode: string) {
  return Bun.spawn(
    [process.execPath, join(import.meta.dir, 'registry-pressure-report.fixture.ts'), root, mode],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
}
async function finish(child: ReturnType<typeof launch>) {
  const output = readRegistryBytes(child.stdout, 65536, 'Pressure fixture stdout');
  const diagnostic = readRegistryBytes(child.stderr, 65536, 'Pressure fixture stderr');
  try {
    const [code, bytes, errors] = await Promise.all([child.exited, output, diagnostic]);
    return {
      code,
      text: new TextDecoder().decode(bytes),
      diagnostic: new TextDecoder().decode(errors),
    };
  } catch (cause) {
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
    await Promise.allSettled([output, diagnostic]);
    throw cause;
  }
}
async function ready(child: ReturnType<typeof launch>) {
  const reader = child.stdout.getReader();
  try {
    const first = await reader.read();
    if (first.done) throw new Error('Missing process readiness');
    return new TextDecoder().decode(first.value);
  } finally {
    reader.releaseLock();
  }
}
async function fixture() {
  const root = await scratchAsync('registry-pressure-process-');
  await writeFile(
    join(root, 'sample.json'),
    JSON.stringify({ usedBytes: 35 * 1024 ** 3, at: '2026-11-01T00:00:00.000Z' }),
  );
  return { root, ...(await initializeRegistryPressureFixture(root)) };
}

test('separate producer and actual status consumer observe warning, cutoff and killed-producer staleness', async () => {
  const prepared = await fixture();
  const producer = launch(prepared.root, 'produce-wait');
  try {
    expect(await ready(producer)).toContain('reported');
    let consumed = await finish(launch(prepared.root, 'status'));
    expect(consumed.code).toBe(0);
    expect(WorkerStatus.assert(JSON.parse(consumed.text)).pressure.state).toBe('fresh');
    producer.kill('SIGKILL');
    await producer.exited;
    await writeFile(
      join(prepared.root, 'sample.json'),
      JSON.stringify({ usedBytes: 35 * 1024 ** 3, at: '2026-11-01T00:05:01.000Z' }),
    );
    consumed = await finish(launch(prepared.root, 'status'));
    expect(consumed.code).toBe(0);
    expect(WorkerStatus.assert(JSON.parse(consumed.text)).pressure.state).toBe('stale');
    await writeFile(
      join(prepared.root, 'sample.json'),
      JSON.stringify({ usedBytes: 45 * 1024 ** 3, at: '2026-11-01T00:05:01.000Z' }),
    );
    expect((await finish(launch(prepared.root, 'produce'))).code).toBe(0);
    const report = JSON.parse(
      await readFile(join(prepared.reports, 'report.json'), 'utf8'),
    ) as RegistryPressureReport;
    expect(report.pressure).toBe('fenced');
    expect(report.fenced).toBe(true);
  } finally {
    if (producer.exitCode === null) producer.kill('SIGKILL');
    await finish(producer);
  }
});

test('status remains read-only under actual held maintenance authority and rejects corrupt canonical bytes', async () => {
  const prepared = await fixture();
  expect((await finish(launch(prepared.root, 'produce'))).code).toBe(0);
  const holder = launch(prepared.root, 'hold');
  try {
    expect(await ready(holder)).toContain('held');
    const before = await readFile(join(prepared.directory, 'journal.json'), 'utf8');
    const consumed = await finish(launch(prepared.root, 'status'));
    expect(consumed.code).toBe(0);
    expect(WorkerStatus.assert(JSON.parse(consumed.text)).operation?.operationId).toBe('held');
    expect(WorkerStatus.assert(JSON.parse(consumed.text)).pressure.state).toBe('binding-mismatch');
    expect(await readFile(join(prepared.directory, 'journal.json'), 'utf8')).toBe(before);
    await writeFile(join(prepared.directory, 'journal.json'), '{}');
    const corrupt = await finish(launch(prepared.root, 'status'));
    expect(corrupt.code).not.toBe(0);
    expect(corrupt.diagnostic).toContain('registry journal');
  } finally {
    holder.kill('SIGKILL');
    await finish(holder);
  }
});

test('actual monitor loop renews from newly read samples after ten seconds', async () => {
  const prepared = await fixture();
  const monitor = launch(prepared.root, 'monitor');
  try {
    expect(await ready(monitor)).toContain('fenced');
    await writeFile(
      join(prepared.root, 'sample.json'),
      JSON.stringify({ usedBytes: 45 * 1024 ** 3, at: '2026-11-01T00:00:10.000Z' }),
    );
    expect(await ready(monitor)).toContain('true');
    const observed = JSON.parse(
      await readFile(join(prepared.reports, 'report.json'), 'utf8'),
    ) as RegistryPressureReport;
    expect(observed.sequence).toBe(2);
    expect(observed.measurement.usedBytes).toBe(45 * 1024 ** 3);
    expect(observed.measurement.at).toBe('2026-11-01T00:00:10.000Z');
  } finally {
    monitor.kill('SIGKILL');
    await finish(monitor);
  }
}, 25000);
