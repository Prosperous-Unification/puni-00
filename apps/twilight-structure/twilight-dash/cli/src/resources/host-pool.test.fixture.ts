import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { expect, test } from 'bun:test';

import type { JobTypeDescriptor } from './host-pool';
import type { HostFacts } from './runtime';

/**
 * Register `path`'s tests to rerun inside a private user and PID namespace, as runtime.test.ts
 * does: `/proc` inspection then sees only the suite's own processes, so an unrelated
 * non-dumpable process of this account cannot block a release the test expects. Returns true
 * inside the namespace, where the caller registers its real tests.
 */
export function insideLinuxNamespace(path: string): boolean {
  if (process.env['DASH_RESOURCE_TEST_NAMESPACE'] === '1') return true;
  test(`${basename(path)} in a private Linux namespace`, () => {
    const execution = Bun.spawnSync(
      [
        'unshare',
        '--user',
        '--map-root-user',
        '--pid',
        '--fork',
        '--mount-proc',
        'setpriv',
        '--bounding-set=-sys_ptrace',
        process.execPath,
        'test',
        path,
        '--timeout=120000',
      ],
      {
        env: { ...process.env, DASH_RESOURCE_TEST_NAMESPACE: '1' },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 240000,
      },
    );
    if (execution.exitCode !== 0)
      throw new Error(execution.stdout.toString() + execution.stderr.toString());
    expect(execution.exitCode).toBe(0);
  }, 240000);
  return false;
}

/** A host that has whatever the scenario's pool asks for. */
export const ampleHost: HostFacts = { cpuCores: () => 64, memoryGib: () => 256 };

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
};

/** Run Git in a fixture tree; a refusal throws with its stderr. */
export function fixtureGit(tree: string, ...arguments_: string[]): string {
  const execution = Bun.spawnSync(['git', '-C', tree, ...arguments_], {
    env: GIT_ENV,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (execution.exitCode !== 0) throw new Error(execution.stderr.toString());
  return execution.stdout.toString().trim();
}

/** A one-commit Git tree standing in for a gate checkout. */
export function gateTree(path: string): string {
  mkdirSync(path, { recursive: true });
  fixtureGit(path, 'init', '--quiet');
  writeFileSync(join(path, 'README'), 'gate tree\n');
  writeFileSync(join(path, '.gitignore'), 'node_modules/\n');
  fixtureGit(path, 'add', 'README', '.gitignore');
  fixtureGit(path, 'commit', '--quiet', '-m', 'resting commit');
  return path;
}

export interface PoolShape {
  cpuCores: number;
  memoryGib: number;
  headroom: { cpuCores: number; memoryGib: number };
  /** How many `gate_tree` units the pool names; each is a fresh one-commit Git tree. */
  gateTrees: number;
  workspaceSlots?: number;
  /** A fake `wbs_mk_` key; the test supplies it because only tests may import the helper. */
  credential: string;
}

/** A fresh managed root, its gate trees and an owner-only schema-3 configuration. */
export function hostPoolFixture(shape: PoolShape, overrides: Record<string, unknown> = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'dash-host-pool-')));
  const root = join(base, 'managed');
  mkdirSync(root, { mode: 0o700 });
  const trees = Array.from({ length: shape.gateTrees }, (_, index) =>
    gateTree(join(base, `gate-tree-${String(index)}`)),
  );
  const config = join(base, 'config.json');
  writeFileSync(
    config,
    JSON.stringify({
      schemaVersion: 3,
      root,
      authorityId: 'runtime-one',
      epoch: 'epoch-one',
      providerId: 'provider-one',
      mcpResource: 'http://127.0.0.1:3100/mcp',
      credential: shape.credential,
      diskUnitBytes: 1073741824,
      diskBudgetUnits: 16,
      workspaceSlots: shape.workspaceSlots ?? 16,
      headroomBytes: 0,
      cpuCores: shape.cpuCores,
      memoryGib: shape.memoryGib,
      headroom: shape.headroom,
      exclusiveUnits: trees.length === 0 ? {} : { gate_tree: trees },
      enrollmentId: 'enrollment-one',
      ...overrides,
    }),
    { mode: 0o600 },
  );
  return {
    base,
    root,
    config,
    trees,
    remove: () => {
      rmSync(base, { recursive: true, force: true });
    },
  };
}

/** A job type as the catalogue port would supply it. */
export function jobType(
  id: string,
  cpuCores: number,
  memoryGib: number,
  exclusive: string[] = [],
  tmpDiskGib = 0,
): JobTypeDescriptor {
  return {
    id,
    envelope: { cpuCores, memoryGib, tmpDiskGib, exclusive },
    containers: 'none',
    enforcement: 'observe',
  };
}
export const gate = jobType('gate', 4, 6, ['gate_tree']);
export const build = jobType('website-dev-build', 2, 2);
