import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { registeredRules } from '../rules/registry';

const cli = join(import.meta.dir, '..', 'cli.ts');
const classificationPolicy = join(
  import.meta.dir,
  '..',
  'contracts',
  'fixtures',
  'classification-policy.v1.json',
);

function git(repository: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

// Proof: removing the registry's classifyEntries call made this real CLI negative fail:
// check exited 0, while the test expected exit 1 for committed unknown.zzz.
test('INV-CLASSIFY refuses a committed candidate with an unclassified entry', () => {
  const root = mkdtempSync(join(tmpdir(), 'inv-classify-architecture-'));
  try {
    const repository = join(root, 'candidate');
    mkdirSync(repository);
    git(repository, 'init', '--initial-branch=main');
    git(repository, 'config', 'user.email', 'architecture@example.test');
    git(repository, 'config', 'user.name', 'Architecture Fixture');
    writeFileSync(join(repository, 'unknown.zzz'), 'unclassified\n');
    git(repository, 'add', '--all');
    git(repository, 'commit', '-m', 'candidate with unclassified entry');
    const revision = git(repository, 'rev-parse', 'HEAD');
    const policy = join(root, 'rule-policy.json');
    writeFileSync(
      policy,
      `${JSON.stringify({
        schemaVersion: 1,
        policyId: 'architecture.inv-classify.v1',
        ruleModes: registeredRules().map(({ id }) => ({
          ruleId: id,
          mode: id === 'INV-CLASSIFY' ? 'enforce' : 'observe',
        })),
        classificationPolicy: JSON.parse(readFileSync(classificationPolicy, 'utf8')) as unknown,
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
        'INV-CLASSIFY',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const verdict = JSON.parse(invocation.stdout.toString()) as {
      allowed: boolean;
      certifies: boolean;
      findings: { ruleId: string }[];
      unevaluated: { ruleId: string; reason: string }[];
    };
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(1);
    expect(verdict.allowed).toBe(false);
    expect(verdict.certifies).toBe(false);
    expect(verdict.findings).toEqual([]);
    expect(verdict.unevaluated).toEqual([
      {
        ruleId: 'INV-CLASSIFY',
        reason: 'ordinary content unknown.zzz matched 0 classification rules',
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
