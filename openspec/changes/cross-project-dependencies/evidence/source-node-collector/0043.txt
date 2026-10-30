import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { sourceNodeTestNamespace, sourceNodeTestRuntime } from '../fixtures/source-node-runtime';

test('source immutable Node program runs in its owned numeric1000 namespace', async () => {
  const node = await sourceNodeTestRuntime();
  const directory = await mkdtemp(join(tmpdir(), 'source-node-owning-'));
  let settled = false;
  try {
    const child = Bun.spawn(
      [
        ...sourceNodeTestNamespace(directory),
        process.execPath,
        'test',
        'test/source-inner-program-child.test.ts',
        '--timeout=10000',
      ],
      {
        cwd: new URL('../..', import.meta.url).pathname,
        env: { ...process.env, TMPDIR: directory, SOURCE_NODE_TEST_BINARY: node, FORCE_COLOR: '0' },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        signal: AbortSignal.timeout(65000),
        killSignal: 'SIGKILL',
      },
    );
    const receipts = await Promise.allSettled([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const [exit, stdout, stderr] = receipts;
    if (
      exit.status !== 'fulfilled' ||
      stdout.status !== 'fulfilled' ||
      stderr.status !== 'fulfilled'
    )
      throw new AggregateError(
        receipts,
        `source Node owning namespace custody unproved; retained ${directory}`,
      );
    settled = true;
    process.stderr.write(stderr.value);
    expect(child.signalCode).toBeNull();
    expect(exit.value).toBe(0);
    expect(stderr.value).toContain('source Node owning namespace actual UID/GID1000:1000 observed');
    expect(stderr.value).toMatch(/49 pass/);
    expect(stderr.value).toMatch(/0 fail/);
  } finally {
    if (settled) await rm(directory, { recursive: true });
  }
}, 70000);
