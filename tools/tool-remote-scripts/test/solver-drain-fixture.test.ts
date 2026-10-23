import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { withSolverRuntimeAdmission } from '../src/lib/solver-runtime-admission';

async function waitFor(path: string): Promise<void> {
  const deadline = performance.now() + 3000;
  while (!(await Bun.file(path).exists())) {
    if (performance.now() >= deadline) throw new Error('fixture local readiness deadline');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('creator holds actual runtime admission through lifetime and creates during stop using only declared argv', async () => {
  const root = await mkdtemp(join(tmpdir(), 'solver-creator-proof-'));
  const edge = join(root, 'edge');
  await mkdir(edge);
  await writeFile(
    join(root, 'manifest.json'),
    JSON.stringify({ createDuringStop: [process.execPath, '-e', 'console.log("a".repeat(64))'] }),
  );
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, 'solver-drain-fixture.ts'),
      `--config=${join(root, 'config.json')}`,
    ],
    { env: { ...process.env, WBS_EDGE_STATE: edge }, stdout: 'ignore', stderr: 'ignore' },
  );
  const timeout = setTimeout(() => {
    child.kill('SIGKILL');
  }, 3000);
  try {
    await waitFor(join(root, 'ready.json'));
    let admitted = false;
    try {
      await withSolverRuntimeAdmission(() => {
        admitted = true;
        return Promise.resolve();
      }, edge);
    } catch (cause) {
      expect(String(cause)).toContain('lock held');
    }
    expect(admitted).toBe(false);
    child.kill('SIGTERM');
    expect(await child.exited).toBe(0);
    expect((await readFile(join(root, 'during-stop.id'), 'utf8')).trim()).toBe('a'.repeat(64));
    await withSolverRuntimeAdmission(() => {
      admitted = true;
      return Promise.resolve();
    }, edge);
    expect(admitted).toBe(true);
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
    await rm(root, { recursive: true });
  }
});

test('retained marker refuses creator before readiness or during-stop effects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'solver-creator-refusal-'));
  const edge = join(root, 'edge');
  await mkdir(edge);
  await writeFile(join(edge, 'edge-owner.pending'), 'retained');
  await writeFile(
    join(root, 'manifest.json'),
    JSON.stringify({
      createDuringStop: [process.execPath, '-e', 'throw new Error("must not run")'],
    }),
  );
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, 'solver-drain-fixture.ts'),
      `--config=${join(root, 'config.json')}`,
    ],
    { env: { ...process.env, WBS_EDGE_STATE: edge }, stdout: 'ignore', stderr: 'ignore' },
  );
  const timeout = setTimeout(() => {
    child.kill('SIGKILL');
  }, 3000);
  try {
    expect(await child.exited).toBe(78);
    expect(await Bun.file(join(root, 'ready.json')).exists()).toBe(false);
    expect(await Bun.file(join(root, 'during-stop.id')).exists()).toBe(false);
    expect(await readFile(join(root, 'refused.json'), 'utf8')).toContain('owner');
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
    await rm(root, { recursive: true });
  }
});
