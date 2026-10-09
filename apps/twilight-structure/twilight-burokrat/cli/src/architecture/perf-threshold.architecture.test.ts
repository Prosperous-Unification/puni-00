import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { digestPerformanceDeclaration, type PerformanceCases } from '@shared/test-evidence';
import { expect, test } from 'bun:test';

import { hashBytes, hashCanonical } from '../evidence/content-manifest';
import { digestPerformanceCase } from '../evidence/performance';
import { readCandidate } from '../inventory/read-candidate';
import { registeredRules } from '../rules/registry';
import { loadRulePolicyWithIdentity } from '../rules/rule-policy';

const cli = join(import.meta.dir, '..', 'cli.ts');

function git(repository: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

// Proof: replacing the registry's failed-case filter with an empty selection made this named
// real CLI test fail: check exited 0 with allowed:true and findings:[] for 220 ms over 200 ms.
test('PERF-THRESHOLD refuses a synthetic committed case above its reviewed threshold', () => {
  const root = mkdtempSync(join(tmpdir(), 'perf-threshold-architecture-'));
  try {
    const repository = join(root, 'candidate');
    const config = 'playwright.performance.config.ts';
    const declarationPath = 'performance.cases.json';
    const fixture = 'synthetic/threshold.perf.spec.ts';
    const configSource = 'export default { projects: [{ name: "chromium" }] };\n';
    const performanceCase: PerformanceCases['cases'][number] = {
      caseId: 'synthetic-paint',
      fixture,
      titlePath: ['Synthetic paint', 'exceeds budget'],
      measurement: 'paint-ready',
      unit: 'ms',
      operator: 'lte',
      threshold: 200,
    };
    const declaration: PerformanceCases = {
      schemaVersion: 1,
      config,
      project: 'chromium',
      cases: [performanceCase],
    };
    mkdirSync(join(repository, 'synthetic'), { recursive: true });
    git(repository, 'init', '--initial-branch=main');
    git(repository, 'config', 'user.email', 'architecture@example.test');
    git(repository, 'config', 'user.name', 'Architecture Fixture');
    writeFileSync(join(repository, config), configSource);
    writeFileSync(join(repository, declarationPath), `${JSON.stringify(declaration)}\n`);
    writeFileSync(join(repository, fixture), 'export const syntheticCase = "fixture only";\n');
    git(repository, 'add', '--all');
    git(repository, 'commit', '-m', 'synthetic Performance threshold candidate');
    const revision = git(repository, 'rev-parse', 'HEAD');

    const policyPath = join(root, 'rule-policy.json');
    writeFileSync(
      policyPath,
      `${JSON.stringify({
        schemaVersion: 1,
        policyId: 'architecture.perf-threshold.synthetic.v1',
        ruleModes: registeredRules().map(({ id }) => ({
          ruleId: id,
          mode: id === 'PERF-THRESHOLD' ? 'enforce' : 'observe',
        })),
        performance: {
          acceptedDeclarationSchema: 1,
          declarationPath,
          config,
          configDigest: hashBytes(new TextEncoder().encode(configSource)),
          project: 'chromium',
          runnerVersion: 'synthetic-architecture-fixture',
          reviewedCases: [
            { caseId: performanceCase.caseId, caseDigest: digestPerformanceCase(performanceCase) },
          ],
        },
      })}\n`,
    );
    const candidate = readCandidate(repository, { kind: 'committed', revision });
    const evidencePath = join(root, 'synthetic-run.json');
    writeFileSync(
      evidencePath,
      `${JSON.stringify({
        schemaVersion: 1,
        candidate: hashCanonical({
          selection: candidate.selection,
          entries: candidate.entries,
          untracked: candidate.untracked,
        }),
        policyDigest: loadRulePolicyWithIdentity(repository, policyPath).digest,
        declarationDigest: digestPerformanceDeclaration(declaration),
        selection: {
          declarationPath,
          config,
          project: 'chromium',
          configDigest: hashBytes(new TextEncoder().encode(configSource)),
          runnerVersion: 'synthetic-architecture-fixture',
          listArguments: [
            'test',
            '--config',
            config,
            '--project',
            'chromium',
            '--list',
            '--reporter=json',
          ],
          runArguments: ['test', '--config', config, '--project', 'chromium', '--reporter=json'],
          selectionEnvironment: {},
        },
        run: {
          schemaVersion: 1,
          exitCode: 0,
          cases: [
            {
              caseId: performanceCase.caseId,
              status: 'passed',
              observations: [{ measurement: 'paint-ready', unit: 'ms', value: 220 }],
            },
          ],
        },
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
        'PERF-THRESHOLD',
        '--performance-evidence',
        evidencePath,
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
        ruleId: 'PERF-THRESHOLD',
        path: fixture,
        message: 'Performance case synthetic-paint did not meet its reviewed threshold',
        effect: 'refusal',
      },
    ]);
    expect(verdict.unevaluated).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
