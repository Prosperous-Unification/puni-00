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

// Proof: replacing F7's registry observations with [] made this real CLI test fail:
// check exited 0 instead of refusing the committed file above its external pinned maximum.
test('F7 refuses a committed source file above its external pinned maximum', () => {
  const root = mkdtempSync(join(tmpdir(), 'f7-architecture-'));
  try {
    const repository = join(root, 'candidate');
    mkdirSync(join(repository, 'src'), { recursive: true });
    git(repository, 'init', '--initial-branch=main');
    git(repository, 'config', 'user.email', 'architecture@example.test');
    git(repository, 'config', 'user.name', 'Architecture Fixture');
    writeFileSync(join(repository, 'src', 'large.ts'), 'export const value = 1;\n'.repeat(50));
    git(repository, 'add', '--all');
    git(repository, 'commit', '-m', 'candidate over pinned size maximum');
    const revision = git(repository, 'rev-parse', 'HEAD');
    const policy = join(root, 'rule-policy.json');
    writeFileSync(
      policy,
      `${JSON.stringify({
        schemaVersion: 1,
        policyId: 'architecture.f7.v1',
        ruleModes: registeredRules().map(({ id }) => ({
          ruleId: id,
          mode: id === 'F7' ? 'enforce' : 'observe',
        })),
        sizeCeilings: {
          ceiling: 40,
          roots: ['src'],
          pinned: [{ path: 'src/large.ts', maximum: 45 }],
        },
      })}\n`,
    );

    const invocation = Bun.spawnSync(
      [process.execPath, cli, 'check', 'committed', repository, revision, policy, '--rule', 'F7'],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const verdict = JSON.parse(invocation.stdout.toString()) as {
      allowed: boolean;
      certifies: boolean;
      findings: { ruleId: string; path: string; message: string; effect: string }[];
      unevaluated: { ruleId: string; reason: string }[];
    };
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(1);
    expect(verdict.allowed).toBe(false);
    expect(verdict.certifies).toBe(false);
    expect(verdict.findings).toEqual([
      {
        ruleId: 'F7',
        path: 'src/large.ts',
        message: '50 lines exceeds its pinned maximum 45',
        effect: 'refusal',
      },
    ]);
    expect(verdict.unevaluated).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
