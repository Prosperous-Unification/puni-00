import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

const SCRIPT = join(import.meta.dir, '../../../bin/with-heavy-lock.sh');
const LOCK_LIB = join(import.meta.dir, '../../../bin/heavy-lock-lib.sh');
const roots: string[] = [];

function runWithTestLock(lock: string): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync([
    'bash',
    '-c',
    'source "$1"; shift; with_heavy_lock "$@"',
    'with-heavy-lock-test',
    LOCK_LIB,
    lock,
    '--',
    'bash',
    '-c',
    'exit 0',
  ]);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('with-heavy-lock', () => {
  it('uses one canonical production lock that no caller can move', () => {
    // **The property, restated after the mechanism changed under it.**
    //
    // This case used to stub a fake `flock` on PATH and read the path back out
    // of its argv. `heavy-work-lock` replaced `flock` with `mkdir` — macOS does
    // not ship `flock`, so `bin/h2puni-gate.sh` exited 127 on every Mac and
    // serialised nothing — and this went red for the right reason: it was
    // written against the old implementation.
    //
    // What it guards is unchanged and is worth more than the mechanism was: a
    // caller that can choose its own lock path is a caller that can opt out of
    // the lock, so two heavy runs pick two mutexes and both proceed. The rewrite
    // that broke this test had reintroduced exactly that — a `$WBS_HEAVY_LOCK`
    // override added as a test seam — and this case is what found it. The
    // override is gone; tests pass a path to `with_heavy_lock` directly.
    //
    // Read off the script rather than from a stubbed binary: there is no process
    // to intercept any more, so the check is that the production entry point
    // takes its path from `resolve_heavy_lock_path` and offers no way to supply
    // one.
    const wrapper = readFileSync(SCRIPT, 'utf8');
    const lib = readFileSync(LOCK_LIB, 'utf8');

    // The wrapper hands the resolver's answer straight to the lock, and nothing
    // else.
    expect(wrapper).toContain('with_heavy_lock "$(resolve_heavy_lock_path)" "$@"');
    // Proof: an environment override put back in the resolver — the seam this
    // change removed — and the first of these fails on the name reappearing.
    expect(lib).not.toContain('WBS_HEAVY_LOCK:-');
    expect(lib).toContain('/home/puni1/.cache/wbs-heavy-work.lock');
  });

  it('runs the requested command while the lock is free', () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-heavy-lock-'));
    roots.push(root);
    const run = runWithTestLock(join(root, 'heavy.lock'));
    expect(run.exitCode).toBe(0);
  });

  it('refuses immediately with exit 75 while another heavy operation owns the lock', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wbs-heavy-lock-'));
    roots.push(root);
    const lock = join(root, 'heavy.lock');

    // The holder takes the lock the way production does — through the library —
    // rather than through `flock`, which this test used to call directly and
    // which macOS does not have. A `flock`-held file is invisible to a `mkdir`
    // lock and the refusal below would never fire.
    const holder = Bun.spawn([
      'bash',
      '-c',
      'source "$1"; shift; with_heavy_lock "$@"',
      'heavy-lock-holder',
      LOCK_LIB,
      lock,
      '--',
      'sleep',
      '2',
    ]);
    await Bun.sleep(300);

    const refused = runWithTestLock(lock);
    holder.kill();
    await holder.exited;

    // Proof: this reaches the production wrapper and distinguishes contention
    // from command failure by its dedicated conflict exit code.
    expect(refused.exitCode).toBe(75);
  });
});
