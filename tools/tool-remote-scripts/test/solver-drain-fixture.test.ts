import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { initializeOrdinaryEdgePolicy, readOrdinaryEdgePolicy } from '../src/lib/edge-policy';
import { withSolverRuntimeAdmission } from '../src/lib/solver-runtime-admission';
import { summarizeFixtureFailure } from './fixture-failure';

async function waitFor(path: string): Promise<void> {
  const deadline = performance.now() + 3000;
  while (!(await Bun.file(path).exists())) {
    if (performance.now() >= deadline) throw new Error('fixture local readiness deadline');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

for (const admission of ['ordinary', 'policy'] as const)
  test(`${admission} creator holds actual runtime admission through lifetime and creates during stop using only declared argv`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'solver-creator-proof-'));
    const edge = join(root, 'edge');
    await mkdir(edge);
    await initializeOrdinaryEdgePolicy(edge);
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({ createDuringStop: [process.execPath, '-e', 'console.log("a".repeat(64))'] }),
    );
    const child = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, 'solver-drain-fixture.ts'),
        `--config=${join(root, 'config.json')}`,
        ...(admission === 'policy' ? ['--admission=policy'] : []),
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
    expect(JSON.parse(await readFile(join(root, 'refused.json'), 'utf8'))).toMatchObject({
      reason: 'retained-edge-owner',
    });
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
    await rm(root, { recursive: true });
  }
});

test('policy creator refuses missing policy before reading its missing manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'solver-creator-policy-'));
  const edge = join(root, 'edge');
  await mkdir(edge);
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, 'solver-drain-fixture.ts'),
        `--config=${join(root, 'config.json')}`,
        '--admission=policy',
      ],
      { env: { ...process.env, WBS_EDGE_STATE: edge }, stdout: 'ignore', stderr: 'ignore' },
    );
    expect(await child.exited).toBe(1);
    let policyCause: unknown;
    try {
      await readOrdinaryEdgePolicy(edge);
    } catch (cause) {
      policyCause = cause;
    }
    expect(policyCause).toBeInstanceOf(Error);
    const expected = summarizeFixtureFailure(policyCause);
    const receipt = await readFile(join(root, 'refused.json'), 'utf8');
    const expectedHash = expected.chain.at(0)?.fingerprint;
    if (expectedHash === undefined) throw new Error('expected policy failure fingerprint absent');
    expect(receipt).toContain(expectedHash);
    expect(receipt).not.toContain('edge-policy.json');
    expect(await Bun.file(join(root, 'ready.json')).exists()).toBe(false);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('creator ordinary manifest failure exits 1 with a startup-error reason', async () => {
  const root = await mkdtemp(join(tmpdir(), 'solver-creator-error-'));
  const edge = join(root, 'edge');
  await mkdir(edge);
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, 'solver-drain-fixture.ts'),
        `--config=${join(root, 'config.json')}`,
      ],
      { env: { ...process.env, WBS_EDGE_STATE: edge }, stdout: 'ignore', stderr: 'ignore' },
    );
    expect(await child.exited).toBe(1);
    expect(JSON.parse(await readFile(join(root, 'refused.json'), 'utf8'))).toMatchObject({
      reason: 'startup-error',
    });
  } finally {
    await rm(root, { recursive: true });
  }
});

test('creator malformed manifest diagnostic never retains JSON payloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'solver-creator-private-'));
  const edge = join(root, 'edge');
  await mkdir(edge);
  try {
    await writeFile(
      join(root, 'manifest.json'),
      '{"PRIVATE_JSON_CONFIG": MALFORMED_PRIVATE_SENTINEL}',
    );
    const child = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, 'solver-drain-fixture.ts'),
        `--config=${join(root, 'config.json')}`,
      ],
      { env: { ...process.env, WBS_EDGE_STATE: edge }, stdout: 'ignore', stderr: 'ignore' },
    );
    expect(await child.exited).toBe(1);
    const receipt = await readFile(join(root, 'refused.json'), 'utf8');
    expect(receipt).not.toContain('MALFORMED_PRIVATE_SENTINEL');
    expect(receipt).not.toContain('PRIVATE_JSON_CONFIG');
    expect(receipt).toContain('fingerprint');
  } finally {
    await rm(root, { recursive: true });
  }
});

test('creator invalid CLI exits with a private diagnostic instead of an arbitrary error string', async () => {
  const root = await mkdtemp(join(tmpdir(), 'solver-creator-cli-'));
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, 'solver-drain-fixture.ts'),
        '--PRIVATE_CREDENTIAL_ARGUMENT',
      ],
      { env: { ...process.env, WBS_EDGE_STATE: root }, stdout: 'ignore', stderr: 'pipe' },
    );
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).toBe(1);
    expect(stderr).not.toContain('PRIVATE_CREDENTIAL_ARGUMENT');
    expect(stderr).toContain('fingerprint');
  } finally {
    await rm(root, { recursive: true });
  }
});
