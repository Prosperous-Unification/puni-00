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

// Proof: replacing MOD-DIRECT-ENTRIES's reviewDebt mapping with an empty observation list
// made this real CLI test fail: check exited 0 instead of refusing the committed 41-entry index.
test('MOD-DIRECT-ENTRIES refuses a committed index with 41 direct entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'mod-direct-entries-architecture-'));
  try {
    const repository = join(root, 'candidate');
    mkdirSync(repository);
    git(repository, 'init', '--initial-branch=main');
    git(repository, 'config', 'user.email', 'architecture@example.test');
    git(repository, 'config', 'user.name', 'Architecture Fixture');

    const memberships: { kind: 'path'; path: string }[] = [];
    for (let index = 1; index <= 41; index += 1) {
      const path = `entry-${String(index).padStart(2, '0')}.md`;
      memberships.push({ kind: 'path', path });
      writeFileSync(join(repository, path), `# Entry ${String(index)}\n`);
    }
    const metadata = {
      schemaVersion: 1,
      moduleId: 'module.direct-entries',
      memberships,
      relationshipSelectors: [],
      applicableChecks: [],
      inapplicableSections: [
        { section: 'relationships', reason: 'The fixture declares no relationships.' },
        { section: 'invariants', reason: 'The fixture has no cross-file runtime invariant.' },
        { section: 'checks', reason: 'The rule registry is the fixture boundary check.' },
      ],
      externalConsumers: {
        kind: 'none-known',
        knowledgeLimit: 'Only consumers visible in this immutable candidate were considered.',
      },
    };
    writeFileSync(
      join(repository, 'README.md'),
      `# Direct entries\n\n<!-- module-index ${JSON.stringify(metadata)} -->\n`,
    );
    git(repository, 'add', '--all');
    git(repository, 'commit', '-m', 'candidate over direct entry limit');
    const revision = git(repository, 'rev-parse', 'HEAD');
    const policy = join(root, 'rule-policy.json');
    writeFileSync(
      policy,
      `${JSON.stringify({
        schemaVersion: 1,
        policyId: 'architecture.mod-direct-entries.v1',
        ruleModes: registeredRules().map(({ id }) => ({
          ruleId: id,
          mode: id === 'MOD-DIRECT-ENTRIES' ? 'enforce' : 'observe',
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
        'MOD-DIRECT-ENTRIES',
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
        ruleId: 'MOD-DIRECT-ENTRIES',
        path: 'README.md',
        message: 'index declares 41 direct entries, limit 40',
        effect: 'refusal',
      },
    ]);
    expect(verdict.unevaluated).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
