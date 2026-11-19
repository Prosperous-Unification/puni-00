import * as fs from 'node:fs';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import { directoryUsage, UNREADABLE_PATH_LIMIT } from './scope';

/**
 * `dash-host-jobs` task 6.23, the tmp walk of every sample: a subtree the sampler may not read
 * (the gate's own mode-0 test fixture under `TMPDIR`) is listed and the rest still counted; the
 * tmp directory itself absent or unreadable still throws, which the sampler records as a
 * telemetry failure. Needs a user that file modes bind (not root).
 */
describe('directoryUsage (task 6.23, A-TMP-TELEMETRY-1)', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      chmodSync(root, 0o700);
      for (const locked of ['inaccessible', 'a/locked', 'b/locked'])
        try {
          chmodSync(join(root, locked), 0o700);
        } catch {
          // Not every scenario creates every locked directory.
        }
      rmSync(root, { recursive: true, force: true });
    }
  });

  function scratch(): string {
    const root = mkdtempSync(join(tmpdir(), 'dash-scope-usage-'));
    roots.push(root);
    return root;
  }

  test('a mode-0 subdirectory is listed and the rest is counted', () => {
    const root = scratch();
    writeFileSync(join(root, 'scratch'), Buffer.alloc(1024 * 1024));
    mkdirSync(join(root, 'wbs-shared-process-XYrBbJ', 'inaccessible'), { recursive: true });
    writeFileSync(join(root, 'wbs-shared-process-XYrBbJ', 'inaccessible', 'hidden'), 'x');
    const whole = directoryUsage(root);
    chmodSync(join(root, 'wbs-shared-process-XYrBbJ', 'inaccessible'), 0o000);
    try {
      const usage = directoryUsage(root);
      expect(usage.unreadable).toEqual(['wbs-shared-process-XYrBbJ/inaccessible']);
      expect(usage.unreadableOmitted).toBe(0);
      expect(usage.bytes).toBeGreaterThanOrEqual(1024 * 1024);
      // The unreadable directory's own blocks count; its contents cannot.
      expect(usage.bytes).toBeLessThan(whole.bytes);
    } finally {
      chmodSync(join(root, 'wbs-shared-process-XYrBbJ', 'inaccessible'), 0o700);
    }
    expect(whole.unreadable).toEqual([]);
  });

  test('unreadable paths are sorted and bounded, the rest counted', () => {
    const root = scratch();
    const count = UNREADABLE_PATH_LIMIT + 3;
    const names = Array.from({ length: count }, (_, index) => `d${String(index).padStart(3, '0')}`);
    for (const name of names) mkdirSync(join(root, name));
    for (const name of names) chmodSync(join(root, name), 0o000);
    try {
      const usage = directoryUsage(root);
      expect(usage.unreadable).toEqual(names.slice(0, UNREADABLE_PATH_LIMIT));
      expect(usage.unreadableOmitted).toBe(3);
    } finally {
      for (const name of names) chmodSync(join(root, name), 0o700);
    }
  });

  test('an unreadable tmp directory is still a failure', () => {
    const root = scratch();
    chmodSync(root, 0o000);
    expect(() => directoryUsage(root)).toThrow(/EACCES/);
  });

  test('an absent tmp directory is still a failure', () => {
    const root = scratch();
    expect(() => directoryUsage(join(root, 'absent'))).toThrow(/ENOENT/);
  });

  test('an entry that vanishes mid-walk counts as gone', () => {
    const root = scratch();
    mkdirSync(join(root, 'kept'));
    writeFileSync(join(root, 'kept', 'file'), Buffer.alloc(8192));
    mkdirSync(join(root, 'vanishing'));
    writeFileSync(join(root, 'vanishing', 'file'), 'x');
    writeFileSync(join(root, 'gone'), 'x');
    // `gone` is removed after the listing that named it, before the walk reads it; `vanishing`
    // after the walk read it as a directory, before it lists it.
    const originalReaddir = fs.readdirSync;
    const originalLstat = fs.lstatSync;
    const readdir = spyOn(fs, 'readdirSync').mockImplementation(((path: string) => {
      const entries = originalReaddir(path);
      if (path === root) rmSync(join(root, 'gone'));
      return entries;
    }) as typeof fs.readdirSync);
    const lstat = spyOn(fs, 'lstatSync').mockImplementation(((path: string) => {
      const identity = originalLstat(path);
      if (path === join(root, 'vanishing')) rmSync(path, { recursive: true });
      return identity;
    }) as typeof fs.lstatSync);
    try {
      const usage = directoryUsage(root);
      expect(usage.unreadable).toEqual([]);
      expect(usage.bytes).toBeGreaterThanOrEqual(8192);
      expect(readdir).toHaveBeenCalledWith(join(root, 'vanishing'));
      expect(lstat).toHaveBeenCalledWith(join(root, 'gone'));
    } finally {
      readdir.mockRestore();
      lstat.mockRestore();
    }
  });
});
