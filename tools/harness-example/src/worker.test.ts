import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'bun:test';

import { decodeWorkerEnvironment, runSyntheticSession } from './worker';

const valid = {
  PUNI_RUN_ID: 'drill-1',
  PUNI_WORKSPACE: '/workspace',
  PUNI_SCENARIO: 'complete',
  PUNI_HOLD_SECONDS: '0',
};

describe('decodeWorkerEnvironment', () => {
  it('accepts the bounded environment and refuses anything else', () => {
    expect(decodeWorkerEnvironment(valid).PUNI_RUN_ID).toBe('drill-1');
    expect(() => decodeWorkerEnvironment({ ...valid, PUNI_RUN_ID: undefined })).toThrow(/invalid/);
    expect(() => decodeWorkerEnvironment({ ...valid, PUNI_RUN_ID: '../x' })).toThrow(/invalid/);
    expect(() => decodeWorkerEnvironment({ ...valid, PUNI_SCENARIO: 'real-agent' })).toThrow(
      /invalid/,
    );
  });
});

describe('runSyntheticSession', () => {
  it('writes and revises three files through three sessions', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'synthetic-worker-'));
    const files = await runSyntheticSession('drill-1', workspace, 10);
    expect(files.map(({ name }) => name)).toEqual(['part-a.txt', 'part-b.txt', 'part-c.txt']);
  });

  it('refuses a workspace another run already wrote to', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'synthetic-worker-'));
    await writeFile(path.join(workspace, 'part-a.txt'), 'earlier run\n');
    expect(runSyntheticSession('drill-1', workspace, 10)).rejects.toThrow(/not empty/);
  });
});

describe('worker entrypoint', () => {
  it('exits 143 with a cancellation event on SIGTERM', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'synthetic-worker-'));
    const child = Bun.spawn([process.execPath, path.join(import.meta.dir, 'worker.ts')], {
      env: { ...process.env, ...valid, PUNI_WORKSPACE: workspace, PUNI_HOLD_SECONDS: '30' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const reader = child.stdout.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('"synthetic-start"');
    child.kill('SIGTERM');
    expect(await child.exited).toBe(143);
    const rest = new TextDecoder().decode((await reader.read()).value);
    expect(rest).toContain('"synthetic-cancelled"');
  });
});
