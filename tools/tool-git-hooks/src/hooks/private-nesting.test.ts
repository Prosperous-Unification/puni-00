import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

const hook = join(import.meta.dir, 'private-nesting.ts');

function git(cwd: string, ...args: string[]): void {
  const spawned = Bun.spawnSync(['git', '-C', cwd, ...args], { stderr: 'pipe' });
  if (spawned.exitCode !== 0) throw new Error(spawned.stderr.toString());
}

/** A scratch repository with the guard line and one tracked file, as the hook first sees it. */
function repository(): string {
  const root = scratchSync('private-nesting-');
  git(root, 'init', '--quiet');
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n/private/\n');
  writeFileSync(join(root, 'README.md'), 'public\n');
  git(root, 'add', '.gitignore', 'README.md');
  return root;
}

/** Runs the production hook as lefthook and CI do: from the repository root, with a file list. */
function runHook(root: string, files: readonly string[]) {
  const spawned = Bun.spawnSync(['bun', 'run', hook, ...files], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: spawned.exitCode, stderr: spawned.stderr.toString() };
}

describe('the private-nesting hook', () => {
  it('passes a clean tree with a nested checkout that stays ignored', () => {
    const root = repository();
    mkdirSync(join(root, 'private/puni-fleet'), { recursive: true });
    writeFileSync(join(root, 'private/puni-fleet/README.md'), 'private\n');
    git(root, 'add', '--all');

    expect(runHook(root, ['README.md', '.gitignore'])).toEqual({ exitCode: 0, stderr: '' });
  });

  it('refuses a forced add under private/', () => {
    const root = repository();
    mkdirSync(join(root, 'private/puni-fleet'), { recursive: true });
    writeFileSync(join(root, 'private/puni-fleet/README.md'), 'private\n');
    git(root, 'add', '-f', 'private/puni-fleet/README.md');

    const outcome = runHook(root, ['private/puni-fleet/README.md']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('private/puni-fleet/README.md is tracked under private/');
  });

  it('refuses a gitlink', () => {
    const root = repository();
    git(
      root,
      'update-index',
      '--add',
      '--cacheinfo',
      '160000,1111111111111111111111111111111111111111,vendor/puni-fleet',
    );

    const outcome = runHook(root, ['README.md']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('vendor/puni-fleet is a gitlink (submodule entry)');
  });

  it('refuses a .gitmodules file', () => {
    const root = repository();
    writeFileSync(join(root, '.gitmodules'), '[submodule "x"]\n');

    const outcome = runHook(root, ['README.md']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('.gitmodules exists');
  });

  it('refuses a .gitignore without /private/', () => {
    const root = repository();
    writeFileSync(join(root, '.gitignore'), 'node_modules/\n');

    const outcome = runHook(root, ['.gitignore']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('.gitignore lacks the /private/ line');
  });

  it('refuses an empty file list as vacuous', () => {
    const outcome = runHook(repository(), []);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('would be vacuous');
  });

  it('refuses a missing .gitignore rather than reading it as empty', () => {
    const root = repository();
    Bun.spawnSync(['rm', join(root, '.gitignore')]);

    const outcome = runHook(root, ['README.md']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('ENOENT');
  });
});
