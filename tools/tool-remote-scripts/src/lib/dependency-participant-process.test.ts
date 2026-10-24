import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { observeParticipantProcess } from './dependency-participant-process';

test('native participant process observation brackets real argv executable cwd and start ticks', async () => {
  const observed = await observeParticipantProcess(process.pid, performance.now() + 10000);
  expect(observed.identity.pid).toBe(process.pid);
  expect(observed.identity.cwd).toBe(process.cwd());
  expect(observed.identity.startTime).toMatch(/^[0-9]+$/);
  expect(observed.identity.executable?.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(observed.identity.cgroup.startsWith('/')).toBe(true);
  expect(observed.argv[0]).toContain('bun');
  expect(observed.executablePath.startsWith('/')).toBe(true);
});
for (const pid of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER])
  test(`native participant process observation refuses absent or malformed PID ${String(pid)}`, async () => {
    await rejects(observeParticipantProcess(pid, performance.now() + 10000));
  });
