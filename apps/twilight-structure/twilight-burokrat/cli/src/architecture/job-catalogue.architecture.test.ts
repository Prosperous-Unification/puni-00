import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect, test } from 'bun:test';

import { JobCataloguePath } from '../contracts/job-catalogue';
import { registeredRules } from '../rules/registry';

const cli = join(import.meta.dir, '..', 'cli.ts');
const repositoryRoot = join(import.meta.dir, '..', '..', '..', '..', '..', '..');

function git(repository: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

function write(root: string, path: string, source: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), source);
}

// Proof (2026-11-01): replacing the `until` comparison in rules/job-catalogue.ts with `false`
// made this real CLI test fail: check exited 0 instead of refusing the four expired estimates.
test('JOB-CATALOGUE refuses this repository catalogue the day after its estimates expire', () => {
  const root = mkdtempSync(join(tmpdir(), 'job-catalogue-architecture-'));
  try {
    const repository = join(root, 'candidate');
    mkdirSync(repository);
    git(repository, 'init', '--initial-branch=main');
    git(repository, 'config', 'user.email', 'architecture@example.test');
    git(repository, 'config', 'user.name', 'Architecture Fixture');
    write(repository, 'bin/h2puni-gate.sh', '#!/usr/bin/env bash\n');
    write(repository, 'bin/publish-release.sh', '#!/usr/bin/env bash\n');
    write(repository, 'tools/tool-devsync/src/solver-binding-runtime.ts', 'export {};\n');
    write(repository, 'package.json', '{"scripts":{"test:queued":"true"}}\n');
    write(
      repository,
      JobCataloguePath,
      readFileSync(join(repositoryRoot, JobCataloguePath), 'utf8'),
    );
    git(repository, 'add', '--all');
    git(repository, 'commit', '-m', 'candidate with an expired catalogue');
    const revision = git(repository, 'rev-parse', 'HEAD');
    const policy = join(root, 'rule-policy.json');
    writeFileSync(
      policy,
      `${JSON.stringify({
        schemaVersion: 1,
        policyId: 'architecture.job-catalogue.v1',
        ruleModes: registeredRules().map(({ id }) => ({
          ruleId: id,
          mode: id === 'JOB-CATALOGUE' ? 'enforce' : 'observe',
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
        'JOB-CATALOGUE',
        '--now',
        '2026-12-02T00:00:00.000Z',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const verdict = JSON.parse(invocation.stdout.toString()) as {
      allowed: boolean;
      certifies: boolean;
      evaluatedAt: string;
      findings: { ruleId: string; subject: string; effect: string }[];
      unevaluated: unknown[];
    };
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(1);
    expect(verdict.allowed).toBe(false);
    expect(verdict.certifies).toBe(false);
    expect(verdict.evaluatedAt).toBe('2026-12-02T00:00:00.000Z');
    expect(
      verdict.findings.map(({ ruleId, subject, effect }) => [ruleId, subject, effect]),
    ).toEqual(
      ['gate', 'release-build', 'test-queued', 'solver-image-publish'].map((id) => [
        'JOB-CATALOGUE',
        id,
        'refusal',
      ]),
    );
    expect(verdict.unevaluated).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
