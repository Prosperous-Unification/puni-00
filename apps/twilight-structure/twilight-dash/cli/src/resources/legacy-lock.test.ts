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
  overlaps,
  privateLegacyLock,
  startLegacyCaller,
} from './legacy-lock.test.fixture';

/**
 * Dash's legacy holder against the real shell lock library (`dash-host-jobs` J12, J13): a hold
 * is a real `with_heavy_lock` ticket, holder record and label, so `status` and legacy callers
 * see it as one of their own, and it outlives the Dash process that took it.
 */
describe('span logs judge order by line position, never by clock (CI of #825)', () => {
  function logOf(lines: string[]): string {
    const directory = mkdtempSync(join(tmpdir(), 'dash-span-log-'));
    const log = join(directory, 'log');
    writeFileSync(log, `${lines.join('\n')}\n`);
    return log;
  }
  function spanOf(spans: ReturnType<typeof intervalsOf>, name: string) {
    const span = spans.get(name);
    if (span === undefined) throw new Error(`no span ${name}`);
    return span;
  }

  test('a wall clock stepped backwards between two runs fakes no overlap', () => {
    // b ran after a, but its clock read 1 s earlier than a's end.
    const spans = intervalsOf(logOf(['start a 1000', 'end a 3000', 'start b 2000', 'end b 4000']));
    // Proof: judging by the clocks (start/end set from the ms field) made this see an overlap
    // (2026-11-03, fix/observe-mode-span-overlap).
    expect(overlaps(spanOf(spans, 'a'), spanOf(spans, 'b'))).toBe(false);
  });

  test('runs that touch within one millisecond do not overlap; interleaved lines do', () => {
    const touching = intervalsOf(
      logOf(['start a 1000', 'end a 2000', 'start b 2000', 'end b 3000']),
    );
    expect(overlaps(spanOf(touching, 'a'), spanOf(touching, 'b'))).toBe(false);
    const interleaved = intervalsOf(
      logOf(['start a 1000', 'start b 1500', 'end a 2000', 'end b 3000']),
    );
    expect(overlaps(spanOf(interleaved, 'a'), spanOf(interleaved, 'b'))).toBe(true);
  });

  test('an unfinished span, a repeated start or a stray end is refused, not read as overlap', () => {
    const open = intervalsOf(logOf(['start a 1000', 'start b 1500', 'end b 3000']));
    // Proof: reading a missing end as +∞ made this report an overlap instead of refusing
    // (2026-11-03, fix/observe-mode-span-overlap).
    expect(() => overlaps(spanOf(open, 'a'), spanOf(open, 'b'))).toThrow(
      'a span without an end line cannot be judged for overlap',
    );
    expect(() => intervalsOf(logOf(['start a 1', 'start a 2']))).toThrow('a started twice');
    expect(() => intervalsOf(logOf(['end a 1']))).toThrow('a ended without a start');
  });
});

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

  test('Dash killed while its holder queues: the holder claims, holds and releases cleanly', async () => {
    const directory = scratch();
    const lock = privateLegacyLock(directory);
    const log = join(directory, 'log');
    const legacy = startLegacyCaller(lock, 'first', log, { waitSeconds: 0, seconds: 8 });
    await eventually('the legacy holder', () => intervalsOf(log).has('first'));
    const holdFile = join(directory, 'holds', 'queued');
    const script = join(directory, 'queue.ts');
    writeFileSync(
      script,
      [
        `import { holdLegacyLock } from ${JSON.stringify(join(import.meta.dir, 'legacy-lock'))};`,
        `await holdLegacyLock(${JSON.stringify(lock)}, { holdFile: ${JSON.stringify(holdFile)}, label: 'dash-job-queued', waitSeconds: 30, pollSeconds: 1, signal: new AbortController().signal, report: (line) => process.stderr.write(line + '\\n') }, process.env);`,
      ].join('\n'),
    );
    const taker = spawn(process.execPath, [script], { stdio: ['ignore', 'ignore', 'pipe'] });
    const takerExit = new Promise((resolveExit) => taker.once('exit', resolveExit));
    await eventually('the queued ticket', () => readLegacyQueue(lock).waiters.length === 1);
    taker.kill('SIGKILL');
    await takerExit;
    expect(await legacy.exited).toBe(0);
    // The holder outlived its Dash, claimed in its turn and holds under its own label.
    await eventually(
      'the orphaned holder to claim',
      () => readLegacyQueue(lock).holder.kind === 'held',
    );
    const holder = readLegacyQueue(lock).holder;
    expect(holder.kind === 'held' && holder.label).toBe('dash-job-queued');
    // The hold file names the holder's pid, boot and start (review K5).
    const pid = Number(readFileSync(holdFile, 'utf8').split(' ')[0]);
    expect(holder.kind === 'held' && holder.pid).toBe(pid);
    expect(await startLegacyCaller(lock, 'early', log, { waitSeconds: 0, seconds: 0 }).exited).toBe(
      75,
    );
    rmSync(holdFile);
    const next = spawn(
      'bash',
      ['-c', 'source "$1" && with_heavy_lock "$2" -- true', 'next', lock.library, lock.lockPath],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: {
          PATH: process.env['PATH'] ?? '',
          HEAVY_LOCK_WAIT_SECONDS: '10',
          HEAVY_LOCK_POLL_SECONDS: '1',
        },
      },
    );
    let stderr = '';
    next.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    expect(await new Promise<number | null>((resolveExit) => next.once('exit', resolveExit))).toBe(
      0,
    );
    // Released by its own trap, not reclaimed from a dead pid.
    expect(stderr).not.toContain('reclaiming');
  }, 30_000);

  test('a holder that ends 0 without holding is refused 70', async () => {
    const directory = scratch();
    const library = join(directory, 'fake-lib.sh');
    writeFileSync(library, 'with_heavy_lock() { return 0; }\n');
    const outcome = await holdLegacyLock(
      { library, lockPath: join(directory, 'heavy.lock') },
      {
        holdFile: join(directory, 'holds', 'silent'),
        label: 'dash-job-silent',
        waitSeconds: 0,
        pollSeconds: 1,
        signal: never,
        report,
      },
      process.env,
    );
    expect(outcome).toEqual({
      kind: 'refused',
      exitCode: 70,
      reason: 'the shell holder ended without holding',
    });
    expect(existsSync(join(directory, 'holds', 'silent'))).toBe(false);
  });

  test('a holder whose log cannot be written still holds, by the lock record itself', async () => {
    const directory = scratch();
    const library = join(directory, 'full-lib.sh');
    // The real library, with the holder's stdout on a full device: its `held` line is lost.
    writeFileSync(library, `source ${JSON.stringify(LOCK_LIBRARY)}\nexec 1>/dev/full\n`);
    const lock = { library, lockPath: join(directory, 'heavy.lock') };
    const outcome = await holdLegacyLock(
      lock,
      {
        holdFile: join(directory, 'holds', 'full'),
        label: 'dash-job-full',
        waitSeconds: 0,
        pollSeconds: 1,
        signal: never,
        report,
        claimGraceMs: 2000,
      },
      process.env,
    );
    if (outcome.kind !== 'held') throw new Error(`not held: ${JSON.stringify(outcome)}`);
    expect(readLegacyQueue(privateLegacyLock(directory)).holder).toEqual({
      kind: 'held',
      pid: outcome.hold.pid,
      label: 'dash-job-full',
    });
    outcome.hold.release();
    expect(await outcome.hold.exited).toBe(0);
  });

  test('a holder that neither claims nor ends is ended at its bound', async () => {
    const directory = scratch();
    const library = join(directory, 'stuck-lib.sh');
    writeFileSync(library, 'with_heavy_lock() { sleep 600; }\n');
    const started = Date.now();
    const outcome = await holdLegacyLock(
      { library, lockPath: join(directory, 'heavy.lock') },
      {
        holdFile: join(directory, 'holds', 'stuck'),
        label: 'dash-job-stuck',
        waitSeconds: 0,
        pollSeconds: 1,
        signal: never,
        report,
        claimGraceMs: 300,
      },
      process.env,
    );
    expect(outcome).toEqual({
      kind: 'refused',
      exitCode: 70,
      reason: 'the shell holder neither held nor ended within 0s and its grace',
    });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(existsSync(join(directory, 'holds', 'stuck'))).toBe(false);
  });

  test('a holder that cannot start is refused 70', async () => {
    const directory = scratch();
    const outcome = await holdLegacyLock(
      privateLegacyLock(directory),
      {
        holdFile: join(directory, 'holds', 'nobash'),
        label: 'dash-job-nobash',
        waitSeconds: 0,
        pollSeconds: 1,
        signal: never,
        report,
      },
      { PATH: join(directory, 'no-such-bin') },
    );
    expect(outcome).toEqual({ kind: 'refused', exitCode: 70 });
    expect(existsSync(join(directory, 'holds', 'nobash'))).toBe(false);
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
