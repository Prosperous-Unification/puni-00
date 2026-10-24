import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  decodePerformanceCases,
  digestPerformanceDeclaration,
  type PerformanceCases,
} from '@shared/test-evidence';
import { afterEach, describe, expect, it } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { type CliInvocation, invokeCli } from '../invoke-cli';
import { buildPackage } from '../packaging/build';
import { packPackage } from '../packaging/pack';
import { registeredRules } from '../rules/registry';
import { loadRulePolicyWithIdentity } from '../rules/rule-policy';
import { hashBytes, hashCanonical } from './content-manifest';
import {
  digestPerformanceCase,
  evaluatePerformanceRun,
  type PerformanceSelection,
} from './performance';

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

function stdoutOf(invocation: CliInvocation): string {
  return invocation.stdout;
}

function stderrOf(invocation: CliInvocation): string {
  return invocation.stderr;
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
  selectionEnvironment: { CI: '1', E2E_PORT_SHIFT: '6000' },
};

function git(repository: string, args: string[]): void {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...args], { stderr: 'pipe' });
  expect(invocation.exitCode, invocation.stderr.toString('utf8')).toBe(0);
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

async function checkProduction(
  fixture: ReturnType<typeof productionFixture>,
  includeEvidence = true,
  flags: { ruleFlag?: string; ruleId?: string; evidenceFlag?: string } = {},
): Promise<CliInvocation> {
  return await invokeCli([
    'check',
    'committed',
    fixture.repository,
    'HEAD',
    fixture.policyPath,
    flags.ruleFlag ?? '--rule',
    flags.ruleId ?? 'PERF-THRESHOLD',
    ...(includeEvidence
      ? [flags.evidenceFlag ?? '--performance-evidence', fixture.evidencePath]
      : []),
  ]);
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
  it('prints the non-certifying identity used by check and changes with the selected commit', async () => {
    const fixture = productionFixture();
    const identity = async (revision: string) =>
      await invokeCli(['candidate-identity', 'committed', fixture.repository, revision]);
    const first = await identity('HEAD');
    expect(first.exitCode, stderrOf(first)).toBe(0);
    const firstRecord = JSON.parse(stdoutOf(first)) as {
      candidate: string;
      certifies: boolean;
      selection: { kind: string };
      tool: string;
      toolVersion: string;
    };
    expect(firstRecord.candidate).toBe(fixture.evidence['candidate'] as string);
    expect(firstRecord.tool).toBe('twilight-burokrat');
    expect(firstRecord.toolVersion).toBe(
      (
        JSON.parse(readFileSync(join(import.meta.dir, '../..', 'package.json'), 'utf8')) as {
          version: string;
        }
      ).version,
    );
    expect(firstRecord.selection.kind).toBe('committed');
    expect(firstRecord.certifies).toBe(false);
    writeFileSync(join(fixture.repository, 'other.txt'), 'changed');
    git(fixture.repository, ['add', '.']);
    git(fixture.repository, ['commit', '-qm', 'new candidate']);
    expect(
      (JSON.parse(stdoutOf(await identity('HEAD'))) as { candidate: string }).candidate,
    ).not.toBe(firstRecord.candidate);
    const absent = await identity('NO-SUCH-REVISION');
    expect(absent.exitCode).toBe(1);
    expect(stderrOf(absent)).toContain('absent');
  });

  it('carries a nonempty candidate-bound run through the production check command', async () => {
    const fixture = productionFixture();
    const invocation = await checkProduction(fixture);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    const verdict = JSON.parse(stdoutOf(invocation)) as {
      allowed: boolean;
      unevaluated: unknown[];
    };
    expect(verdict.allowed).toBe(true);
    expect(verdict.unevaluated).toEqual([]);
  });

  it('refuses changed candidate and policy identities and an invalid execution through production', async () => {
    const fixture = productionFixture();
    for (const mutation of [
      { candidate: '0'.repeat(64) },
      { policyDigest: '0'.repeat(64) },
      { declarationDigest: '0'.repeat(64) },
      { run: { ...execution, exitCode: 1 } },
    ]) {
      writeFileSync(fixture.evidencePath, JSON.stringify({ ...fixture.evidence, ...mutation }));
      const invocation = await checkProduction(fixture);
      expect(invocation.exitCode).toBe(1);
      const verdict = JSON.parse(stdoutOf(invocation)) as {
        unevaluated: { reason: string }[];
      };
      expect(verdict.unevaluated).toHaveLength(1);
    }
  });

  it('refuses absent declaration even when the reviewed case set is empty', async () => {
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
    const invocation = await checkProduction(fixture);
    expect(invocation.exitCode).toBe(1);
    expect(stdoutOf(invocation)).toContain('the Performance declaration is absent');
  });

  it('reports a valid empty Performance declaration as no-cases', async () => {
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
    const invocation = await checkProduction(fixture);
    expect(invocation.exitCode).toBe(1);
    expect(stdoutOf(invocation)).toContain(
      'no-cases: Performance declaration has no reviewed cases',
    );
  });

  it('distinguishes absent, malformed, non-UTF-8 and invalid Performance evidence inputs', async () => {
    const fixture = productionFixture();
    rmSync(fixture.evidencePath);
    expect(stderrOf(await checkProduction(fixture))).toContain('cannot read Performance evidence');
    writeFileSync(fixture.evidencePath, '{');
    expect(stderrOf(await checkProduction(fixture))).toContain(
      'malformed Performance evidence JSON',
    );
    writeFileSync(fixture.evidencePath, Uint8Array.of(0xff));
    expect(stderrOf(await checkProduction(fixture))).toContain('is not UTF-8');
    writeFileSync(fixture.evidencePath, JSON.stringify({ ...fixture.evidence, unexpected: true }));
    expect(stderrOf(await checkProduction(fixture))).toContain('Invalid Performance evidence');
  });

  it('refuses changed executed selection and an unreviewed case digest through production', async () => {
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
      const invocation = await checkProduction(fixture);
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
    writeFileSync(
      fixture.evidencePath,
      JSON.stringify({
        ...fixture.evidence,
        policyDigest: loadRulePolicyWithIdentity(fixture.repository, fixture.policyPath).digest,
      }),
    );
    const invocation = await checkProduction(fixture);
    expect(invocation.exitCode).toBe(1);
    expect(stdoutOf(invocation)).toContain('Performance reviewed digest mismatch');
  }, 30_000);

  it('uses the reviewed domain-separated case identity', () => {
    expect(digestPerformanceCase(performanceCase)).toBe(
      'da6f4252e2b8804849260dec93f62620c644faa1db2eb3cd877f135aee61494d',
    );
  });

  it('shares the exact canonical declaration digest with the runner', () => {
    expect(digestPerformanceDeclaration(decodePerformanceCases(declaration))).toBe(
      hashCanonical({ schemaVersion: 1, kind: 'performance-declaration', declaration }),
    );
  });

  it('refuses missing run evidence and changed candidate config before judging', async () => {
    const fixture = productionFixture();
    expect(stdoutOf(await checkProduction(fixture, false))).toContain(
      'Performance run evidence is not supplied',
    );
    const configPath = join(fixture.repository, declaration.config);
    writeFileSync(configPath, 'export default { changed: true }\n');
    git(fixture.repository, ['add', '.']);
    git(fixture.repository, ['commit', '-qm', 'change config']);
    expect(stdoutOf(await checkProduction(fixture))).toContain(
      'Performance config content differs from reviewed authority',
    );
    git(fixture.repository, ['rm', declaration.config]);
    git(fixture.repository, ['commit', '-qm', 'remove config']);
    expect(stdoutOf(await checkProduction(fixture))).toContain(
      'Performance config is absent from candidate',
    );
  });

  it('refuses a changed candidate declaration selection', async () => {
    const fixture = productionFixture();
    for (const change of [{ config: 'apps/wbs/fe-01/other.config.ts' }, { project: 'firefox' }]) {
      writeFileSync(
        join(fixture.repository, selection.declarationPath),
        JSON.stringify({ ...declaration, ...change }),
      );
      git(fixture.repository, ['add', '.']);
      git(fixture.repository, ['commit', '-qm', 'change declaration']);
      expect(stdoutOf(await checkProduction(fixture))).toContain(
        'Performance declaration config or project differs from reviewed authority',
      );
    }
  });

  it('reports an independently measured threshold breach under enforce, observe and ratchet', async () => {
    const fixture = productionFixture();
    const violated = {
      ...execution,
      cases: [
        {
          ...execution.cases[0],
          observations: [{ measurement: 'paint-ready', unit: 'ms', value: 220 }],
        },
      ],
    };
    for (const scenario of [
      { mode: 'enforce', adoptedPrefixes: [], effect: 'refusal' },
      { mode: 'observe', adoptedPrefixes: [], effect: 'debt' },
      { mode: 'ratchet', adoptedPrefixes: ['apps/wbs/fe-01/e2e-performance'], effect: 'refusal' },
      { mode: 'ratchet', adoptedPrefixes: ['other'], effect: 'debt' },
    ] as const) {
      const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as {
        ruleModes: { ruleId: string; mode: string }[];
      };
      writeFileSync(
        fixture.policyPath,
        JSON.stringify({
          ...policy,
          adoptedSet: { adoptedPrefixes: scenario.adoptedPrefixes },
          ruleModes: policy.ruleModes.map((rule) =>
            rule.ruleId === 'PERF-THRESHOLD' ? { ...rule, mode: scenario.mode } : rule,
          ),
        }),
      );
      writeFileSync(
        fixture.evidencePath,
        JSON.stringify({
          ...fixture.evidence,
          policyDigest: loadRulePolicyWithIdentity(fixture.repository, fixture.policyPath).digest,
          run: violated,
        }),
      );
      const invocation = await checkProduction(fixture);
      const verdict = JSON.parse(stdoutOf(invocation)) as {
        allowed: boolean;
        certifies: boolean;
        findings: { ruleId: string; effect: string; path: string; message: string }[];
        unevaluated: unknown[];
      };
      expect(verdict.findings).toEqual([
        {
          ruleId: 'PERF-THRESHOLD',
          effect: scenario.effect,
          path: performanceCase.fixture,
          message: 'Performance case paint-ready did not meet its reviewed threshold',
        },
      ]);
      expect(verdict.unevaluated).toEqual([]);
      expect(verdict.allowed).toBe(scenario.effect === 'debt');
      expect(verdict.certifies).toBe(false);
      expect(invocation.exitCode).toBe(scenario.effect === 'refusal' ? 1 : 0);
    }
  });

  it('rejects invalid evidence flag and evidence without the Performance rule', async () => {
    const fixture = productionFixture();
    const invalidFlag = await checkProduction(fixture, true, { evidenceFlag: '--other-evidence' });
    expect(invalidFlag.exitCode).toBe(1);
    expect(stderrOf(invalidFlag)).toContain('--performance-evidence <json>');
    const wrongRule = await checkProduction(fixture, true, { ruleId: 'MOD-INDEX' });
    expect(wrongRule.exitCode).toBe(1);
    expect(stderrOf(wrongRule)).toContain(
      'Performance evidence was supplied without selecting PERF-THRESHOLD',
    );
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
    const refusedEnvironments: readonly PerformanceSelection['selectionEnvironment'][] = [
      {},
      { CI: '1', E2E_PORT_SHIFT: '0' },
      { CI: '1', E2E_PORT_SHIFT: '6000', PLAYWRIGHT_GREP: 'ordinary' },
    ];
    for (const selectionEnvironment of refusedEnvironments) {
      expect(() =>
        evaluatePerformanceRun(declaration, execution, authority, {
          ...selection,
          selectionEnvironment,
        }),
      ).toThrow('selection environment');
    }
  });

  it('binds the exact shifted CI environment into the selection digest', () => {
    const { candidateRoot, policyPath } = policyFixture();
    const loaded = loadRulePolicyWithIdentity(candidateRoot, policyPath);
    const authority = { policy: loaded.policy, policyDigest: loaded.digest };
    const first = evaluatePerformanceRun(declaration, execution, authority, selection);
    const second = evaluatePerformanceRun(declaration, execution, authority, {
      ...selection,
      selectionEnvironment: { CI: '1', E2E_PORT_SHIFT: '6500' },
    });
    expect(first.selectionDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(second.selectionDigest).not.toBe(first.selectionDigest);
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

describe('complete check Performance evidence', () => {
  it('evaluates bound evidence and refuses invalid inputs in source and installed executable', async () => {
    const fixture = productionFixture();
    const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(
      fixture.policyPath,
      JSON.stringify({
        ...policy,
        classificationPolicy: JSON.parse(
          readFileSync(
            join(import.meta.dir, '../contracts/fixtures/classification-policy.v1.json'),
            'utf8',
          ),
        ) as unknown,
        plainTypeScriptPaths: [],
        relationshipRequest: {
          schemaVersion: 1,
          typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/entry.ts'] },
        },
        sizeCeilings: { ceiling: 40, roots: ['src'], pinned: [] },
        scenarios: { baseRevision: '0'.repeat(40) },
      }),
    );
    const evidence = {
      ...fixture.evidence,
      policyDigest: loadRulePolicyWithIdentity(fixture.repository, fixture.policyPath).digest,
    };
    writeFileSync(fixture.evidencePath, JSON.stringify(evidence));
    const packageRoot = mkdtempSync(join(tmpdir(), 'burokrat-complete-check-package-'));
    roots.push(packageRoot);
    await buildPackage(packageRoot);
    writeFileSync(
      join(packageRoot, 'package.json'),
      readFileSync(join(import.meta.dir, '../../package.json')),
    );
    const consumer = mkdtempSync(join(tmpdir(), 'burokrat-complete-check-consumer-'));
    roots.push(consumer);
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true }));
    // Installs the packed tarball, as a consumer does: since Bun 1.4.4 `bun add <directory>` drops
    // nested `node_modules` from the copy, which strips the toolkit's trusted closure.
    // Proof: under Bun 1.4.4 the directory install made the installed `check` exit 1 with
    // `toolkit runtime closure differs from toolkit.json` and empty stdout; under 1.4.2 it passed.
    const tarballs = join(packageRoot, 'packed');
    await packPackage(packageRoot, tarballs);
    const tarball = join(tarballs, 'twilight-burokrat-0.1.0.tgz');
    const installation = Bun.spawnSync([process.execPath, 'add', '--ignore-scripts', tarball], {
      cwd: consumer,
      env: { ...process.env, BUN_TMPDIR: consumer, BUN_INSTALL_CACHE_DIR: join(consumer, 'cache') },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(installation.exitCode, installation.stderr.toString()).toBe(0);
    const executable = join(consumer, 'node_modules/.bin/twib');
    const help = Bun.spawnSync([process.execPath, executable, '--help'], {
      cwd: consumer,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(help.exitCode, help.stderr.toString()).toBe(0);
    expect(help.stdout.toString()).toContain('[--performance-evidence <json>]');
    for (const entry of ['source', executable]) {
      const check = async (flags: string[]): Promise<CliInvocation> => {
        const args = [
          'check',
          'committed',
          fixture.repository,
          'HEAD',
          fixture.policyPath,
          ...flags,
        ];
        if (entry === 'source') return await invokeCli(args);
        const invocation = Bun.spawnSync([process.execPath, entry, ...args], {
          cwd: consumer,
          stdout: 'pipe',
          stderr: 'pipe',
        });
        return {
          exitCode: invocation.exitCode,
          stdout: invocation.stdout.toString(),
          stderr: invocation.stderr.toString(),
        };
      };
      const flags = ['--performance-evidence', fixture.evidencePath];
      const valid = await check(flags);
      expect(valid.stderr, entry).not.toContain('check flag');
      const verdict = JSON.parse(valid.stdout) as {
        ruleIds: string[];
        certifies: boolean;
        unevaluated: { ruleId: string; reason: string }[];
        findings: { ruleId: string }[];
      };
      expect(verdict.ruleIds, entry).toEqual(registeredRules().map((rule) => rule.id));
      expect(verdict.certifies).toBe(false);
      expect(
        verdict.unevaluated.filter((rule) => rule.ruleId === 'PERF-THRESHOLD'),
        entry,
      ).toEqual([]);
      expect(
        verdict.findings.filter((finding) => finding.ruleId === 'PERF-THRESHOLD'),
        entry,
      ).toEqual([]);
      const absent = await check([]);
      expect(absent.exitCode).toBe(1);
      expect(absent.stdout).toContain('Performance run evidence is not supplied');
      for (const [field, message] of [
        ['candidate', 'Performance evidence candidate identity mismatch'],
        ['policyDigest', 'Performance evidence policy identity mismatch'],
        ['declarationDigest', 'Performance evidence declaration identity mismatch'],
      ]) {
        writeFileSync(
          fixture.evidencePath,
          JSON.stringify({ ...evidence, [field]: '0'.repeat(64) }),
        );
        const mismatched = await check(flags);
        expect(mismatched.exitCode).toBe(1);
        expect(mismatched.stdout, entry).toContain(message);
      }
      writeFileSync(fixture.evidencePath, '{');
      const malformed = await check(flags);
      expect(malformed.exitCode).toBe(1);
      expect(malformed.stderr).toContain('JSON');
      rmSync(fixture.evidencePath);
      const missing = await check(flags);
      expect(missing.exitCode).toBe(1);
      expect(missing.stderr).toContain(fixture.evidencePath);
      writeFileSync(fixture.evidencePath, JSON.stringify(evidence));
      for (const invalid of [
        [...flags, ...flags],
        ['--rule', 'PERF-THRESHOLD', '--rule', 'MOD-INDEX'],
        ['--other-evidence', fixture.evidencePath],
      ]) {
        const refused = await check(invalid);
        expect(refused.exitCode).toBe(1);
        expect(refused.stderr).toContain('check flag');
      }
      const unrelated = await check(['--rule', 'MOD-INDEX', ...flags]);
      expect(unrelated.exitCode).toBe(1);
      expect(unrelated.stderr).toContain('without selecting PERF-THRESHOLD');
      const selected = await check(['--rule', 'PERF-THRESHOLD', ...flags]);
      expect(selected.exitCode, selected.stderr).toBe(0);
      expect(JSON.parse(selected.stdout) as unknown).toMatchObject({
        ruleIds: ['PERF-THRESHOLD'],
        certifies: false,
      });
    }
  }, 120_000);
});
