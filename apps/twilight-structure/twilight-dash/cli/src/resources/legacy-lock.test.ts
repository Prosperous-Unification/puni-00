import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { holdLegacyLock, productionLegacyLock, readLegacyQueue } from './legacy-lock';
import {
  eventually,
  intervalsOf,
  LOCK_LIBRARY,
  privateLegacyLock,
  startLegacyCaller,
} from './legacy-lock.test.fixture';

/**
 * Dash's legacy holder against the real shell lock library (`dash-host-jobs` J12, J13): a hold
 * is a real `with_heavy_lock` ticket, holder record and label, so `status` and legacy callers
 * see it as one of their own, and it outlives the Dash process that took it.
 */
describe('the legacy holder (J12)', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      spawnSync('chmod', ['-R', 'u+rwx', directory]);
      rmSync(directory, { recursive: true, force: true });
    }
  });
  function scratch(): string {
    const directory = mkdtempSync(join(tmpdir(), 'dash-legacy-lock-'));
    directories.push(directory);
    return directory;
  }
  const never = new AbortController().signal;
  const report = (line: string): void => {
    process.stderr.write(`${line}\n`);
  };

  test('the production lock is the library beside this checkout and its canonical path', () => {
    const lock = productionLegacyLock();
    expect(lock.library).toBe(LOCK_LIBRARY);
    expect(lock.lockPath).toBe('/home/puni1/.cache/wbs-heavy-work.lock');
  });

  test('a hold is the shell lock holder, with its label, until its hold file goes', async () => {
    const directory = scratch();
    const lock = privateLegacyLock(directory);
    const holdFile = join(directory, 'holds', 'job-1');
    const outcome = await holdLegacyLock(
      lock,
      {
        holdFile,
        label: 'dash-job-1 gate:abc',
        waitSeconds: 0,
        pollSeconds: 1,
        signal: never,
        report,
      },
      process.env,
    );
    if (outcome.kind !== 'held') throw new Error(`not held: ${outcome.kind}`);
    const status = readLegacyQueue(lock);
    expect(status.lines[0]).toBe(
      `heavy lock: holder pid ${String(outcome.hold.pid)} label dash-job-1 gate:abc`,
    );
    const log = join(directory, 'log');
    const refused = startLegacyCaller(lock, 'late', log, { waitSeconds: 0, seconds: 0 });
    expect(await refused.exited).toBe(75);
    outcome.hold.release();
    expect(await outcome.hold.exited).toBe(0);
    expect(readLegacyQueue(lock).holder).toEqual({ kind: 'none' });
    expect(existsSync(holdFile)).toBe(false);
  });

  test('a hold queues behind a legacy holder in arrival order and refuses 75 at its deadline', async () => {
    const directory = scratch();
    const lock = privateLegacyLock(directory);
    const log = join(directory, 'log');
    const legacy = startLegacyCaller(lock, 'first', log, { waitSeconds: 0, seconds: 3 });
    await eventually('the legacy holder', () => intervalsOf(log).has('first'));
    const refused = await holdLegacyLock(
      lock,
      {
        holdFile: join(directory, 'holds', 'refused'),
        label: 'dash-job-refused',
        waitSeconds: 1,
        pollSeconds: 1,
        signal: never,
        report,
      },
      process.env,
    );
    expect(refused).toEqual({ kind: 'refused', exitCode: 75 });
    expect(existsSync(join(directory, 'holds', 'refused'))).toBe(false);
    const waited = await holdLegacyLock(
      lock,
      {
        holdFile: join(directory, 'holds', 'waited'),
        label: 'dash-job-waited',
        waitSeconds: 30,
        pollSeconds: 1,
        signal: never,
        report,
      },
      process.env,
    );
    if (waited.kind !== 'held') throw new Error(`not held: ${waited.kind}`);
    expect(await legacy.exited).toBe(0);
    const first = intervalsOf(log).get('first');
    expect(first?.end).not.toBeNull();
    waited.hold.release();
    expect(await waited.hold.exited).toBe(0);
  });

  test('cancelling a waiting hold withdraws its ticket at once', async () => {
    const directory = scratch();
    const lock = privateLegacyLock(directory);
    const log = join(directory, 'log');
    const legacy = startLegacyCaller(lock, 'holder', log, { waitSeconds: 0, seconds: 4 });
    await eventually('the legacy holder', () => intervalsOf(log).has('holder'));
    const cancel = new AbortController();
    const pending = holdLegacyLock(
      lock,
      {
        holdFile: join(directory, 'holds', 'cancelled'),
        label: 'dash-job-cancelled',
        waitSeconds: 60,
        pollSeconds: 5,
        signal: cancel.signal,
        report,
      },
      process.env,
    );
    await eventually('the waiting ticket', () => readLegacyQueue(lock).waiters.length === 1);
    const started = Date.now();
    cancel.abort();
    expect(await pending).toEqual({ kind: 'cancelled' });
    // The whole session is signalled, so the waiter does not finish its five-second poll first.
    expect(Date.now() - started).toBeLessThan(3000);
    expect(readLegacyQueue(lock).waiters).toEqual([]);
    await legacy.exited;
  });

  test('the hold outlives the Dash process that took it, until the hold file goes', async () => {
    const directory = scratch();
    const lock = privateLegacyLock(directory);
    const holdFile = join(directory, 'holds', 'orphan');
    const script = join(directory, 'take.ts');
    writeFileSync(
      script,
      [
        `import { holdLegacyLock } from ${JSON.stringify(join(import.meta.dir, 'legacy-lock'))};`,
        `const outcome = await holdLegacyLock(${JSON.stringify(lock)}, { holdFile: ${JSON.stringify(holdFile)}, label: 'dash-job-orphan', waitSeconds: 0, pollSeconds: 1, signal: new AbortController().signal, report: () => undefined }, process.env);`,
        "process.stdout.write(outcome.kind === 'held' ? String(outcome.hold.pid) : outcome.kind);",
        'process.exit(0);',
      ].join('\n'),
    );
    const taker = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 30_000 });
    expect(taker.status).toBe(0);
    const holder = Number(taker.stdout);
    expect(holder).toBeGreaterThan(0);
    // The Dash process is gone; the holder still holds and a legacy caller still refuses.
    expect(readLegacyQueue(lock).lines[0]).toBe(
      `heavy lock: holder pid ${String(holder)} label dash-job-orphan`,
    );
    const log = join(directory, 'log');
    expect(await startLegacyCaller(lock, 'early', log, { waitSeconds: 0, seconds: 0 }).exited).toBe(
      75,
    );
    rmSync(holdFile);
    const after = startLegacyCaller(lock, 'after', log, { waitSeconds: 10, seconds: 0 });
    expect(await after.exited).toBe(0);
    expect(intervalsOf(log).has('early')).toBe(false);
  });

  test('a holder killed outright releases the flock, and its record is reclaimed as dead', async () => {
    const directory = scratch();
    const lock = privateLegacyLock(directory);
    const outcome = await holdLegacyLock(
      lock,
      {
        holdFile: join(directory, 'holds', 'killed'),
        label: 'dash-job-killed',
        waitSeconds: 0,
        pollSeconds: 1,
        signal: never,
        report,
      },
      process.env,
    );
    if (outcome.kind !== 'held') throw new Error(`not held: ${outcome.kind}`);
    process.kill(-outcome.hold.pid, 'SIGKILL');
    await outcome.hold.exited;
    // The holder record survives SIGKILL; the flock does not.
    expect(readFileSync(`${lock.lockPath}.d/holder`, 'utf8').trim()).toBe(String(outcome.hold.pid));
    const log = join(directory, 'log');
    const next = spawn(
      'bash',
      ['-c', 'source "$1" && with_heavy_lock "$2" -- true', 'next', lock.library, lock.lockPath],
      { stdio: ['ignore', 'ignore', 'pipe'], env: { PATH: process.env['PATH'] ?? '' } },
    );
    let stderr = '';
    next.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    const code = await new Promise<number | null>((resolveExit) => next.once('exit', resolveExit));
    expect(code).toBe(0);
    expect(stderr).toContain(
      `reclaiming ${lock.lockPath}.d from dead pid ${String(outcome.hold.pid)}`,
    );
    expect(intervalsOf(log).size).toBe(0);
  });

  test('a hold file that exists already is refused before any ticket', async () => {
    const directory = scratch();
    const lock = privateLegacyLock(directory);
    const holdFile = join(directory, 'taken');
    writeFileSync(holdFile, '');
    let refusal: unknown;
    try {
      await holdLegacyLock(
        lock,
        {
          holdFile,
          label: 'dash-job-twice',
          waitSeconds: 0,
          pollSeconds: 1,
          signal: never,
          report,
        },
        process.env,
      );
    } catch (cause) {
      refusal = cause;
    }
    expect(String(refusal)).toContain('EEXIST');
    expect(readLegacyQueue(lock).holder).toEqual({ kind: 'none' });
  });

  test('status refuses an unreadable holder record rather than report no holder', async () => {
    const directory = scratch();
    const lock = privateLegacyLock(directory);
    const outcome = await holdLegacyLock(
      lock,
      {
        holdFile: join(directory, 'holds', 'hidden'),
        label: 'dash-job-hidden',
        waitSeconds: 0,
        pollSeconds: 1,
        signal: never,
        report,
      },
      process.env,
    );
    if (outcome.kind !== 'held') throw new Error(`not held: ${outcome.kind}`);
    chmodSync(`${lock.lockPath}.d`, 0o000);
    try {
      expect(() => readLegacyQueue(lock)).toThrow("the shell lock's status refused (exit 70)");
    } finally {
      chmodSync(`${lock.lockPath}.d`, 0o700);
      outcome.hold.release();
      await outcome.hold.exited;
    }
  });
});
