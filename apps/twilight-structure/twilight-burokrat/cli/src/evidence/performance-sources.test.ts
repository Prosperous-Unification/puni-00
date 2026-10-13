import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  digestEvidenceBytes,
  digestPerformanceDeclaration,
  type PerformanceCases,
} from '@shared/test-evidence';
import { afterEach, expect, test } from 'bun:test';

import { checkIndexes } from '../indexes/check-indexes';
import { readCandidate } from '../inventory/read-candidate';
import { invokeCli } from '../invoke-cli';
import { registeredRules } from '../rules/registry';
import { hashCanonical } from './content-manifest';
import { digestPerformanceCase } from './performance';

const scratch: string[] = [];
const invocationId = '11111111-1111-4111-8111-111111111111';
const config = 'playwright.performance.config.ts';
const declarationPath = 'playwright.performance.cases.json';
const fixturePath = 'apps/alpha/nested/case.perf.spec.ts';
const pointerPath = 'tmp/junit/wbs-fe-01.performance.current.json';
const declaration: PerformanceCases = {
  schemaVersion: 1,
  config,
  project: 'chromium',
  cases: [
    {
      caseId: 'cells',
      fixture: fixturePath,
      titlePath: ['renders cells'],
      measurement: 'mounted-cells',
      unit: 'count',
      operator: 'lte',
      threshold: 20,
    },
  ],
};
function git(root: string, args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', root, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}
function fixture(ownership: 'nested' | 'missing' | 'duplicate' = 'nested') {
  const base = mkdtempSync(join(tmpdir(), 'burokrat-performance-'));
  scratch.push(base);
  const root = join(base, 'candidate');
  mkdirSync(root);
  git(root, ['init']);
  git(root, ['config', 'user.name', 'Performance Fixture']);
  git(root, ['config', 'user.email', 'performance@example.invalid']);
  writeFileSync(join(root, config), 'export default {}\n');
  writeFileSync(join(root, declarationPath), JSON.stringify(declaration));
  mkdirSync(join(root, 'apps/alpha/nested'), { recursive: true });
  writeFileSync(join(root, fixturePath), 'test("renders cells", () => {});\n');
  const metadata = (moduleId: string, memberships: object[]) => ({
    schemaVersion: 1,
    moduleId,
    memberships,
    relationshipSelectors: [],
    applicableChecks: [],
    inapplicableSections: [
      { section: 'relationships', reason: 'Fixture only.' },
      { section: 'invariants', reason: 'Fixture only.' },
      { section: 'checks', reason: 'Fixture only.' },
    ],
    externalConsumers: { kind: 'none-known', knowledgeLimit: 'Fixture only.' },
  });
  const index = (name: string, record: object, link: string) =>
    `# ${name}\n\n<!-- module-index ${JSON.stringify(record)} -->\n\n- [Child](${link})\n`;
  writeFileSync(
    join(root, 'apps/alpha/README.md'),
    index(
      'Outer',
      metadata('module.outer', [{ kind: 'path', path: 'nested/README.md' }]),
      'nested/README.md',
    ),
  );
  if (ownership !== 'missing')
    writeFileSync(
      join(root, 'apps/alpha/nested/README.md'),
      index(
        'Nested',
        metadata(ownership === 'duplicate' ? 'module.outer' : 'module.nested', [
          { kind: 'path', path: 'case.perf.spec.ts' },
        ]),
        'case.perf.spec.ts',
      ),
    );
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'candidate']);
  const revision = git(root, ['rev-parse', 'HEAD']);
  const selected = readCandidate(root, { kind: 'committed', revision });
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const policyPath = join(base, 'rule-policy.json');
  const policy = {
    schemaVersion: 1,
    policyId: 'performance-fixture',
    ruleModes: registeredRules().map((rule) => ({ ruleId: rule.id, mode: 'observe' })),
    performance: {
      acceptedDeclarationSchema: 1,
      declarationPath,
      config,
      configDigest: digestEvidenceBytes('export default {}\n'),
      project: 'chromium',
      runnerVersion: '1.63.0',
      reviewedCases: declaration.cases.map((performanceCase) => ({
        caseId: performanceCase.caseId,
        caseDigest: digestPerformanceCase(performanceCase),
      })),
    },
  };
  writeFileSync(policyPath, JSON.stringify(policy));
  const policyDigest = digestEvidenceBytes(readFileSync(policyPath));
  const bundle = join(root, 'tmp/junit/performance', invocationId);
  mkdirSync(bundle, { recursive: true });
  const pointer = {
    schemaVersion: 1,
    certifies: false,
    invocationId,
    bundle: `tmp/junit/performance/${invocationId}`,
  };
  writeFileSync(join(root, pointerPath), JSON.stringify(pointer));
  const selection = {
    declarationPath,
    config,
    project: 'chromium',
    configDigest: policy.performance.configDigest,
    runnerVersion: '1.63.0',
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
    selectionEnvironment: { CI: '1', E2E_PORT_SHIFT: '6000' },
  };
  const run = {
    schemaVersion: 1,
    exitCode: 0,
    cases: [
      {
        caseId: 'cells',
        status: 'passed',
        observations: [{ measurement: 'mounted-cells', unit: 'count', value: 10 }],
      },
    ],
  };
  const evidence = {
    schemaVersion: 1,
    candidate,
    policyDigest,
    declarationDigest: digestPerformanceDeclaration(declaration),
    selection,
    run,
  };
  const raw = (phase: 'list' | 'run') => ({
    config: {
      configFile: `/historical/removed/candidate/${config}`,
      rootDir: '/historical/removed/candidate',
      version: '1.63.0',
      projects: [{ name: 'chromium' }],
    },
    errors: [],
    suites: [
      {
        file: fixturePath,
        title: fixturePath,
        specs: [
          {
            file: fixturePath,
            title: 'renders cells',
            tests: [
              {
                projectName: 'chromium',
                status: phase === 'list' ? 'skipped' : 'expected',
                results:
                  phase === 'list'
                    ? []
                    : [
                        {
                          status: 'passed',
                          attachments: [
                            {
                              name: 'puni.performance.observation.v1',
                              contentType: 'application/json',
                              body: Buffer.from(
                                JSON.stringify({
                                  schemaVersion: 1,
                                  caseId: 'cells',
                                  measurement: 'mounted-cells',
                                  unit: 'count',
                                  value: 10,
                                }),
                              ).toString('base64'),
                            },
                          ],
                        },
                      ],
              },
            ],
          },
        ],
      },
    ],
  });
  const report = `<testsuite name="wbs-fe-01.performance" tests="1" failures="0" errors="0" skipped="0"><testcase classname="${fixturePath}" file="${fixturePath}" name="renders cells"/></testsuite>`;
  const artifacts = {
    discovery: JSON.stringify(raw('list')),
    run: JSON.stringify(raw('run')),
    evidence: JSON.stringify(evidence),
    report,
  };
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    certifies: false,
    invocationId,
    candidate,
    revision,
    policyDigest,
    declarationDigest: evidence.declarationDigest,
    configDigest: selection.configDigest,
    selection,
    collected: [{ caseId: 'cells', fixture: fixturePath, titlePath: ['renders cells'] }],
  };
  for (const [field, source] of Object.entries(artifacts)) {
    const path = field === 'report' ? 'report.xml' : `${field === 'run' ? 'run' : field}.json`;
    writeFileSync(join(bundle, path), source);
    manifest[field] = { path, digest: digestEvidenceBytes(source) };
  }
  writeFileSync(join(bundle, 'manifest.json'), JSON.stringify(manifest));
  return { root, revision, policyPath, bundle, manifest, policy, evidence };
}
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

async function inspect(setup: ReturnType<typeof fixture>) {
  return invokeCli(['inspect-performance-sources', setup.root, setup.revision, setup.policyPath]);
}

function inspectFault(setup: ReturnType<typeof fixture>, modulePath: string, replacement: string) {
  const preload = join(setup.root, 'fault-preload.ts');
  writeFileSync(
    preload,
    `import { mock } from 'bun:test';\nconst actual = await import(${JSON.stringify(`${modulePath}?real-fault`)});\nmock.module(${JSON.stringify(modulePath)}, () => ({ ...actual, ${replacement} }));\n`,
  );
  const call = Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '..', 'cli.ts'),
      'inspect-performance-sources',
      setup.root,
      setup.revision,
      setup.policyPath,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  return {
    exitCode: call.exitCode,
    stdout: call.stdout.toString(),
    stderr: call.stderr.toString(),
  };
}

test('Performance source inspection binds the exact nested committed owner', async () => {
  const setup = fixture();
  const call = await inspect(setup);
  expect(call.exitCode).toBe(0);
  const parsed: unknown = JSON.parse(call.stdout);
  const observation = parsed as Record<string, unknown>;
  expect(observation['certifies']).toBe(false);
  expect(observation['authentication']).toEqual({ kind: 'absent' });
  const bindings = observation['bindings'] as {
    caseId: string;
    fixture: string;
    status: string;
    judgment: object;
    owner: object;
    source: object;
    level: object;
  }[];
  expect(bindings).toHaveLength(1);
  expect(bindings[0]?.caseId).toBe('cells');
  expect(bindings[0]?.fixture).toBe(fixturePath);
  expect(bindings[0]?.status).toBe('passed');
  expect(bindings[0]?.judgment).toEqual({ observed: 10, threshold: 20, passed: true });
  expect(bindings[0]?.level).toEqual({
    kind: 'unresolved',
    reason: 'complete-level-membership-unavailable',
  });
  const selected = readCandidate(setup.root, { kind: 'committed', revision: setup.revision });
  const checked = checkIndexes(setup.root, selected);
  const owner = checked.indexes.find((index) => index.moduleId === 'module.nested');
  expect(observation['indexIdentity']).toBe(checked.identity);
  expect(bindings[0]?.owner).toEqual({
    moduleId: 'module.nested',
    indexPath: 'apps/alpha/nested/README.md',
    indexIdentity: owner?.identity,
  });
  expect(bindings[0]?.source).toEqual({
    mode: '100644',
    contentDigest: digestEvidenceBytes('test("renders cells", () => {});\n'),
  });
  const { observationDigest, ...payload } = observation;
  expect(observationDigest).toBe(hashCanonical(payload));
});

test('Performance source inspection refuses missing committed ownership despite a working repair', async () => {
  const setup = fixture('missing');
  writeFileSync(join(setup.root, 'apps/alpha/nested/README.md'), '# repaired in working tree\n');
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('membership target absent: apps/alpha/nested/README.md');
  expect(call.stdout).toBe('');
});

test('Performance source inspection preserves corrupt publication refusal', async () => {
  const setup = fixture();
  writeFileSync(join(setup.bundle, 'failure.json'), '{}');
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('current-success publication contains a failure diagnostic');
  expect(call.stdout).toBe('');
});

test('Performance source inspection refuses missing publication state', async () => {
  const setup = fixture();
  rmSync(join(setup.root, pointerPath));
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stdout).toBe('');
});

test('Performance source inspection preserves malformed pointer refusal', async () => {
  const setup = fixture();
  writeFileSync(join(setup.root, pointerPath), '{');
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Performance pointer JSON is malformed');
  expect(call.stdout).toBe('');
});

test('Performance source inspection refuses unreadable pointer state', async () => {
  const setup = fixture();
  const path = join(setup.root, pointerPath);
  chmodSync(path, 0o000);
  try {
    const call = await inspect(setup);
    expect(call.exitCode).toBe(1);
    expect(call.stdout).toBe('');
  } finally {
    chmodSync(path, 0o644);
  }
});

test('Performance source inspection preserves external policy refusal', async () => {
  const setup = fixture();
  writeFileSync(setup.policyPath, '{');
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stdout).toBe('');
});

test('Performance source inspection preserves duplicate committed module refusal', async () => {
  const setup = fixture('duplicate');
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('duplicate index module identity: module.outer');
});

test('Performance source inspection refuses symbolic revisions and extra operands', async () => {
  const setup = fixture();
  const symbolic = await invokeCli([
    'inspect-performance-sources',
    setup.root,
    'HEAD',
    setup.policyPath,
  ]);
  expect(symbolic.exitCode).toBe(1);
  expect(symbolic.stderr).toContain('requires a full committed SHA');
  const extra = await invokeCli([
    'inspect-performance-sources',
    setup.root,
    setup.revision,
    setup.policyPath,
    'extra',
  ]);
  expect(extra.exitCode).toBe(1);
  expect(extra.stderr).toContain('usage: twilight-burokrat inspect-performance-sources');
});

for (const field of ['revision', 'candidate'] as const) {
  test(`Performance source inspection refuses mismatched publication ${field}`, () => {
    const setup = fixture();
    const call = inspectFault(
      setup,
      join(import.meta.dir, 'performance-bundle.ts'),
      `inspectPerformanceBundle: (...args) => ({ ...actual.inspectPerformanceBundle(...args), ${field}: 'fault' }),`,
    );
    expect(call.exitCode).toBe(1);
    expect(call.stderr).toContain(
      `Performance source publication ${field} differs from selected candidate`,
    );
    expect(call.stdout).toBe('');
  });
}

test('Performance source inspection refuses a missing publication source tuple', () => {
  const setup = fixture();
  const call = inspectFault(
    setup,
    join(import.meta.dir, 'performance-bundle.ts'),
    `inspectPerformanceBundle: (...args) => ({ ...actual.inspectPerformanceBundle(...args), sources: [] }),`,
  );
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain(`Performance case source differs from publication: ${fixturePath}`);
});

test('Performance source inspection refuses ambiguous owners from a faulted checker', () => {
  const setup = fixture();
  const call = inspectFault(
    setup,
    join(import.meta.dir, '..', 'indexes/check-indexes.ts'),
    `checkIndexes: (...args) => { const checked = actual.checkIndexes(...args); return { ...checked, indexes: [...checked.indexes, { ...checked.indexes.at(-1), moduleId: 'module.fault' }] }; },`,
  );
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain(
    `Performance source has no unique validated index owner: ${fixturePath}`,
  );
});

test('Performance source inspection refuses a noncommitted reader fault', () => {
  const setup = fixture();
  const call = inspectFault(
    setup,
    join(import.meta.dir, '..', 'inventory/read-candidate.ts'),
    `readCandidate: (...args) => { const selected = actual.readCandidate(...args); return { ...selected, selection: { ...selected.selection, kind: 'staged' } }; },`,
  );
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Performance source selection is not committed');
});

test('Performance source digest binds publication, source, judgment and index identities', async () => {
  const setup = fixture();
  const original = await inspect(setup);
  expect(original.exitCode).toBe(0);
  const baseline = JSON.parse(original.stdout) as { observationDigest: string };
  const variations = [
    [
      join(import.meta.dir, 'performance-bundle.ts'),
      `inspectPerformanceBundle: (...args) => ({ ...actual.inspectPerformanceBundle(...args), observationDigest: 'fault' }),`,
    ],
    [
      join(import.meta.dir, 'performance-bundle.ts'),
      `inspectPerformanceBundle: (...args) => { const publication = actual.inspectPerformanceBundle(...args); return { ...publication, sources: publication.sources.map((source) => ({ ...source, digest: 'fault' })) }; },`,
    ],
    [
      join(import.meta.dir, 'performance-bundle.ts'),
      `inspectPerformanceBundle: (...args) => { const publication = actual.inspectPerformanceBundle(...args); return { ...publication, observedCases: publication.observedCases.map((performanceCase) => ({ ...performanceCase, observed: 11 })) }; },`,
    ],
    [
      join(import.meta.dir, '..', 'indexes/check-indexes.ts'),
      `checkIndexes: (...args) => ({ ...actual.checkIndexes(...args), identity: 'fault' }),`,
    ],
    [
      join(import.meta.dir, '..', 'indexes/check-indexes.ts'),
      `checkIndexes: (...args) => { const checked = actual.checkIndexes(...args); return { ...checked, indexes: checked.indexes.map((index) => index.moduleId === 'module.nested' ? { ...index, identity: 'fault' } : index) }; },`,
    ],
    [
      join(import.meta.dir, '..', 'indexes/check-indexes.ts'),
      `checkIndexes: (...args) => ({ ...actual.checkIndexes(...args), reviewDebt: [{ indexPath: 'fault', directEntries: 41, limit: 40 }] }),`,
    ],
  ] as const;
  for (const [modulePath, replacement] of variations) {
    const call = inspectFault(setup, modulePath, replacement);
    expect(call.exitCode).toBe(0);
    const changed = JSON.parse(call.stdout) as Record<string, unknown>;
    expect(changed['observationDigest']).not.toBe(baseline.observationDigest);
    const { observationDigest, ...payload } = changed;
    expect(observationDigest).toBe(hashCanonical(payload));
  }
});

test('Performance source bindings and review debt have canonical order', () => {
  const setup = fixture();
  const modulePath = join(import.meta.dir, 'performance-bundle.ts');
  const first = inspectFault(
    setup,
    modulePath,
    `inspectPerformanceBundle: (...args) => { const publication = actual.inspectPerformanceBundle(...args); return { ...publication, observedCases: [{ ...publication.observedCases[0], caseId: 'aaa' }, ...publication.observedCases] }; },`,
  );
  const second = inspectFault(
    setup,
    modulePath,
    `inspectPerformanceBundle: (...args) => { const publication = actual.inspectPerformanceBundle(...args); return { ...publication, observedCases: [...publication.observedCases, { ...publication.observedCases[0], caseId: 'aaa' }] }; },`,
  );
  expect(first.exitCode).toBe(0);
  expect(second.exitCode).toBe(0);
  const earlier = JSON.parse(first.stdout) as Record<string, unknown>;
  const later = JSON.parse(second.stdout) as Record<string, unknown>;
  expect(earlier).toEqual(later);
  const bindings = earlier['bindings'] as { caseId: string }[];
  expect(bindings.map((binding) => binding.caseId)).toEqual(['aaa', 'cells']);
  const indexPath = join(import.meta.dir, '..', 'indexes/check-indexes.ts');
  const debt =
    '[{ indexPath: "z", directEntries: 42, limit: 40 }, { indexPath: "a", directEntries: 41, limit: 40 }]';
  const forward = inspectFault(
    setup,
    indexPath,
    `checkIndexes: (...args) => ({ ...actual.checkIndexes(...args), reviewDebt: ${debt} }),`,
  );
  const backward = inspectFault(
    setup,
    indexPath,
    `checkIndexes: (...args) => ({ ...actual.checkIndexes(...args), reviewDebt: [...${debt}].reverse() }),`,
  );
  expect(forward.exitCode).toBe(0);
  expect(backward.exitCode).toBe(0);
  const forwardObservation: unknown = JSON.parse(forward.stdout);
  const backwardObservation: unknown = JSON.parse(backward.stdout);
  expect(forwardObservation).toEqual(backwardObservation);
});
