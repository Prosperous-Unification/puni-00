import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { registeredRules } from '../rules/registry';

const cli = join(import.meta.dir, '..', 'cli.ts');

function git(repository: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

// Proof: replacing MOD-INDEX's registry evaluation with an empty observed result made this
// production CLI test fail: check exited 0 rather than refusing the unindexed candidate.
test('MOD-INDEX refuses a committed candidate with no module index', () => {
  const root = mkdtempSync(join(tmpdir(), 'mod-index-architecture-'));
  try {
    const repository = join(root, 'candidate');
    mkdirSync(repository);
    git(repository, 'init', '--initial-branch=main');
    git(repository, 'config', 'user.email', 'architecture@example.test');
    git(repository, 'config', 'user.name', 'Architecture Fixture');
    writeFileSync(join(repository, 'orphan.ts'), 'export const orphan = 1;\n');
    git(repository, 'add', '--all');
    git(repository, 'commit', '-m', 'candidate without index');
    const revision = git(repository, 'rev-parse', 'HEAD');
    const policy = join(root, 'rule-policy.json');
    writeFileSync(
      policy,
      `${JSON.stringify({
        schemaVersion: 1,
        policyId: 'architecture.mod-index.v1',
        ruleModes: registeredRules().map(({ id }) => ({
          ruleId: id,
          mode: id === 'MOD-INDEX' ? 'enforce' : 'observe',
        })),
      })}\n`,
    );

    const invocation = Bun.spawnSync(
      [
        process.execPath,
        cli,
        'check',
        'committed',
        repository,
        revision,
        policy,
        '--rule',
        'MOD-INDEX',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const verdict = JSON.parse(invocation.stdout.toString()) as {
      allowed: boolean;
      certifies: boolean;
      unevaluated: { ruleId: string; reason: string }[];
    };
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(1);
    expect(verdict.allowed).toBe(false);
    expect(verdict.certifies).toBe(false);
    expect(verdict.unevaluated).toEqual([
      { ruleId: 'MOD-INDEX', reason: 'selected candidate contains no module indexes' },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
