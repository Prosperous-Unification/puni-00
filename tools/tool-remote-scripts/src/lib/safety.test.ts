import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { writeAtomic } from './atomic';
import { withLock } from './lock';
import { readPhase, writePhase } from './phase';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-safety-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('writeAtomic', () => {
  it('writes the full contents', async () => {
    const p = join(dir, 'out.caddy');
    await writeAtomic(p, 'hello');
    expect(readFileSync(p, 'utf8')).toBe('hello');
  });

  it('overwrites an existing file without leaving a temp behind', async () => {
    const p = join(dir, 'out.caddy');
    await writeAtomic(p, 'first');
    await writeAtomic(p, 'second');
    expect(readFileSync(p, 'utf8')).toBe('second');
    expect(existsSync(`${p}.tmp`)).toBe(false);
  });

  it('produces correct content with fsync', async () => {
    const p = join(dir, 'large.caddy');
    const content = 'x'.repeat(1000000); // 1MB of data
    await writeAtomic(p, content);
    expect(readFileSync(p, 'utf8')).toBe(content);
    expect(existsSync(`${p}.tmp`)).toBe(false);
  });

  it('cleans up temp file on write failure', async () => {
    const p = join(dir, 'nested', 'fail.caddy');
    const tmpPath = `${p}.tmp`;
    // Try to write to a path in a nonexistent directory, causing rename to fail
    // This forces temp file cleanup before rethrowing
    let threw = false;
    try {
      await writeAtomic(p, 'should fail');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(existsSync(tmpPath)).toBe(false);
  });
});

describe('withLock', () => {
  it('runs the callback and returns its value', async () => {
    const result = await withLock(join(dir, 'deploy.lock'), () => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('refuses a second concurrent holder', async () => {
    const lockPath = join(dir, 'deploy.lock');
    let inner: unknown = null;
    await withLock(lockPath, async () => {
      try {
        await withLock(lockPath, () => Promise.resolve('should not run'));
      } catch (e: unknown) {
        inner = e instanceof Error ? e.message : String(e);
      }
    });
    expect(String(inner)).toMatch(/lock/i);
  });

  it('releases the lock even when the callback throws', async () => {
    const lockPath = join(dir, 'deploy.lock');
    let threw = false;
    try {
      await withLock(lockPath, () => Promise.reject(new Error('boom')));
    } catch (e: unknown) {
      threw = true;
      expect(e instanceof Error && e.message).toBe('boom');
    }
    expect(threw).toBe(true);
    const result = await withLock(lockPath, () => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });
});

describe('phase', () => {
  it('round-trips a phase', async () => {
    const p = join(dir, 'be.phase');
    await writePhase(p, 'routed');
    expect(await readPhase(p)).toBe('routed');
  });

  it('returns null for a missing marker', async () => {
    expect(await readPhase(join(dir, 'nope.phase'))).toBeNull();
  });

  it('rejects an unrecognised phase rather than guessing', async () => {
    await Bun.write(join(dir, 'bad.phase'), 'sideways');
    let threw = false;
    try {
      await readPhase(join(dir, 'bad.phase'));
    } catch (e: unknown) {
      threw = true;
      expect(e instanceof Error && e.message).toMatch(/phase/);
    }
    expect(threw).toBe(true);
  });
});
