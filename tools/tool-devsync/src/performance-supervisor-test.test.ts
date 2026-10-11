import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { awaitPerformanceSupervisor } from './performance-supervisor-test';

test('drains a full stderr pipe while waiting for a fixture supervisor', async () => {
  const supervisor = Bun.spawn(
    [process.execPath, '--eval', 'process.stderr.write("x".repeat(1_000_000))'],
    { stdout: 'ignore', stderr: 'pipe' },
  );
  const { exitCode, stderr } = await awaitPerformanceSupervisor(supervisor, 2_000);
  expect(exitCode).toBe(0);
  expect(stderr).toHaveLength(1_000_000);
});

test('bounds a fixture supervisor that never exits', async () => {
  const supervisor = Bun.spawn([process.execPath, '--eval', 'await Bun.sleep(10_000)'], {
    stdout: 'ignore',
    stderr: 'pipe',
  });
  const failure: unknown = await awaitPerformanceSupervisor(supervisor, 50).then(
    () => new Error('supervisor unexpectedly exited'),
    (cause: unknown) => cause,
  );
  expect(String(failure)).toContain('timed out');
  expect(await supervisor.exited).not.toBeNull();
});

test('bounds a supervisor whose exited wrapper leaves a stderr pipe holder', async () => {
  const marker = join(
    tmpdir(),
    `performance-pipe-holder-${String(process.pid)}-${String(Date.now())}`,
  );
  const supervisor = Bun.spawn(['bash', '-c', `sleep 10 >&2 & echo $! > "${marker}"`], {
    stdout: 'ignore',
    stderr: 'pipe',
  });
  let holderPid = 0;
  try {
    for (let attempt = 0; attempt < 100 && !(await Bun.file(marker).exists()); attempt += 1)
      await Bun.sleep(10);
    holderPid = Number((await readFile(marker, 'utf8')).trim());
    await Bun.sleep(50);
    expect(await Bun.file(`/proc/${String(holderPid)}/stat`).exists()).toBe(true);
    expect(await Bun.file(`/proc/${String(supervisor.pid)}/stat`).exists()).toBe(false);
    const outcome = await Promise.race([
      awaitPerformanceSupervisor(supervisor, 100).then(
        () => 'unexpected success',
        (cause: unknown) => String(cause),
      ),
      Bun.sleep(500).then(() => 'unbounded pipe wait'),
    ]);
    expect(outcome).toContain('timed out');
  } finally {
    if (holderPid > 0 && (await Bun.file(`/proc/${String(holderPid)}/stat`).exists()))
      process.kill(holderPid, 'SIGKILL');
    await rm(marker, { force: true });
  }
}, 2_000);
