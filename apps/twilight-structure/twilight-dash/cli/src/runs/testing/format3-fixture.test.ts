import { rejects } from 'node:assert/strict';
import { existsSync, mkdtempSync, readlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { createFormat3Fixture } from './format3-fixture';

for (const termination of ['idle', 'close_timeout'] as const)
  test(`format3 fixture reports ${termination} worker termination after cleanup and on repeated close`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'format3-lifecycle-'));
    let fixture: Awaited<ReturnType<typeof createFormat3Fixture>> | undefined;
    let expectedFailure: unknown;
    try {
      fixture = await createFormat3Fixture(join(directory, 'runs.sqlite'));
      const pid = fixture.worker.pid;
      if (pid === undefined) throw new Error('ready worker has no process identity');
      const archive = readlinkSync(`/proc/${String(pid)}/cwd`);
      await fixture.capture();
      expect(existsSync(archive)).toBe(true);
      if (termination === 'idle') {
        process.kill(pid, 'SIGKILL');
        expect(await fixture.worker.exited).toEqual({ code: null, signal: 'SIGKILL' });
      } else process.kill(pid, 'SIGSTOP');
      const closed = await fixture.close().then(
        () => ({ kind: 'closed' as const }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      );
      if (closed.kind === 'failed') expectedFailure = closed.cause;
      expect(existsSync(archive)).toBe(false);
      expect(closed.kind).toBe('failed');
      if (closed.kind !== 'failed') throw new Error('expected worker failure');
      expect(closed.cause).toBeInstanceOf(Error);
      expect(String(closed.cause)).toContain(
        termination === 'idle'
          ? 'format3 worker exited null/SIGKILL'
          : 'format3 worker close timed out',
      );
      expect(await fixture.worker.exited).toEqual({ code: null, signal: 'SIGKILL' });
      await rejects(fixture.close(), (cause: unknown) => {
        expect(cause).toBe(closed.cause);
        return true;
      });
    } finally {
      try {
        await fixture?.close().catch((cause: unknown) => {
          // The test already observed this exact cached terminal failure; a new cleanup failure is never suppressed.
          if (cause !== expectedFailure) throw cause;
        });
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

test('format3 fixture acknowledged close exits zero removes archive and is idempotent', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format3-lifecycle-'));
  let fixture: Awaited<ReturnType<typeof createFormat3Fixture>> | undefined;
  try {
    fixture = await createFormat3Fixture(join(directory, 'runs.sqlite'));
    const pid = fixture.worker.pid;
    if (pid === undefined) throw new Error('ready worker has no process identity');
    const archive = readlinkSync(`/proc/${String(pid)}/cwd`);
    await fixture.capture();
    await fixture.close();
    expect(await fixture.worker.exited).toEqual({ code: 0, signal: null });
    expect(existsSync(archive)).toBe(false);
    await fixture.close();
  } finally {
    try {
      await fixture?.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});
