import { rejects } from 'node:assert/strict';
import { access, chmod, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { createSolverScratch, readSolverChild } from './solver-scratch';

async function isPresent(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
    throw cause;
  }
}

test('solver scratch retires after a settled case and a rejected fixture construction', async () => {
  let completedRoot: string;
  {
    await using scratch = createSolverScratch('solver-settled-');
    completedRoot = scratch.root;
    await writeFile(join(scratch.root, 'owned'), 'completed');
  }
  expect(await isPresent(completedRoot)).toBe(false);
  let rejectedRoot = '';
  await rejects(async () => {
    await using scratch = createSolverScratch('solver-rejected-');
    rejectedRoot = scratch.root;
    await writeFile(join(scratch.root, 'owned'), 'setup');
    throw new Error('injected fixture construction refusal');
  }, /injected fixture construction refusal/);
  expect(await isPresent(rejectedRoot)).toBe(false);
});

for (const fault of ['normal', 'marker-write'] as const) {
  test(`solver scratch retains original child and pipe custody through ${fault} until explicit retirement`, async () => {
    const entered = Promise.withResolvers<undefined>();
    const retire = Promise.withResolvers<undefined>();
    const drained = Promise.withResolvers<undefined>();
    const releaseRead = Promise.withResolvers<undefined>();
    const markerFailed = Promise.withResolvers<undefined>();
    let ownedRoot = '';
    let originalChild: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
    let markerFailure: unknown;
    let watchdogUsed = false;
    const watchdog = setTimeout(() => {
      watchdogUsed = true;
      retire.resolve(undefined);
      releaseRead.resolve(undefined);
      originalChild?.kill('SIGKILL');
    }, 5000);
    const owner = (async () => {
      await using scratch = createSolverScratch('solver-held-');
      ownedRoot = scratch.root;
      const marker = join(scratch.root, 'retire-marker');
      await writeFile(marker, 'hold', { mode: fault === 'marker-write' ? 0o400 : 0o600 });
      const observeRetirement = scratch.requireRetirement();
      const child = Bun.spawn(
        [
          process.execPath,
          '-e',
          `import {readFileSync} from 'node:fs'; await Bun.write('child-ready', 'ready'); process.stdout.write('owned '); await Bun.sleep(5); console.log('child ready'); while (readFileSync('retire-marker','utf8') !== 'retire') await Bun.sleep(10);`,
        ],
        { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', cwd: scratch.root },
      );
      originalChild = child;
      const stdout = (async () => {
        const reader = child.stdout.getReader();
        try {
          const expected = 'owned child ready\n';
          let readiness = '';
          while (readiness !== expected) {
            const frame = await reader.read();
            if (frame.done || frame.value.byteLength > expected.length - readiness.length)
              throw new Error('original child readiness differs');
            readiness += new TextDecoder().decode(frame.value);
            if (!expected.startsWith(readiness))
              throw new Error('original child readiness differs');
          }
          entered.resolve(undefined);
          for (;;) {
            const frame = await reader.read();
            if (frame.done) break;
          }
          drained.resolve(undefined);
          await releaseRead.promise;
        } catch (cause) {
          entered.reject(cause);
          throw cause;
        } finally {
          reader.releaseLock();
        }
      })();
      const stderr = new Response(child.stderr).text();
      const settlement = Promise.allSettled([child.exited, stdout, stderr] as const);
      const retirement = observeRetirement([child.exited, stdout, stderr]);
      let observations: Awaited<typeof settlement>;
      try {
        await entered.promise;
        if (fault === 'normal') await retire.promise;
      } finally {
        await writeFile(marker, 'retire').catch((cause: unknown) => {
          markerFailure = cause;
          markerFailed.resolve(undefined);
          throw cause;
        });
        observations = await settlement;
        await retirement;
      }
      for (const observation of observations)
        if (observation.status === 'rejected') throw observation.reason;
    })();
    const observedOwner = owner.then(
      () => ({ kind: 'complete' as const }),
      (cause: unknown) => ({ kind: 'failed' as const, cause }),
    );
    try {
      await Promise.race([entered.promise, owner]);
      const child = originalChild;
      if (child === undefined) throw new Error('owned child absent');
      if (fault === 'marker-write') {
        await Promise.race([markerFailed.promise, owner]);
        expect(markerFailure).toMatchObject({ code: 'EACCES' });
      }
      expect(child.exitCode).toBeNull();
      expect(
        await Promise.race([observedOwner.then(() => 'settled'), Bun.sleep(25).then(() => 'held')]),
      ).toBe('held');
      expect(await isPresent(ownedRoot)).toBe(true);
      if (fault === 'marker-write') {
        await chmod(join(ownedRoot, 'retire-marker'), 0o600);
        await writeFile(join(ownedRoot, 'retire-marker'), 'retire');
      } else retire.resolve(undefined);
      await Promise.race([drained.promise, owner]);
      expect(
        await Promise.race([observedOwner.then(() => 'settled'), Bun.sleep(25).then(() => 'held')]),
      ).toBe('held');
      expect(await isPresent(ownedRoot)).toBe(true);
      releaseRead.resolve(undefined);
      const verdict = await observedOwner;
      if (fault === 'marker-write') {
        expect(verdict.kind).toBe('failed');
        if (verdict.kind !== 'failed') throw new Error('marker refusal lost');
        expect(verdict.cause).toBe(markerFailure);
      } else expect(verdict.kind).toBe('complete');
      expect(child.exitCode).toBe(0);
      expect(child.signalCode).toBeNull();
      expect(await isPresent(ownedRoot)).toBe(false);
      expect(() => process.kill(child.pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
      expect(watchdogUsed).toBe(false);
    } finally {
      retire.resolve(undefined);
      releaseRead.resolve(undefined);
      try {
        if (await isPresent(join(ownedRoot, 'retire-marker'))) {
          await chmod(join(ownedRoot, 'retire-marker'), 0o600);
          await writeFile(join(ownedRoot, 'retire-marker'), 'retire');
        }
        await observedOwner;
      } finally {
        clearTimeout(watchdog);
      }
    }
  }, 10000);
}

test('solver scratch retains its root when an original child read continuation rejects', async () => {
  let retainedRoot = '';
  let originalChild: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
  const originalFailure = new Error('injected original read continuation refusal');
  try {
    await rejects(
      async () => {
        await using scratch = createSolverScratch('solver-rejected-read-');
        retainedRoot = scratch.root;
        const observeRetirement = scratch.requireRetirement();
        const child = Bun.spawn([process.execPath, '-e', "console.log('owned original EOF');"], {
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          cwd: scratch.root,
        });
        originalChild = child;
        const stdout = new Response(child.stdout).text().then(() => {
          throw originalFailure;
        });
        const stderr = new Response(child.stderr).text();
        await observeRetirement([child.exited, stdout, stderr]);
      },
      (cause: unknown) => cause instanceof AggregateError && cause.errors.includes(originalFailure),
    );
    expect(await isPresent(retainedRoot)).toBe(true);
    const child = originalChild;
    if (child === undefined) throw new Error('owned original child absent');
    expect(child.exitCode).toBe(0);
    expect(child.signalCode).toBeNull();
    expect(() => process.kill(child.pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
  } finally {
    // Attended teardown after the original child and raw pipes are known terminal;
    // the rejected continuation never authorizes the resource's automatic removal.
    if (originalChild !== undefined) await originalChild.exited;
    await rm(retainedRoot, { recursive: true, force: true });
  }
});

test('solver child reader registers original retirement before a caller marker write can reject', async () => {
  let ownedRoot = '';
  let originalChild: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
  let originalRead: ReturnType<typeof readSolverChild> | undefined;
  let markerFailure: unknown;
  const markerFailed = Promise.withResolvers<undefined>();
  let watchdogUsed = false;
  const watchdog = setTimeout(() => {
    watchdogUsed = true;
    originalChild?.kill('SIGKILL');
  }, 5000);
  const owner = (async () => {
    await using scratch = createSolverScratch('solver-reader-marker-');
    ownedRoot = scratch.root;
    const marker = join(scratch.root, 'retire-marker');
    const entered = join(scratch.root, 'child-entered');
    await writeFile(marker, 'hold', { mode: 0o400 });
    originalRead = readSolverChild(scratch, () => {
      const child = Bun.spawn(
        [
          process.execPath,
          '-e',
          `import{readFileSync}from'node:fs';await Bun.write('child-entered','ready');while(readFileSync('retire-marker','utf8')!=='retire')await Bun.sleep(10);`,
        ],
        { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', cwd: scratch.root },
      );
      originalChild = child;
      return child;
    });
    while (!(await isPresent(entered))) await Bun.sleep(10);
    try {
      await writeFile(marker, 'retire');
    } catch (cause) {
      markerFailure = cause;
      markerFailed.resolve(undefined);
      throw cause;
    }
    await originalRead;
  })();
  const observedOwner = owner.then(
    () => ({ kind: 'complete' as const }),
    (cause: unknown) => ({ kind: 'failed' as const, cause }),
  );
  try {
    await Promise.race([markerFailed.promise, owner]);
    expect(markerFailure).toMatchObject({ code: 'EACCES' });
    const child = originalChild;
    if (child === undefined) throw new Error('owned original reader child absent');
    expect(child.exitCode).toBeNull();
    expect(
      await Promise.race([observedOwner.then(() => 'settled'), Bun.sleep(25).then(() => 'held')]),
    ).toBe('held');
    expect(await isPresent(ownedRoot)).toBe(true);
    await chmod(join(ownedRoot, 'retire-marker'), 0o600);
    await writeFile(join(ownedRoot, 'retire-marker'), 'retire');
    const original = originalRead;
    if (original === undefined) throw new Error('owned original reader absent');
    const observations = await original;
    expect(observations.code).toBe(0);
    expect(observations.stdout).toBe('');
    expect(observations.stderr).toBe('');
    const verdict = await observedOwner;
    if (verdict.kind !== 'failed') throw new Error('marker write refusal lost');
    expect(verdict.cause).toBe(markerFailure);
    expect(await isPresent(ownedRoot)).toBe(false);
    expect(() => process.kill(child.pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
    expect(watchdogUsed).toBe(false);
  } finally {
    try {
      if (await isPresent(join(ownedRoot, 'retire-marker'))) {
        await chmod(join(ownedRoot, 'retire-marker'), 0o600);
        await writeFile(join(ownedRoot, 'retire-marker'), 'retire');
      }
      if (originalRead !== undefined) await originalRead;
      await observedOwner;
    } finally {
      clearTimeout(watchdog);
    }
  }
}, 10000);
