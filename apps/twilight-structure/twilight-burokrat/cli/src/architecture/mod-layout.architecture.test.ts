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

// Proof: replacing the registry's moduleLayoutObservations call with [] made this real CLI test
// fail: check exited 0 instead of refusing the committed module with no contract file.
test('MOD-LAYOUT refuses a committed module without its contract file', () => {
  const root = mkdtempSync(join(tmpdir(), 'mod-layout-architecture-'));
  try {
    const repository = join(root, 'candidate');
    mkdirSync(join(repository, 'src', 'm'), { recursive: true });
    git(repository, 'init', '--initial-branch=main');
    git(repository, 'config', 'user.email', 'architecture@example.test');
    git(repository, 'config', 'user.name', 'Architecture Fixture');
    writeFileSync(join(repository, 'src', 'm', 'm.feature.ts'), 'export const value = 1;\n');

    const moduleIndex = {
      schemaVersion: 1,
      moduleId: 'module.m',
      memberships: [{ kind: 'path', path: 'm.feature.ts' }],
      relationshipSelectors: [],
      applicableChecks: [],
      inapplicableSections: [
        {
          section: 'relationships',
          reason: 'The fixture declares no non-derivable relationships.',
        },
        { section: 'invariants', reason: 'The fixture has no cross-file runtime invariant.' },
        { section: 'checks', reason: 'The rule registry is the fixture boundary check.' },
      ],
      externalConsumers: {
        kind: 'none-known',
        knowledgeLimit: 'Only consumers visible in this immutable candidate were considered.',
      },
    };
    writeFileSync(
      join(repository, 'src', 'm', 'README.md'),
      `# M\n\n<!-- module-index ${JSON.stringify(moduleIndex)} -->\n`,
    );
    const rootIndex = {
      ...moduleIndex,
      moduleId: 'module.root',
      memberships: [{ kind: 'directory-prefix', prefix: 'src', exclusions: [] }],
    };
    writeFileSync(
      join(repository, 'README.md'),
      `# Module fixture\n\n<!-- module-index ${JSON.stringify(rootIndex)} -->\n`,
    );
    git(repository, 'add', '--all');
    git(repository, 'commit', '-m', 'candidate without module contract');
    const revision = git(repository, 'rev-parse', 'HEAD');
    const policy = join(root, 'rule-policy.json');
    writeFileSync(
      policy,
      `${JSON.stringify({
        schemaVersion: 1,
        policyId: 'architecture.mod-layout.v1',
        ruleModes: registeredRules().map(({ id }) => ({
          ruleId: id,
          mode: id === 'MOD-LAYOUT' ? 'enforce' : 'observe',
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
        'MOD-LAYOUT',
      ],
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
        ruleId: 'MOD-LAYOUT',
        path: 'src/m',
        message: 'module directory declares no contract file',
        effect: 'refusal',
      },
    ]);
    expect(verdict.unevaluated).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
