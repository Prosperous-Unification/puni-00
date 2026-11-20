import * as fs from 'node:fs';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, spyOn, test } from 'bun:test';

import {
  describeLeftover,
  directoryUsage,
  leftoverMembers,
  linuxScopeTelemetry,
  SCOPE_SUBTREE_LIMIT,
  scopeSubtreeMembers,
  UNREADABLE_PATH_LIMIT,
} from './scope';

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

/**
 * `dash-host-jobs` task 6.24, which pids the leftover ending reads: the job scope's own
 * `cgroup.procs` for the record's descriptions, the scope's whole subtree for its count and its
 * wait (what `systemctl --user kill` reaches), never a parent slice or another job's scope. A
 * `j19-holder-*` scope is a sibling under the slice in practice; the nested cgroup below is the
 * defence case of a payload that made one below its own scope (review of #954 S3-2).
 */
describe('leftoverMembers (task 6.24, A-SCOPE-LEFTOVER-1)', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  const id = '29b8b406-0000-4000-8000-000000000000';
  const slice = '/user.slice/user-1001.slice/user@1001.service/app.slice';
  const scope = `${slice}/dash-job-${id}.scope`;

  /** A cgroup hierarchy: the slice holds pid 7, the job scope 11 and 12, a cgroup nested below it 99. */
  function hierarchy(): string {
    const root = mkdtempSync(join(tmpdir(), 'dash-leftover-cgroup-'));
    roots.push(root);
    const holder = join(root, scope, `j19-holder-${id}.scope`);
    mkdirSync(holder, { recursive: true });
    writeFileSync(join(root, slice, 'cgroup.procs'), '7\n');
    writeFileSync(join(root, scope, 'cgroup.procs'), '11\n12\n');
    writeFileSync(join(holder, 'cgroup.procs'), '99\n');
    return root;
  }

  test('a cgroup nested below the job scope is never described', () => {
    // Proof: reading every nested `cgroup.procs` in `linuxScopeTelemetry().members` made this
    // list `[11, 12, 99]` (2026-11-19, task 6.24).
    expect(leftoverMembers(linuxScopeTelemetry(hierarchy()), scope, id)).toEqual([11, 12]);
  });

  test('a cgroup nested below the job scope is counted and awaited (review of #954 S3-2)', () => {
    const root = hierarchy();
    // Proof: walking only the scope itself in `scopeSubtreeMembers` made this list `[11, 12]`
    // (2026-11-19, review of #954 S3-2).
    expect(scopeSubtreeMembers(linuxScopeTelemetry(root), scope, id).sort()).toEqual([11, 12, 99]);
    expect(() => scopeSubtreeMembers(linuxScopeTelemetry(root), slice, id)).toThrow(
      `${slice} is not the scope of host job ${id}`,
    );
  });

  test('a subtree past its cgroup bound is refused, not read in part', () => {
    const root = hierarchy();
    for (let index = 0; index < SCOPE_SUBTREE_LIMIT; index++)
      mkdirSync(join(root, scope, `nested-${String(index)}`));
    expect(() => scopeSubtreeMembers(linuxScopeTelemetry(root), scope, id)).toThrow(
      `has more than ${String(SCOPE_SUBTREE_LIMIT)} cgroups`,
    );
  });

  test("a parent slice or another job's scope is never enumerated", () => {
    const telemetry = linuxScopeTelemetry(hierarchy());
    expect(() => leftoverMembers(telemetry, slice, id)).toThrow(
      `${slice} is not the scope of host job ${id}`,
    );
    expect(() => leftoverMembers(telemetry, `${slice}/dash-job-other.scope`, id)).toThrow(
      'is not the scope of host job',
    );
  });

  test('a collected scope has no leftovers', () => {
    const root = hierarchy();
    rmSync(join(root, scope), { recursive: true });
    expect(leftoverMembers(linuxScopeTelemetry(root), scope, id)).toEqual([]);
  });

  test('a leftover is described by comm and truncated command line; a gone one is null', () => {
    const proc = mkdtempSync(join(tmpdir(), 'dash-leftover-proc-'));
    roots.push(proc);
    mkdirSync(join(proc, '42'));
    writeFileSync(join(proc, '42', 'comm'), 'node\n');
    writeFileSync(join(proc, '42', 'cmdline'), `node\0serve.cjs\0${'x'.repeat(200)}\0`);
    expect(describeLeftover(42, proc)).toEqual({
      pid: 42,
      comm: 'node',
      cmdline: `node serve.cjs ${'x'.repeat(200)}`.slice(0, 120),
    });
    expect(describeLeftover(43, proc)).toBeNull();
  });
});
