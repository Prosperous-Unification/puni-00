import { rejects } from 'node:assert/strict';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

test('initializer CLI defaults to dry run and execute is exclusive', async () => {
  const directory = scratchSync('edge-policy-cli-');
  const run = async (argv: string[]) => {
    const child = Bun.spawn(
      [process.execPath, `${import.meta.dir}/initialize-edge-policy.ts`, ...argv],
      {
        env: { ...process.env, WBS_EDGE_STATE: directory },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    return {
      code: await child.exited,
      stdout: await new Response(child.stdout).text(),
      stderr: await new Response(child.stderr).text(),
    };
  };
  expect(await run([])).toMatchObject({ code: 0 });
  expect(await Bun.file(`${directory}/edge-policy.json`).exists()).toBe(false);
  expect(await run(['--execute', '--execute'])).toMatchObject({ code: 1 });
  expect(await run(['--execute'])).toMatchObject({ code: 0 });
  const bytes = await readFile(`${directory}/edge-policy.json`, 'utf8');
  expect(await run(['--execute'])).toMatchObject({ code: 1 });
  expect(await readFile(`${directory}/edge-policy.json`, 'utf8')).toBe(bytes);
});

async function observeInitializer(directory: string, argv: string[], preload?: string) {
  const child = Bun.spawn(
    [
      process.execPath,
      ...(preload === undefined ? [] : ['--preload', preload]),
      `${import.meta.dir}/initialize-edge-policy.ts`,
      ...argv,
    ],
    {
      env: { ...process.env, WBS_EDGE_STATE: directory },
      stdout: 'pipe',
      stderr: 'pipe',
      signal: AbortSignal.timeout(5000),
      killSignal: 'SIGKILL',
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  process.stderr.write(
    `ORIGIN_INITIALIZER_CUSTODY: ${JSON.stringify({ pid: child.pid, exitCode, signal: child.signalCode, argumentKinds: argv.map((argument) => (argument === '--execute' ? 'execute' : argument.startsWith('--origin-receipt=') ? 'origin-receipt' : argument.startsWith('--attempt-id=') ? 'attempt-id' : 'unknown')), stdoutEof: true, stderrEof: true })}\n`,
  );
  expect(
    child.signalCode,
    'original initializer exit and both streams must settle normally',
  ).toBeNull();
  return {
    exitCode,
    signal: child.signalCode,
    stdout,
    stderr,
    stdoutEof: true,
    stderrEof: true,
  } as const;
}

async function readSuccessfulOrigin(
  invocation: Awaited<ReturnType<typeof observeInitializer>>,
  receiptPath: string,
): Promise<unknown> {
  if (invocation.exitCode !== 0 || invocation.signal !== null)
    throw new Error('original initializer did not succeed');
  const bytes = await readFile(receiptPath);
  if (bytes.byteLength < 1 || bytes.byteLength > 16384)
    throw new Error('invalid bounded origin receipt');
  return JSON.parse(bytes.toString());
}

test('origin CLI requires a complete request before mutation', async () => {
  const attemptId = 'c623b8e1-6d5f-49bf-a63a-f2c1ec22dfb9';
  for (const fault of [
    'missing-receipt',
    'missing-attempt',
    'dry-run',
    'duplicate-execute',
    'duplicate-receipt',
    'duplicate-attempt',
    'unknown',
    'uuid',
    'relative',
  ] as const) {
    const staging = scratchSync('edge-origin-cli-arguments-');
    const directory = `${staging}/state`;
    const receiptPath = `${staging}/origin.json`;
    await mkdir(directory, { mode: 0o700 });
    const receipt = `--origin-receipt=${receiptPath}`;
    const attempt = `--attempt-id=${attemptId}`;
    let argv = ['--execute', receipt, attempt];
    if (fault === 'missing-receipt') argv = ['--execute', attempt];
    if (fault === 'missing-attempt') argv = ['--execute', receipt];
    if (fault === 'dry-run') argv = [receipt, attempt];
    if (fault === 'duplicate-execute') argv.push('--execute');
    if (fault === 'duplicate-receipt') argv.push(receipt);
    if (fault === 'duplicate-attempt') argv.push(attempt);
    if (fault === 'unknown') argv.push('--unknown');
    if (fault === 'uuid') argv = ['--execute', receipt, '--attempt-id=not-a-uuid'];
    if (fault === 'relative') {
      const destination = relative(process.cwd(), receiptPath);
      expect(resolve(destination).startsWith(`${staging}/`)).toBe(true);
      argv = ['--execute', `--origin-receipt=${destination}`, attempt];
    }
    const observed = await observeInitializer(directory, argv);
    expect(observed.exitCode, fault).toBe(1);
    expect(observed.stdout).toBe('');
    expect(observed.stderr.length).toBeGreaterThan(0);
    expect(await Bun.file(`${directory}/edge-policy.json`).exists()).toBe(false);
    expect(await Bun.file(receiptPath).exists()).toBe(false);
  }
});

test('origin CLI preserves legacy stdout and original process custody', async () => {
  const staging = scratchSync('edge-origin-cli-success-');
  const directory = `${staging}/state`;
  const receiptPath = `${staging}/origin.json`;
  const attemptId = 'c623b8e1-6d5f-49bf-a63a-f2c1ec22dfb9';
  await mkdir(directory, { mode: 0o700 });
  const observed = await observeInitializer(directory, [
    '--execute',
    `--origin-receipt=${receiptPath}`,
    `--attempt-id=${attemptId}`,
  ]);
  expect(observed.exitCode, observed.stderr).toBe(0);
  expect(observed.stderr).toBe('');
  expect(observed.stdout).toBe(
    `initialized ordinary edge policy at ${directory}/edge-policy.json; install and independently audit before adoption\n`,
  );
  const contents = await readFile(`${directory}/edge-policy.json`, 'utf8');
  const status = await lstat(`${directory}/edge-policy.json`, { bigint: true });
  expect(await readSuccessfulOrigin(observed, receiptPath)).toMatchObject({
    format: 'edge-policy-origin-receipt',
    version: 1,
    attemptId,
    edgeState: directory,
    policy: {
      path: `${directory}/edge-policy.json`,
      inode: String(status.ino),
      contents,
      byteLength: Buffer.byteLength(contents),
    },
  });
  expect((await lstat(receiptPath)).mode & 0o7777).toBe(0o600);
});

test('failed initialization receipt is not successful origin', async () => {
  const staging = scratchSync('edge-origin-cli-failure-');
  const directory = `${staging}/state`;
  const receiptPath = `${staging}/origin.json`;
  const preload = `${staging}/receipt-failure.ts`;
  await mkdir(directory, { mode: 0o700 });
  await writeFile(
    preload,
    `
    import * as native from 'node:fs';
    import { mock } from 'bun:test';
    const original = { ...native };
    mock.module('node:fs', () => ({ ...original, fsyncSync: (descriptor) => {
      if (original.readlinkSync('/proc/self/fd/' + descriptor) === ${JSON.stringify(receiptPath)})
        throw new Error('injected required origin sync');
      return original.fsyncSync(descriptor);
    }}));
  `,
    { mode: 0o600 },
  );
  const observed = await observeInitializer(
    directory,
    [
      '--execute',
      `--origin-receipt=${receiptPath}`,
      '--attempt-id=c623b8e1-6d5f-49bf-a63a-f2c1ec22dfb9',
    ],
    preload,
  );
  expect(observed.exitCode, observed.stderr).toBe(1);
  expect(observed.stdout).toBe('');
  expect(observed.stderr).toContain('injected required origin sync');
  expect(await Bun.file(`${directory}/edge-policy.json`).exists()).toBe(true);
  expect(await Bun.file(receiptPath).exists()).toBe(true);
  await rejects(
    readSuccessfulOrigin(observed, receiptPath),
    /original initializer did not succeed/,
  );
});
