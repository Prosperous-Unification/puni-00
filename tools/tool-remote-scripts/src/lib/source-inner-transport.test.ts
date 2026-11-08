import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { sourceNodeTestNamespace, sourceNodeTestRuntime } from '../fixtures/source-node-runtime';
import { SOURCE_NODE_LAUNCHER } from './source-inner-program';

test('actual source Node program runs through an isolated exact production byte transport adapter', async () => {
  const node = await sourceNodeTestRuntime();
  const directory = await mkdtemp(join(tmpdir(), 'source-node-transport-'));
  const path = join(directory, 'docker');
  const id = 'a'.repeat(64);
  const prefix = [
    '--host',
    'unix:///var/run/docker.sock',
    'exec',
    '-i',
    '--user',
    '1000:1000',
    '--workdir',
    '/',
    id,
    '/usr/bin/env',
    '-i',
    'PATH=/usr/local/bin:/usr/bin:/bin',
    'LC_ALL=C',
    '/usr/local/bin/node',
    '-e',
    SOURCE_NODE_LAUNCHER,
    '--',
  ];
  // Local adapter verifies the complete production command and executes its unchanged immutable program in the explicitly selected local runtime. No Docker/container or source topology is claimed.
  const adapter = `#!/usr/bin/python3 -I
import json,os,sys
prefix=json.loads(${JSON.stringify(JSON.stringify(prefix))})
if sys.argv[1:1+len(prefix)]!=prefix:raise RuntimeError('source Node complete local adapter command differs')
os.execve(${JSON.stringify(node)},[${JSON.stringify(node)},*sys.argv[15:]],{'PATH':'/usr/local/bin:/usr/bin:/bin','LC_ALL':'C'})
`;
  await Bun.write(path, adapter);
  await chmod(path, 0o700);

  let settled = false;
  try {
    const child = Bun.spawn(
      [
        ...sourceNodeTestNamespace(directory),
        process.execPath,
        'test',
        'test/source-inner-transport-child.test.ts',
        '--timeout=45000',
      ],
      {
        cwd: new URL('../..', import.meta.url).pathname,
        env: {
          ...process.env,
          PATH: `${directory}:/usr/bin:/bin`,
          SOURCE_NODE_ADAPTER_PATH: path,
          SOURCE_NODE_TEST_BINARY: node,
          TMPDIR: directory,
          FORCE_COLOR: '0',
        },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        signal: AbortSignal.timeout(50000),
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
        `actual adapter original custody unproved; retained ${directory}`,
      );
    settled = true;
    process.stderr.write(stderr.value);
    expect(child.signalCode).toBeNull();
    expect(exit.value).toBe(0);
    expect(stderr.value).toMatch(/1 pass/);
    expect(stderr.value).toMatch(/0 fail/);
    expect(stderr.value).toContain(
      'actual immutable Node production byte transport ACK/reap and fresh original-group census observed',
    );
  } finally {
    if (settled) await rm(directory, { recursive: true });
  }
}, 55000);
