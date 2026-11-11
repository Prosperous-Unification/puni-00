import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { insideLinuxNamespace } from './host-pool.test.fixture';
import { hasProcessEnded, type HoldScope, identifyProcess, inspectHolds } from './runtime';

/**
 * A group leader that called `pthread_exit` beside a live thread, printing its pid once the
 * thread runs (and, given `hold`, once the thread holds that file open).
 */
async function leavingLeader(hold: string | null) {
  const script = [
    'import ctypes,os,sys,threading,time',
    'ready = threading.Event()',
    'def run():',
    '    held = open(sys.argv[1]) if sys.argv[1] else None',
    '    ready.set()',
    '    time.sleep(30)',
    'threading.Thread(target=run).start()',
    'ready.wait()',
    'print(os.getpid(), flush=True)',
    'ctypes.CDLL(None).pthread_exit(None)',
  ].join('\n');
  const parent = Bun.spawn(['python3', '-c', script, hold ?? ''], { stdout: 'pipe' });
  const reader = parent.stdout.getReader();
  const first = await reader.read();
  reader.releaseLock();
  const pid = new TextDecoder().decode(first.value).trim();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = readFileSync(`/proc/${pid}/stat`, 'utf8');
    if (state.slice(state.lastIndexOf(')') + 2).startsWith('Z ')) return parent;
    await Bun.sleep(20);
  }
  parent.kill('SIGKILL');
  throw new Error(`leader ${pid} never became a zombie`);
}

function scope(): HoldScope {
  const before = identifyProcess(process.pid);
  if (before === null) throw new Error('this test process has no identity');
  return {
    owns: () => false,
    sessions: new Set(),
    before,
    ownCgroup: null,
    held: 'the fixture',
    remedy: 'none',
    outside: [],
  };
}

// Inside a private namespace, so the scan sees only this suite's processes (verify.md Slice 6c,
// S6C-A24).
if (insideLinuxNamespace(import.meta.path)) {
  // Proof: with `inspectionRoot` answering the leader's own path, this refused `cannot inspect
  // process PID` (verify.md Slice 6c, 6c-F20).
  test('a leaving leader is inspected through its live thread', async () => {
    const locator = mkdtempSync(join(tmpdir(), 'leaving-holds-'));
    const parent = await leavingLeader(null);
    try {
      const inspected = scope();
      expect(() => {
        inspectHolds(locator, inspected);
      }).not.toThrow();
      expect(inspected.outside).toEqual([]);
    } finally {
      parent.kill('SIGKILL');
      await parent.exited;
      rmSync(locator, { recursive: true, force: true });
    }
  });

  test("a leaving leader's live thread holding a file still holds", async () => {
    const locator = mkdtempSync(join(tmpdir(), 'leaving-holds-'));
    const held = join(locator, 'held');
    writeFileSync(held, 'held\n');
    const parent = await leavingLeader(held);
    try {
      expect(() => {
        inspectHolds(locator, scope());
      }).toThrow('live file hold remains charged');
    } finally {
      parent.kill('SIGKILL');
      await parent.exited;
      rmSync(locator, { recursive: true, force: true });
    }
  });

  test('a zombie guard leader with a surviving thread is retained until the complete original group ends', async () => {
    const parent = await leavingLeader(null);
    try {
      const stat = readFileSync('/proc/' + String(parent.pid) + '/stat', 'utf8'),
        start = stat
          .slice(stat.lastIndexOf(')') + 2)
          .split(' ')
          .at(19);
      if (start === undefined) throw new Error('fixture full process birth missing');
      const identity = {
        pid: parent.pid,
        boot: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(),
        start,
      };
      expect(identifyProcess(parent.pid)).toBe(null);
      expect(hasProcessEnded(identity)).toBe(false);
      parent.kill('SIGKILL');
      await parent.exited;
      expect(hasProcessEnded(identity)).toBe(true);
    } finally {
      if (parent.exitCode === null) parent.kill('SIGKILL');
      await parent.exited;
    }
  });
}
