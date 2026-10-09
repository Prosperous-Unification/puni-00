import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PerformanceCases } from '@shared/test-evidence';
import { afterEach, describe, expect, it } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { registeredRules } from '../rules/registry';
import { loadRulePolicyWithIdentity } from '../rules/rule-policy';
import { hashBytes, hashCanonical } from './content-manifest';
import { digestPerformanceCase, evaluatePerformanceRun } from './performance';

const roots: string[] = [];
const performanceCase: PerformanceCases['cases'][number] = {
  caseId: 'paint-ready',
  fixture: 'apps/wbs/fe-01/e2e-performance/paint.perf.spec.ts',
  titlePath: ['Paint', 'records readiness'],
  measurement: 'paint-ready',
  unit: 'ms',
  operator: 'lte',
  threshold: 200,
};

function stdoutOf(invocation: ReturnType<typeof Bun.spawnSync>): string {
  if (invocation.stdout === undefined) throw new Error('Performance CLI stdout unavailable');
  return invocation.stdout.toString();
}

function stderrOf(invocation: ReturnType<typeof Bun.spawnSync>): string {
  if (invocation.stderr === undefined) throw new Error('Performance CLI stderr unavailable');
  return invocation.stderr.toString();
}
const declaration = {
  schemaVersion: 1,
  config: 'apps/wbs/fe-01/playwright.performance.config.ts',
  project: 'chromium',
  cases: [performanceCase],
};
const execution = {
  schemaVersion: 1,
  exitCode: 0,
  cases: [
    {
      caseId: 'paint-ready',
      status: 'passed',
      observations: [{ measurement: 'paint-ready', unit: 'ms', value: 180 }],
    },
  ],
};
const selection = {
  declarationPath: 'apps/wbs/fe-01/playwright.performance.cases.json',
  config: declaration.config,
  project: declaration.project,
  configDigest: 'a'.repeat(64),
  runnerVersion: '1.63.0',
  listArguments: [
    'test',
    '--config',
    declaration.config,
    '--project',
    declaration.project,
    '--list',
    '--reporter=json',
  ],
  runArguments: [
    'test',
    '--config',
    declaration.config,
    '--project',
    declaration.project,
    '--reporter=json',
  ],
  selectionEnvironment: {},
};

function git(repository: string, args: string[]): void {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], { stderr: 'pipe' });
  expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
}

function productionFixture(): {
  repository: string;
  policyPath: string;
  evidencePath: string;
  evidence: Record<string, unknown>;
} {
  const root = mkdtempSync(join(tmpdir(), 'burokrat-performance-cli-'));
  roots.push(root);
  const repository = join(root, 'candidate');
  mkdirSync(repository);
  git(repository, ['init', '-q']);
  git(repository, ['config', 'user.name', 'Proof']);
  git(repository, ['config', 'user.email', 'proof@example.invalid']);
  const configPath = join(repository, declaration.config);
  mkdirSync(join(repository, 'apps/wbs/fe-01'), { recursive: true });
  writeFileSync(configPath, 'export default {}\n');
  writeFileSync(join(repository, selection.declarationPath), JSON.stringify(declaration));
  git(repository, ['add', '.']);
  git(repository, ['commit', '-qm', 'fixture']);
  const policyPath = join(root, 'policy.json');
  const policy = {
    schemaVersion: 1,
    policyId: 'performance-cli',
    ruleModes: registeredRules().map((rule) => ({ ruleId: rule.id, mode: 'enforce' })),
    performance: {
      acceptedDeclarationSchema: 1,
      declarationPath: selection.declarationPath,
      config: selection.config,
      configDigest: hashBytes(new TextEncoder().encode('export default {}\n')),
      project: selection.project,
      runnerVersion: selection.runnerVersion,
      reviewedCases: [
        { caseId: performanceCase.caseId, caseDigest: digestPerformanceCase(performanceCase) },
      ],
    },
  };
  writeFileSync(policyPath, JSON.stringify(policy));
  const candidate = readCandidate(repository, { kind: 'committed', revision: 'HEAD' });
  const evidence = {
    schemaVersion: 1,
    candidate: hashCanonical({
      selection: candidate.selection,
      entries: candidate.entries,
      untracked: candidate.untracked,
    }),
    policyDigest: loadRulePolicyWithIdentity(repository, policyPath).digest,
    declarationDigest: hashCanonical({
      schemaVersion: 1,
      kind: 'performance-declaration',
      declaration,
    }),
    selection: { ...selection, configDigest: policy.performance.configDigest },
    run: execution,
  };
  const evidencePath = join(root, 'run.json');
  writeFileSync(evidencePath, JSON.stringify(evidence));
  return { repository, policyPath, evidencePath, evidence };
}

function checkProduction(
  fixture: ReturnType<typeof productionFixture>,
  includeEvidence = true,
): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync(
    [
      process.execPath,
      'run',
      join(import.meta.dir, '..', 'cli.ts'),
      'check',
      'committed',
      fixture.repository,
      'HEAD',
      fixture.policyPath,
      '--rule',
      'PERF-THRESHOLD',
      ...(includeEvidence ? ['--performance-evidence', fixture.evidencePath] : []),
    ],
    { stdout: 'pipe', stderr: 'pipe', env: process.env },
  );
}

function policyFixture() {
  const root = mkdtempSync(join(tmpdir(), 'burokrat-performance-'));
  roots.push(root);
  const candidateRoot = join(root, 'candidate');
  mkdirSync(candidateRoot);
  const policyPath = join(root, 'policy.json');
  const policy = {
    schemaVersion: 1,
    policyId: 'performance-pilot',
    ruleModes: registeredRules().map((rule) => ({ ruleId: rule.id, mode: 'observe' })),
    performance: {
      acceptedDeclarationSchema: 1,
      declarationPath: selection.declarationPath,
      config: declaration.config,
      configDigest: selection.configDigest,
      project: declaration.project,
      runnerVersion: selection.runnerVersion,
      reviewedCases: [
        { caseId: performanceCase.caseId, caseDigest: digestPerformanceCase(performanceCase) },
      ],
    },
  };
  writeFileSync(policyPath, JSON.stringify(policy));
  return { candidateRoot, policyPath, policy };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Burokrat Performance judge', () => {
  it('carries a nonempty candidate-bound run through the production check command', () => {
    const fixture = productionFixture();
    const invocation = checkProduction(fixture);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    const verdict = JSON.parse(stdoutOf(invocation)) as {
      allowed: boolean;
      unevaluated: unknown[];
    };
    expect(verdict.allowed).toBe(true);
    expect(verdict.unevaluated).toEqual([]);
  });

  it('refuses changed candidate and policy identities and an invalid execution through production', () => {
    const fixture = productionFixture();
    for (const mutation of [
      { candidate: '0'.repeat(64) },
      { policyDigest: '0'.repeat(64) },
      { declarationDigest: '0'.repeat(64) },
      { run: { ...execution, exitCode: 1 } },
    ]) {
      writeFileSync(fixture.evidencePath, JSON.stringify({ ...fixture.evidence, ...mutation }));
      const invocation = checkProduction(fixture);
      expect(invocation.exitCode).toBe(1);
      const verdict = JSON.parse(stdoutOf(invocation)) as {
        unevaluated: { reason: string }[];
      };
      expect(verdict.unevaluated).toHaveLength(1);
    }
  });

  it('refuses absent declaration even when the reviewed case set is empty', () => {
    const fixture = productionFixture();
    git(fixture.repository, ['rm', selection.declarationPath]);
    git(fixture.repository, ['commit', '-qm', 'remove declaration']);
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(
      fixture.policyPath,
      JSON.stringify({
        ...policy,
        performance: { ...(policy['performance'] as object), reviewedCases: [] },
      }),
    );
    const invocation = checkProduction(fixture);
    expect(invocation.exitCode).toBe(1);
    expect(stdoutOf(invocation)).toContain('the Performance declaration is absent');
  });

  it('reports a valid empty Performance declaration as no-cases', () => {
    const fixture = productionFixture();
    writeFileSync(
      join(fixture.repository, selection.declarationPath),
      JSON.stringify({ ...declaration, cases: [] }),
    );
    git(fixture.repository, ['add', '.']);
    git(fixture.repository, ['commit', '-qm', 'empty declaration']);
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(
      fixture.policyPath,
      JSON.stringify({
        ...policy,
        performance: { ...(policy['performance'] as object), reviewedCases: [] },
      }),
    );
    const invocation = checkProduction(fixture);
    expect(invocation.exitCode).toBe(1);
    expect(stdoutOf(invocation)).toContain(
      'no-cases: Performance declaration has no reviewed cases',
    );
  });

  it('distinguishes absent, malformed, non-UTF-8 and invalid Performance evidence inputs', () => {
    const fixture = productionFixture();
    rmSync(fixture.evidencePath);
    expect(stderrOf(checkProduction(fixture))).toContain('cannot read Performance evidence');
    writeFileSync(fixture.evidencePath, '{');
    expect(stderrOf(checkProduction(fixture))).toContain('malformed Performance evidence JSON');
    writeFileSync(fixture.evidencePath, Uint8Array.of(0xff));
    expect(stderrOf(checkProduction(fixture))).toContain('is not UTF-8');
    writeFileSync(fixture.evidencePath, JSON.stringify({ ...fixture.evidence, unexpected: true }));
    expect(stderrOf(checkProduction(fixture))).toContain('Invalid Performance evidence');
  });

  it('refuses changed executed selection and an unreviewed threshold through production', () => {
    const fixture = productionFixture();
    for (const selectionChange of [
      { config: 'apps/wbs/fe-01/other.config.ts' },
      { project: 'firefox' },
      { configDigest: '0'.repeat(64) },
      { runnerVersion: 'unreviewed' },
      { listArguments: [...selection.listArguments, '--grep', 'paint'] },
      { runArguments: [...selection.runArguments, '--grep', 'paint'] },
      { selectionEnvironment: { PLAYWRIGHT_GREP: 'paint' } },
    ]) {
      writeFileSync(
        fixture.evidencePath,
        JSON.stringify({
          ...fixture.evidence,
          selection: { ...(fixture.evidence['selection'] as object), ...selectionChange },
        }),
      );
      const invocation = checkProduction(fixture);
      expect(invocation.exitCode, stdoutOf(invocation)).toBe(1);
    }
    writeFileSync(fixture.evidencePath, JSON.stringify(fixture.evidence));
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(
      fixture.policyPath,
      JSON.stringify({
        ...policy,
        performance: {
          ...(policy['performance'] as object),
          reviewedCases: [{ caseId: performanceCase.caseId, caseDigest: '0'.repeat(64) }],
        },
      }),
    );
    const invocation = checkProduction(fixture);
    expect(invocation.exitCode).toBe(1);
  }, 30_000);

  it('uses the reviewed domain-separated case identity', () => {
    expect(digestPerformanceCase(performanceCase)).toBe(
      'da6f4252e2b8804849260dec93f62620c644faa1db2eb3cd877f135aee61494d',
    );
  });

  it('refuses missing run evidence and changed candidate config before judging', () => {
    const fixture = productionFixture();
    expect(stdoutOf(checkProduction(fixture, false))).toContain(
      'Performance run evidence is not supplied',
    );
    const configPath = join(fixture.repository, declaration.config);
    writeFileSync(configPath, 'export default { changed: true }\n');
    git(fixture.repository, ['add', '.']);
    git(fixture.repository, ['commit', '-qm', 'change config']);
    expect(stdoutOf(checkProduction(fixture))).toContain(
      'Performance config content differs from reviewed authority',
    );
    git(fixture.repository, ['rm', declaration.config]);
    git(fixture.repository, ['commit', '-qm', 'remove config']);
    expect(stdoutOf(checkProduction(fixture))).toContain(
      'Performance config is absent from candidate',
    );
  });

  it('refuses a changed candidate declaration selection', () => {
    const fixture = productionFixture();
    for (const change of [{ config: 'apps/wbs/fe-01/other.config.ts' }, { project: 'firefox' }]) {
      writeFileSync(
        join(fixture.repository, selection.declarationPath),
        JSON.stringify({ ...declaration, ...change }),
      );
      git(fixture.repository, ['add', '.']);
      git(fixture.repository, ['commit', '-qm', 'change declaration']);
      expect(stdoutOf(checkProduction(fixture))).toContain(
        'Performance declaration config or project differs from reviewed authority',
      );
    }
  });

  it('loads external RulePolicy and independently compares actual observations', () => {
    const { candidateRoot, policyPath } = policyFixture();
    const authority = loadRulePolicyWithIdentity(candidateRoot, policyPath);
    const verdict = evaluatePerformanceRun(
      declaration,
      execution,
      {
        policy: authority.policy,
        policyDigest: authority.digest,
      },
      selection,
    );
    expect(verdict.cases).toEqual([
      {
        caseId: 'paint-ready',
        fixture: performanceCase.fixture,
        status: 'passed',
        observed: 180,
        threshold: 200,
        passed: true,
      },
    ]);
    expect(verdict.declarationDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(verdict.policyDigest).toBe(authority.digest);
    expect(verdict.selectionDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(
      evaluatePerformanceRun(
        declaration,
        {
          ...execution,
          cases: [
            {
              ...execution.cases[0],
              observations: [{ ...execution.cases[0]?.observations[0], value: 220 }],
            },
          ],
        },
        { policy: authority.policy, policyDigest: authority.digest },
        selection,
      ).cases[0]?.passed,
    ).toBe(false);
  });

  it('refuses missing authority even in observe mode, plus changed config and runner', () => {
    const { candidateRoot, policyPath, policy } = policyFixture();
    writeFileSync(policyPath, JSON.stringify({ ...policy, performance: undefined }));
    const absent = loadRulePolicyWithIdentity(candidateRoot, policyPath);
    expect(() =>
      evaluatePerformanceRun(
        declaration,
        execution,
        {
          policy: absent.policy,
          policyDigest: absent.digest,
        },
        selection,
      ),
    ).toThrow('needs policy.performance');
    writeFileSync(policyPath, JSON.stringify(policy));
    const loaded = loadRulePolicyWithIdentity(candidateRoot, policyPath);
    const authority = { policy: loaded.policy, policyDigest: loaded.digest };
    expect(() =>
      evaluatePerformanceRun(declaration, execution, authority, {
        ...selection,
        configDigest: 'b'.repeat(64),
      }),
    ).toThrow('config digest mismatch');
    expect(() =>
      evaluatePerformanceRun(declaration, execution, authority, {
        ...selection,
        runnerVersion: 'other',
      }),
    ).toThrow('runner version mismatch');
    expect(() =>
      evaluatePerformanceRun(declaration, execution, authority, {
        ...selection,
        config: 'apps/wbs/fe-01/playwright.config.ts',
      }),
    ).toThrow('executed config mismatch');
    expect(() =>
      evaluatePerformanceRun(declaration, execution, authority, {
        ...selection,
        project: 'firefox',
      }),
    ).toThrow('executed project mismatch');
    expect(() =>
      evaluatePerformanceRun(declaration, execution, authority, {
        ...selection,
        runArguments: [...selection.runArguments, '--grep=ordinary'],
      }),
    ).toThrow('execution selection arguments mismatch');
    expect(() =>
      evaluatePerformanceRun(declaration, execution, authority, {
        ...selection,
        listArguments: [...selection.listArguments, '--grep=ordinary'],
      }),
    ).toThrow('discovery selection arguments mismatch');
    expect(() =>
      evaluatePerformanceRun(declaration, execution, authority, {
        ...selection,
        selectionEnvironment: { PLAYWRIGHT_GREP: 'ordinary' },
      }),
    ).toThrow('selection environment must be empty');
  });

  it('requires exact reviewed case records and exact execution set', () => {
    const { candidateRoot, policyPath } = policyFixture();
    const loaded = loadRulePolicyWithIdentity(candidateRoot, policyPath);
    const authority = { policy: loaded.policy, policyDigest: loaded.digest };
    expect(() =>
      evaluatePerformanceRun(
        { ...declaration, cases: [{ ...performanceCase, threshold: 300 }] },
        execution,
        authority,
        selection,
      ),
    ).toThrow('reviewed digest mismatch');
    expect(() =>
      evaluatePerformanceRun(declaration, { ...execution, cases: [] }, authority, selection),
    ).toThrow('missing execution');
    expect(() =>
      evaluatePerformanceRun(
        declaration,
        { ...execution, cases: [{ ...execution.cases[0], caseId: 'unknown' }] },
        authority,
        selection,
      ),
    ).toThrow('unknown execution');
    expect(() =>
      evaluatePerformanceRun(declaration, { ...execution, exitCode: 1 }, authority, selection),
    ).toThrow('runner exited 1');
  });

  it('refuses reviewed config, project and declaration path mismatches', () => {
    const { candidateRoot, policyPath, policy } = policyFixture();
    for (const performanceChange of [
      { config: 'apps/wbs/fe-01/other.config.ts' },
      { project: 'firefox' },
      { declarationPath: 'apps/wbs/fe-01/other.cases.json' },
    ]) {
      writeFileSync(
        policyPath,
        JSON.stringify({ ...policy, performance: { ...policy.performance, ...performanceChange } }),
      );
      const loaded = loadRulePolicyWithIdentity(candidateRoot, policyPath);
      expect(() =>
        evaluatePerformanceRun(
          declaration,
          execution,
          { policy: loaded.policy, policyDigest: loaded.digest },
          selection,
        ),
      ).toThrow('mismatch');
    }
  });

  it('rejects duplicate review authority rather than collapsing its map', () => {
    const { candidateRoot, policyPath, policy } = policyFixture();
    writeFileSync(
      policyPath,
      JSON.stringify({
        ...policy,
        performance: {
          ...policy.performance,
          reviewedCases: [...policy.performance.reviewedCases, ...policy.performance.reviewedCases],
        },
      }),
    );
    const loaded = loadRulePolicyWithIdentity(candidateRoot, policyPath);
    expect(() =>
      evaluatePerformanceRun(
        declaration,
        execution,
        { policy: loaded.policy, policyDigest: loaded.digest },
        selection,
      ),
    ).toThrow('duplicate Performance reviewed case ID');
  });

  it('requires all declared cases reviewed and no policy-only reviews', () => {
    const { candidateRoot, policyPath, policy } = policyFixture();
    writeFileSync(
      policyPath,
      JSON.stringify({
        ...policy,
        performance: { ...policy.performance, reviewedCases: [] },
      }),
    );
    const missing = loadRulePolicyWithIdentity(candidateRoot, policyPath);
    expect(() =>
      evaluatePerformanceRun(
        declaration,
        execution,
        { policy: missing.policy, policyDigest: missing.digest },
        selection,
      ),
    ).toThrow('missing Performance review');
    writeFileSync(
      policyPath,
      JSON.stringify({
        ...policy,
        performance: {
          ...policy.performance,
          reviewedCases: [
            ...policy.performance.reviewedCases,
            { caseId: 'policy-only', caseDigest: 'b'.repeat(64) },
          ],
        },
      }),
    );
    const extra = loadRulePolicyWithIdentity(candidateRoot, policyPath);
    expect(() =>
      evaluatePerformanceRun(
        declaration,
        execution,
        { policy: extra.policy, policyDigest: extra.digest },
        selection,
      ),
    ).toThrow('reviewed case missing');
  });

  it('refuses missing, duplicate or wrong-unit observations; failed/skipped cannot pass', () => {
    const { candidateRoot, policyPath } = policyFixture();
    const loaded = loadRulePolicyWithIdentity(candidateRoot, policyPath);
    const authority = { policy: loaded.policy, policyDigest: loaded.digest };
    expect(() =>
      evaluatePerformanceRun(
        declaration,
        { ...execution, cases: [{ ...execution.cases[0], observations: [] }] },
        authority,
        selection,
      ),
    ).toThrow('missing observation');
    expect(() =>
      evaluatePerformanceRun(
        declaration,
        {
          ...execution,
          cases: [
            {
              ...execution.cases[0],
              observations: [
                execution.cases[0]?.observations[0],
                execution.cases[0]?.observations[0],
              ],
            },
          ],
        },
        authority,
        selection,
      ),
    ).toThrow('duplicate Performance observation');
    expect(() =>
      evaluatePerformanceRun(
        declaration,
        {
          ...execution,
          cases: [
            {
              ...execution.cases[0],
              observations: [{ ...execution.cases[0]?.observations[0], unit: 'bytes' }],
            },
          ],
        },
        authority,
        selection,
      ),
    ).toThrow('observation unit mismatch');
    expect(() =>
      evaluatePerformanceRun(
        declaration,
        {
          ...execution,
          cases: [
            {
              ...execution.cases[0],
              observations: [
                execution.cases[0]?.observations[0],
                { measurement: 'unreviewed', unit: 'ms', value: 5 },
              ],
            },
          ],
        },
        authority,
        selection,
      ),
    ).toThrow('unexpected observation');
    for (const status of ['failed', 'skipped']) {
      expect(
        evaluatePerformanceRun(
          declaration,
          { ...execution, cases: [{ ...execution.cases[0], status }] },
          authority,
          selection,
        ).cases[0]?.passed,
      ).toBe(false);
    }
  });
});
