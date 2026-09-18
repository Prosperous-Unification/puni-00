import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import { assertNotDowngrade, assertOnMainline } from './source';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const child = Bun.spawnSync({
    cmd: ['git', '-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString().trim();
}

/** main: first → second; side: first → side. */
function history() {
  const root = scratchSync('wbs-source-');
  roots.push(root);
  git(root, 'init', '--quiet', '-b', 'main');
  const commit = (name: string) => {
    writeFileSync(join(root, name), name);
    git(root, 'add', name);
    git(root, 'commit', '--quiet', '-m', name);
    return git(root, 'rev-parse', 'HEAD');
  };
  const first = commit('first');
  const second = commit('second');
  git(root, 'checkout', '--quiet', '-b', 'side', first);
  const side = commit('side');
  git(root, 'checkout', '--quiet', 'main');
  return { root, first, second, side };
}

describe('source commit checks', () => {
  it('accepts a commit on main and refuses a commit main never took', () => {
    const { root, second, side } = history();
    expect(() => {
      assertOnMainline(root, second, 'main');
    }).not.toThrow();
    expect(() => {
      assertOnMainline(root, side, 'main');
    }).toThrow(`${side} is not on main's history`);
  });

  it('refuses an unknown commit instead of calling it off-main', () => {
    const { root } = history();
    expect(() => {
      assertOnMainline(root, 'f'.repeat(40), 'main');
    }).toThrow('failed');
  });

  it('refuses to promote an ancestor of the running release unless asked', () => {
    const { root, first, second } = history();
    expect(() => {
      assertNotDowngrade(root, first, second, false);
    }).toThrow('pass --allow-downgrade');
    expect(() => {
      assertNotDowngrade(root, first, second, true);
    }).not.toThrow();
    expect(() => {
      assertNotDowngrade(root, second, first, false);
    }).not.toThrow();
  });
});
