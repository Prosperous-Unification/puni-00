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
