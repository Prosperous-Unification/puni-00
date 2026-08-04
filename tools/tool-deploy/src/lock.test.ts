import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { acquireLock } from './lock';

async function lockPath(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), 'wbs-lock-')), 'deploy.lock');
}

describe('acquireLock', () => {
  it('grants the lock when nobody holds it', async () => {
    const lock = await acquireLock(await lockPath());
    expect(lock).not.toBeNull();
    await lock?.release();
  });

  /**
   * The whole point of the slice. Proof that the check is not vacuous:
   * changing the `wx` flag to a plain `w` fails this test and the live-holder
   * one below — 2 failed, 3 passed. Both callers get a lock, which is the
   * state where a timer's publish and a human's publish run against the same
   * worktree and registry at once. Observed 2026-08-04.
   */
  it('refuses a second holder while the first is alive', async () => {
    const path = await lockPath();
    const first = await acquireLock(path);
    const second = await acquireLock(path);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    await first?.release();
  });

  it('grants the lock again after release', async () => {
    const path = await lockPath();
    await (await acquireLock(path))?.release();
    const again = await acquireLock(path);
    expect(again).not.toBeNull();
    await again?.release();
  });

  /**
   * A deploy killed by the OOM killer or a reboot leaves its lock file behind.
   * Honouring it forever means one dead process stops every future deploy,
   * and the only symptom is an environment that quietly stops updating.
   */
  it('reclaims a lock whose holder is gone', async () => {
    const path = await lockPath();
    // PID 2^22 is above Linux's default pid_max, so it cannot be running.
    await writeFile(path, '4194304\n');
    const lock = await acquireLock(path);
    expect(lock).not.toBeNull();
    expect(await readFile(path, 'utf8')).toBe(`${String(process.pid)}\n`);
    await lock?.release();
  });

  it('honours a lock held by a process that is alive', async () => {
    const path = await lockPath();
    await writeFile(path, `${String(process.pid)}\n`);
    expect(await acquireLock(path)).toBeNull();
  });
});
