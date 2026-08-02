import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { applyRunnerHostAlias, assertCleanTree, requireRegistryPassword } from './main';

describe('applyRunnerHostAlias', () => {
  it('populates the real variable when only the friendly one is set', () => {
    const env: NodeJS.ProcessEnv = { DAGGER_RUNNER_HOST: 'tcp://127.0.0.1:8080' };
    applyRunnerHostAlias(env);
    expect(env['_EXPERIMENTAL_DAGGER_RUNNER_HOST']).toBe('tcp://127.0.0.1:8080');
  });

  it('leaves an already-set real variable untouched', () => {
    const env: NodeJS.ProcessEnv = {
      DAGGER_RUNNER_HOST: 'tcp://127.0.0.1:9999',
      _EXPERIMENTAL_DAGGER_RUNNER_HOST: 'tcp://127.0.0.1:8080',
    };
    applyRunnerHostAlias(env);
    expect(env['_EXPERIMENTAL_DAGGER_RUNNER_HOST']).toBe('tcp://127.0.0.1:8080');
  });
});

describe('requireRegistryPassword', () => {
  it('returns the password when REGISTRY_PASS is set', () => {
    const env: NodeJS.ProcessEnv = { REGISTRY_PASS: 'hunter2' };
    expect(requireRegistryPassword(env)).toBe('hunter2');
  });

  it('fails fast, naming the variable, rather than allowing an unauthenticated push', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(() => requireRegistryPassword(env)).toThrow(/REGISTRY_PASS/);
  });

  it('treats an empty string the same as unset', () => {
    const env: NodeJS.ProcessEnv = { REGISTRY_PASS: '' };
    expect(() => requireRegistryPassword(env)).toThrow(/REGISTRY_PASS/);
  });
});

// I3: publishAll's build context is the working tree, but publish-all labels
// the result with HEAD, and tool-deploy's migration gate reads migrations
// from git at that label. An uncommitted migration would therefore ship
// inside the image while being invisible to the gate. Driven against a real
// throwaway git repo rather than a stubbed `git`, because the property under
// test is what `git status --porcelain` actually reports.
describe('assertCleanTree', () => {
  let repo: string;
  let cwd: string;

  const git = (...args: string[]): void => {
    const p = Bun.spawnSync(['git', ...args], { cwd: repo });
    if (p.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr.toString('utf8')}`);
  };

  beforeEach(() => {
    cwd = process.cwd();
    repo = mkdtempSync(join(tmpdir(), 'wbs-cleantree-'));
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    writeFileSync(join(repo, 'tracked.txt'), 'committed\n');
    git('add', '.');
    git('commit', '-qm', 'initial');
    process.chdir(repo);
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(repo, { recursive: true, force: true });
  });

  it('passes on a clean tree', () => {
    expect(() => {
      assertCleanTree();
    }).not.toThrow();
  });

  it('refuses when a tracked file is modified, naming the file', () => {
    writeFileSync(join(repo, 'tracked.txt'), 'uncommitted edit\n');
    expect(() => {
      assertCleanTree();
    }).toThrow(/tracked\.txt/);
  });

  it('refuses on an untracked migration, which is the fail-open it closes', () => {
    writeFileSync(join(repo, '0002_add_column.sql'), 'ALTER TABLE t ADD COLUMN c;\n');
    expect(() => {
      assertCleanTree();
    }).toThrow(/dirty working tree/);
  });
});
