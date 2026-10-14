import { expect, test } from 'bun:test';

import { verifyContainerNamespace } from './mount-audit';
import { SUPERVISOR_PROGRAM } from './mount-exec-program';

test('actual namespace admission refuses missing Docker init before invoking exec or stopping a writer', async () => {
  const calls: string[][] = [];
  const check = verifyContainerNamespace(
    {
      Id: 'a'.repeat(64),
      State: { Running: true, Pid: 100, StartedAt: 'stable' },
      RestartCount: 0,
      HostConfig: { PidMode: '', Init: false },
    },
    ['/data'],
    '/production/wbs.db',
    `registry/wbs-be-01@sha256:${'c'.repeat(64)}`,
    (args) => {
      calls.push(args);
      return Promise.resolve('');
    },
  );
  let failure: unknown = null;
  try {
    await check;
  } catch (cause) {
    failure = cause;
  }
  expect(String(failure)).toContain('init');
  expect(calls).toEqual([]);
});

test('namespace supervisor launches scanner through explicit BusyBox shell', () => {
  expect(SUPERVISOR_PROGRAM).toContain('/bin/busybox sh -c "$program"');
});
