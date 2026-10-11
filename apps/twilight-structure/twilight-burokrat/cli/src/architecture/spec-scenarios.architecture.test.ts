import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { registeredRules } from '../rules/registry';

const cli = join(import.meta.dir, '..', 'cli.ts');
const specPath = 'openspec/specs/example/spec.md';
const journalPath = 'openspec/scenario-allocations.json';
const identifiedSpec =
  '# Example\n\n## Requirements\n\n### Requirement: First requirement\n\n#### Scenario: [EXAMPLE-001] First case\n';
const journal = `${JSON.stringify({
  schemaVersion: 1,
  events: [{ kind: 'import', id: 'EXAMPLE-001', source: specPath, title: 'First case' }],
})}\n`;

function git(repository: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

// Proof: replacing SPEC-SCENARIOS' unidentified observations with [] made this named real CLI
// test fail: check exited 0 with allowed:true, findings:[], and unevaluated:[] instead of refusal.
test('SPEC-SCENARIOS refuses a new unidentified scenario in a committed canonical spec', () => {
  const root = mkdtempSync(join(tmpdir(), 'spec-scenarios-architecture-'));
  try {
    const repository = join(root, 'candidate');
    mkdirSync(join(repository, 'openspec', 'specs', 'example'), { recursive: true });
    git(repository, 'init', '--initial-branch=main');
    git(repository, 'config', 'user.email', 'architecture@example.test');
    git(repository, 'config', 'user.name', 'Architecture Fixture');
    writeFileSync(join(repository, specPath), identifiedSpec);
    writeFileSync(join(repository, journalPath), journal);
    git(repository, 'add', '--all');
    git(repository, 'commit', '-m', 'base with identified canonical scenario');
    const baseRevision = git(repository, 'rev-parse', 'HEAD');

    writeFileSync(join(repository, specPath), `${identifiedSpec}\n#### Scenario: Legacy case\n`);
    git(repository, 'add', '--all');
    git(repository, 'commit', '-m', 'candidate with unidentified scenario');
    const revision = git(repository, 'rev-parse', 'HEAD');
    const policyPath = join(root, 'rule-policy.json');
    writeFileSync(
      policyPath,
      `${JSON.stringify({
        schemaVersion: 1,
        policyId: 'architecture.spec-scenarios.v1',
        ruleModes: registeredRules().map(({ id }) => ({
          ruleId: id,
          mode: id === 'SPEC-SCENARIOS' ? 'enforce' : 'observe',
        })),
        scenarios: { baseRevision },
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
        policyPath,
        '--rule',
        'SPEC-SCENARIOS',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const verdict = JSON.parse(invocation.stdout.toString()) as {
      allowed: boolean;
      certifies: boolean;
      findings: { ruleId: string; path: string; message: string; effect: string }[];
      unevaluated: { ruleId: string; reason: string }[];
    };
    expect(
      invocation.exitCode,
      `${invocation.stdout.toString()}${invocation.stderr.toString()}`,
    ).toBe(1);
    expect(verdict.allowed).toBe(false);
    expect(verdict.certifies).toBe(false);
    expect(verdict.findings).toEqual([
      {
        ruleId: 'SPEC-SCENARIOS',
        path: specPath,
        message: 'scenario heading lacks identifier: Legacy case',
        effect: 'refusal',
      },
    ]);
    expect(verdict.unevaluated).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
