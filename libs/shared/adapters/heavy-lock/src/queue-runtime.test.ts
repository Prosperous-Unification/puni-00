import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it, spyOn } from 'bun:test';

import {
  createQueueRuntime,
  isProcessAlive,
  runQueuedWork,
  selectLockPath,
  waitForPoll,
} from './queue';

it('selects only the existing platform canonical paths', () => {
  expect(selectLockPath('linux')).toBe('/home/puni1/.cache/wbs-heavy-work.lock');
  expect(selectLockPath('darwin')).toBe('/tmp/wbs-heavy-work.lock');
  expect(() => selectLockPath('win32')).toThrow('unsupported');
});
it('distinguishes only ESRCH from a live or unknown process', () => {
  expect(isProcessAlive(process.pid)).toBe(true);
  const denied = Object.assign(new Error('denied'), { code: 'EPERM' }),
    missing = Object.assign(new Error('missing'), { code: 'ESRCH' });
  const probing = spyOn(process, 'kill').mockImplementation(() => {
    throw denied;
  });
  try {
    expect(() => isProcessAlive(2147483647)).toThrow(denied);
    probing.mockImplementation(() => {
      throw missing;
    });
    expect(isProcessAlive(2147483647)).toBe(false);
  } finally {
    probing.mockRestore();
  }
});
it('wakes a real thirty second wait promptly on cancellation and detaches its listener', async () => {
  const controller = new AbortController(),
    removing = spyOn(controller.signal, 'removeEventListener'),
    start = performance.now();
  const waiting = waitForPoll(30, controller.signal);
  controller.abort();
  expect(await waiting).toBe('cancelled');
  expect(performance.now() - start).toBeLessThan(1000);
  expect(removing).toHaveBeenCalledWith('abort', expect.any(Function));
  removing.mockRestore();
});
it('models already cancelled and elapsed waits and detaches the elapsed listener', async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  expect(await waitForPoll(30, cancelled.signal)).toBe('cancelled');
  const controller = new AbortController(),
    removing = spyOn(controller.signal, 'removeEventListener');
  expect(await waitForPoll(0.001, controller.signal)).toBe('elapsed');
  expect(removing).toHaveBeenCalledWith('abort', expect.any(Function));
  removing.mockRestore();
});
it('captures the real runtime and executes a native backed queue with an epoch ticket', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puni real queue clock ')),
    path = join(root, 'mutex'),
    controller = new AbortController(),
    runtime = createQueueRuntime(controller.signal);
  try {
    expect(runtime.pid).toBe(process.pid);
    expect(runtime.readEpoch().toString()).toMatch(/^[0-9]{19}$/u);
    expect(runtime.readElapsed()).toBeGreaterThan(0);
    expect(runtime.isAlive(process.pid)).toBe(true);
    expect(
      await runQueuedWork(
        { path, label: 'real', command: 'bun', waitSeconds: 0, pollSeconds: 5 },
        () => Promise.resolve(8),
        runtime,
      ),
    ).toEqual({ kind: 'completed', value: 8, aheadAtArrival: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
for (const [field, value] of [
  ['waitSeconds', -1],
  ['waitSeconds', 0.5],
  ['waitSeconds', Infinity],
  ['pollSeconds', 0],
  ['pollSeconds', 31],
  ['pollSeconds', 1.5],
  ['label', ''],
  ['label', 'x\ny'],
  ['label', 'x\ry'],
  ['label', 'x\0y'],
] as const)
  it(
    'refuses invalid request ' +
      field +
      ' ' +
      JSON.stringify(value) +
      ' before touching the filesystem',
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'puni queue boundary ')),
        path = join(root, 'mutex');
      try {
        let failure: unknown;
        try {
          await runQueuedWork(
            {
              ...{ path, label: 'real', command: 'bun', waitSeconds: 0, pollSeconds: 5 },
              [field]: value,
            },
            () => Promise.resolve(1),
            createQueueRuntime(new AbortController().signal),
          );
        } catch (cause) {
          failure = cause;
        }
        expect(failure).toBeInstanceOf(Error);
        expect(existsSync(path)).toBe(false);
        expect(existsSync(path + '.queue')).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
