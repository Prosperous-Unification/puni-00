import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  digestEvidenceBytes,
  digestPerformanceDeclaration,
  type PerformanceCases,
} from '@shared/test-evidence';
import { afterEach, expect, test } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { invokeCli } from '../invoke-cli';
import { buildPackage } from '../packaging/build';
import { registeredRules } from '../rules/registry';
import { proposeScenarioAllocation } from '../rules/scenarios';
import { hashCanonical } from './content-manifest';
import { digestPerformanceCase } from './performance';
import type { inspectPerformanceScenarios } from './performance-scenarios';

const scratch: string[] = [];
const invocationId = '11111111-1111-4111-8111-111111111111';
const projectRoot = 'apps/example';
const manifestPath = `${projectRoot}/project.json`;
const config = `${projectRoot}/playwright.performance.config.ts`;
const declarationPath = `${projectRoot}/playwright.performance.cases.json`;
const fixturePath = `${projectRoot}/src/architecture/f7.architecture.test.ts`;
const pointerPath = 'tmp/junit/wbs-fe-01.performance.current.json';
const baseDeclaration: PerformanceCases = {
  schemaVersion: 1,
  config,
  project: 'chromium',
  cases: [
    {
      caseId: 'cells',
      fixture: fixturePath,
      titlePath: ['[EXAMPLE-001] renders cells'],
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
function fixture(
  membership: 'none' | 'architecture' | 'conformance' | 'both' = 'none',
  multiple = false,
  shared = false,
  terminal = '[EXAMPLE-001] renders cells',
  extraSpec = '',
  extraFiles: Record<string, string> = {},
  retireSecond = false,
  includeScenarios = true,
  parentTitle = '',
) {
  const secondFixture = shared
    ? fixturePath
    : `${projectRoot}/src/architecture/mod-index.architecture.test.ts`;
  const declaration: PerformanceCases = {
    ...baseDeclaration,
    cases: multiple
      ? [
          {
            ...baseDeclaration.cases[0],
            caseId: 'zulu',
            fixture: secondFixture,
            titlePath:
              parentTitle === '' ? [terminal + ' second'] : [parentTitle, terminal + ' second'],
          },
          ...baseDeclaration.cases,
        ]
      : baseDeclaration.cases.map((entry) => ({
          ...entry,
          titlePath: parentTitle === '' ? [terminal] : [parentTitle, terminal],
        })),
  };
  const base = mkdtempSync(join(tmpdir(), 'burokrat-performance-'));
  scratch.push(base);
  const root = join(base, 'candidate');
  mkdirSync(root);
  git(root, ['init']);
  git(root, ['config', 'user.name', 'Performance Fixture']);
  git(root, ['config', 'user.email', 'performance@example.invalid']);
  mkdirSync(dirname(join(root, fixturePath)), { recursive: true });
  const targets =
    membership === 'conformance' || membership === 'both'
      ? {
          'test:conformance': {
            executor: 'nx:run-commands',
            cache: false,
            options: {
              command: 'bun test ./src/architecture/f7.architecture.test.ts --timeout=1000',
              cwd: projectRoot,
              forwardAllArgs: false,
            },
          },
        }
      : {};
  writeFileSync(join(root, manifestPath), JSON.stringify({ targets }));
  const architecturePath = `${projectRoot}/src/architecture-fixtures.json`;
  if (membership === 'architecture' || membership === 'both')
    writeFileSync(
      join(root, architecturePath),
      JSON.stringify({
        schemaVersion: 1,
        fixtures: [{ ruleId: 'F7', file: 'src/architecture/f7.architecture.test.ts' }],
      }),
    );
  writeFileSync(join(root, config), 'throw new Error("candidate config executed");\n');
  writeFileSync(join(root, declarationPath), JSON.stringify(declaration, null, 2));
  for (const performanceCase of declaration.cases)
    writeFileSync(
      join(root, performanceCase.fixture),
      'throw new Error("candidate fixture executed");\n',
    );
  mkdirSync(join(root, 'openspec/specs/example'), { recursive: true });
  writeFileSync(
    join(root, 'openspec/scenario-allocations.json'),
    JSON.stringify({ schemaVersion: 1, events: [] }),
  );
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'predecessor']);
  const baseRevision = git(root, ['rev-parse', 'HEAD']);
  const proposal = proposeScenarioAllocation(
    { schemaVersion: 1, events: [] },
    'openspec/specs/example/spec.md',
    '# Example\n\n## Requirements\n\n### Requirement: Rendering\n\n#### Scenario: renders cells\n- **WHEN** rendered\n- **THEN** bounded\n\n#### Scenario: second adopted case\n- **WHEN** rendered\n- **THEN** bounded\n',
  );
  writeFileSync(
    join(root, 'openspec/specs/example/spec.md'),
    (retireSecond
      ? proposal.specMarkdown.slice(
          0,
          proposal.specMarkdown.indexOf('#### Scenario: [EXAMPLE-002]'),
        )
      : proposal.specMarkdown) + extraSpec,
  );
  writeFileSync(
    join(root, 'openspec/scenario-allocations.json'),
    JSON.stringify(
      retireSecond
        ? {
            ...proposal.journal,
            events: [...proposal.journal.events, { kind: 'retire', id: 'EXAMPLE-002' }],
          }
        : proposal.journal,
    ),
  );
  for (const [path, content] of Object.entries(extraFiles)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'candidate']);
  const revision = git(root, ['rev-parse', 'HEAD']);
  const selected = readCandidate(root, { kind: 'committed', revision });
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const pin = (path: string) => ({
    path,
    digest: digestEvidenceBytes(readFileSync(join(root, path))),
  });
  const factsAuthority = {
    schemaVersion: 1,
    revision,
    candidate,
    scope: {
      projectRoot,
      projectManifest: pin(manifestPath),
      declaration: pin(declarationPath),
      config: pin(config),
      project: 'chromium',
      fixtures: [...new Set(declaration.cases.map((performanceCase) => performanceCase.fixture))],
    },
    manual: { kind: 'reviewed-empty' },
    conformance:
      membership === 'conformance' || membership === 'both'
        ? { kind: 'committed', ...pin(manifestPath) }
        : { kind: 'reviewed-empty' },
    architecture:
      membership === 'architecture' || membership === 'both'
        ? { kind: 'committed', ...pin(architecturePath) }
        : { kind: 'reviewed-empty' },
  };
  const authorityPath = join(base, 'facts-authority.json');
  writeFileSync(authorityPath, JSON.stringify(factsAuthority));
  const policyPath = join(base, 'rule-policy.json');
  const policy = {
    schemaVersion: 1,
    policyId: 'performance-fixture',
    ruleModes: registeredRules().map((rule) => ({ ruleId: rule.id, mode: 'observe' })),
    ...(includeScenarios ? { scenarios: { baseRevision } } : {}),
    performance: {
      acceptedDeclarationSchema: 1,
      declarationPath,
      config,
      configDigest: digestEvidenceBytes('throw new Error("candidate config executed");\n'),
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
    cases: declaration.cases.map((performanceCase) => ({
      caseId: performanceCase.caseId,
      status: 'passed',
      observations: [{ measurement: 'mounted-cells', unit: 'count', value: 10 }],
    })),
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
    suites: declaration.cases.map((performanceCase) => {
      const specs = [
        {
          file: performanceCase.fixture,
          title: performanceCase.titlePath.at(-1),
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
                                caseId: performanceCase.caseId,
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
      ];
      return parentTitle === ''
        ? { file: performanceCase.fixture, title: performanceCase.fixture, specs }
        : {
            file: performanceCase.fixture,
            title: performanceCase.fixture,
            specs: [],
            suites: [{ title: parentTitle, file: performanceCase.fixture, specs, suites: [] }],
          };
    }),
  });
  const report = `<testsuite name="wbs-fe-01.performance" tests="${String(declaration.cases.length)}" failures="0" errors="0" skipped="0">${declaration.cases.map((performanceCase) => `<testcase classname="${performanceCase.fixture}" file="${performanceCase.fixture}" name="${performanceCase.titlePath.join(' › ')}"/>`).join('')}</testsuite>`;
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
    collected: declaration.cases.map(({ caseId, fixture, titlePath }) => ({
      caseId,
      fixture,
      titlePath,
    })),
  };
  for (const [field, source] of Object.entries(artifacts)) {
    const path = field === 'report' ? 'report.xml' : `${field === 'run' ? 'run' : field}.json`;
    writeFileSync(join(bundle, path), source);
    manifest[field] = { path, digest: digestEvidenceBytes(source) };
  }
  writeFileSync(join(bundle, 'manifest.json'), JSON.stringify(manifest));
  return {
    root,
    revision,
    policyPath,
    authorityPath,
    factsAuthority,
    bundle,
    manifest,
    policy,
    evidence,
  };
}
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});
function inspect(setup: ReturnType<typeof fixture>, capability = 'example', extra: string[] = []) {
  return invokeCli([
    'inspect-performance-scenarios',
    setup.root,
    setup.revision,
    setup.policyPath,
    setup.authorityPath,
    capability,
    ...extra,
  ]);
}
test('[TEST-AXES-096] joins selected passing Performance cases to every adopted requested scenario', async () => {
  const setup = fixture();
  const invocation = await inspect(setup);
  expect(invocation.stderr).toBe('');
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<
    typeof inspectPerformanceScenarios
  >;
  expect(observation.scenarios).toEqual([
    {
      id: 'EXAMPLE-001',
      title: 'renders cells',
      observation: { kind: 'passing', caseIds: ['cells'] },
    },
    {
      id: 'EXAMPLE-002',
      title: 'second adopted case',
      observation: { kind: 'unobserved-in-selection' },
    },
  ]);
  expect(observation.revision).toBe(setup.revision);
  expect(observation.candidate).toBe(setup.factsAuthority.candidate);
  expect(observation.policyId).toBe('performance-fixture');
  expect(observation.policyDigest).toBe(digestEvidenceBytes(readFileSync(setup.policyPath)));
  expect(observation.declarationDigest).toBe(setup.evidence.declarationDigest);
  expect(observation.scope).toEqual({
    kind: 'selected-performance-publication',
    selection: setup.evidence.selection,
  });
  expect(observation.specifications.baseRevision).toBe(
    setup.policy.scenarios?.baseRevision ?? 'missing policy authority',
  );
  expect(observation.citationFindings).toEqual([]);
  expect(observation.authentication).toEqual({ kind: 'absent' });
  expect(observation.certifies).toBe(false);
  const { observationDigest, ...payload } = observation;
  expect(observationDigest).toBe(hashCanonical(payload));
});
for (const [terminal, kind] of [
  ['renders cells', 'missing'],
  ['[EXAMPLE-1] cells', 'malformed'],
  ['[EXAMPLE-999] cells', 'inactive'],
] as const) {
  test(`[TEST-AXES-097] diagnoses ${kind} terminal citation`, async () => {
    const invocation = await inspect(fixture('none', false, false, terminal));
    expect(invocation.exitCode).toBe(1);
    const observation = JSON.parse(invocation.stdout) as ReturnType<
      typeof inspectPerformanceScenarios
    >;
    expect(observation.citationFindings).toEqual([{ caseId: 'cells', kind, title: terminal }]);
    expect(
      observation.scenarios.every(
        (scenario) => scenario.observation.kind === 'unobserved-in-selection',
      ),
    ).toBe(true);
  });
}
test('[TEST-AXES-099] refuses absent capability, wrong level and unsupported operands without JSON', async () => {
  for (const [setup, capability, extra, finding] of [
    [fixture(), 'absent', [], 'capability is absent'],
    [fixture('architecture'), 'example', [], 'requires isolated Performance'],
    [fixture(), 'example', ['extra'], 'usage: twilight-burokrat inspect-performance-scenarios'],
  ] as const) {
    const invocation = await inspect(setup, capability, [...extra]);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(finding);
  }
});
test('[TEST-AXES-098] refuses unidentified requested scenario', async () => {
  const invocation = await inspect(
    fixture(
      'none',
      false,
      false,
      '[EXAMPLE-001] renders cells',
      '\n#### Scenario: unidentified debt\n- **WHEN** read\n- **THEN** unresolved\n',
    ),
  );
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('requested capability has unidentified scenarios');
});

test('[TEST-AXES-098] preserves unrelated unidentified B3 debt without promoting it to requested rows', async () => {
  const invocation = await inspect(
    fixture('none', false, false, '[EXAMPLE-001] renders cells', '', {
      'openspec/specs/unrelated/spec.md':
        '# Other\n\n## Requirements\n\n### Requirement: Other\n\n#### Scenario: existing debt\n- **WHEN** read\n- **THEN** unresolved\n',
    }),
  );
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<
    typeof inspectPerformanceScenarios
  >;
  expect(observation.specifications.unidentified).toEqual([
    { path: 'openspec/specs/unrelated/spec.md', title: 'existing debt' },
  ]);
  expect(observation.scenarios).toHaveLength(2);
});
test('[TEST-AXES-098] whole-tree B3 refuses an unrelated active conflict before capability filtering', async () => {
  const content =
    '## ADDED Requirements\n\n### Requirement: Other\n\n#### Scenario: debt\n- **WHEN** read\n- **THEN** unresolved\n';
  const invocation = await inspect(
    fixture('none', false, false, '[EXAMPLE-001] renders cells', '', {
      'openspec/changes/first/specs/unrelated/spec.md': content,
      'openspec/changes/second/specs/unrelated/spec.md': content,
    }),
  );
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('competing overlay operation: unrelated');
});
test('[TEST-AXES-099] source and publication failures never emit partial scenario JSON', async () => {
  for (const fault of ['source', 'policy', 'declaration', 'publication'] as const) {
    const setup = fixture();
    if (fault === 'source') {
      writeFileSync(join(setup.root, fixturePath), 'changed source');
      git(setup.root, ['add', '.']);
      git(setup.root, ['commit', '-m', 'changed selected source']);
      setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
    } else if (fault === 'policy') writeFileSync(setup.policyPath, '{broken');
    else if (fault === 'declaration') {
      setup.factsAuthority.scope.declaration.digest = '0'.repeat(64);
      writeFileSync(setup.authorityPath, JSON.stringify(setup.factsAuthority));
    } else rmSync(join(setup.bundle, 'run.json'));
    const invocation = await inspect(setup);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr.length).toBeGreaterThan(0);
  }
});
test('[TEST-AXES-099] installed scenario dispatch binds the same complete observation', async () => {
  const setup = fixture();
  const packageDirectory = join(setup.root, 'package');
  await buildPackage(packageDirectory);
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      join(packageDirectory, 'dist/bin.mjs'),
      'inspect-performance-scenarios',
      setup.root,
      setup.revision,
      setup.policyPath,
      setup.authorityPath,
      'example',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
  expect(invocation.stderr.toString()).toBe('');
  const source = await inspect(setup);
  expect(JSON.parse(invocation.stdout.toString())).toEqual(JSON.parse(source.stdout));
}, 120_000);

test('[TEST-AXES-097] retired citations cannot observe an active scenario', async () => {
  const invocation = await inspect(
    fixture('none', false, false, '[EXAMPLE-002] retired case', '', {}, true),
  );
  expect(invocation.exitCode).toBe(1);
  const observation = JSON.parse(invocation.stdout) as ReturnType<
    typeof inspectPerformanceScenarios
  >;
  expect(observation.citationFindings).toEqual([
    { caseId: 'cells', kind: 'inactive', title: '[EXAMPLE-002] retired case' },
  ]);
  expect(observation.scenarios).toEqual([
    { id: 'EXAMPLE-001', title: 'renders cells', observation: { kind: 'unobserved-in-selection' } },
  ]);
});

test('[TEST-AXES-099] requires explicit external policy.scenarios', async () => {
  const invocation = await inspect(
    fixture('none', false, false, '[EXAMPLE-001] renders cells', '', {}, false, false),
  );
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('needs external policy.scenarios');
});
for (const [replacement, finding] of [
  [
    "publication: { ...context.publication, policyDigest: 'foreign' }",
    'policy differs from publication',
  ],
  [
    'declaration: { ...context.declaration, cases: context.declaration.cases.map((entry) => ({ ...entry, titlePath: [] })) }',
    'terminal test title is absent',
  ],
] as const) {
  test(`[TEST-AXES-099] broken validated context refuses ${finding}`, () => {
    const setup = fixture();
    const modulePath = join(import.meta.dir, 'performance-levels.ts');
    const preload = join(setup.root, 'fault-preload.ts');
    writeFileSync(
      preload,
      `import { mock } from 'bun:test';\nconst actual = await import(${JSON.stringify(modulePath + '?real-context')});\nmock.module(${JSON.stringify(modulePath)}, () => ({ ...actual, inspectPerformanceSelection: (...args) => { const context = actual.inspectPerformanceSelection(...args); return { ...context, ${replacement} }; } }));\n`,
    );
    const invocation = Bun.spawnSync(
      [
        process.execPath,
        'run',
        `--preload=${preload}`,
        join(import.meta.dir, '../cli.ts'),
        'inspect-performance-scenarios',
        setup.root,
        setup.revision,
        setup.policyPath,
        setup.authorityPath,
        'example',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout.toString()).toBe('');
    expect(invocation.stderr.toString()).toContain(finding);
  });
}

test('[TEST-AXES-096] joins multiple distinct passing cases in canonical case order', async () => {
  const invocation = await inspect(fixture('none', true, true));
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<
    typeof inspectPerformanceScenarios
  >;
  expect(observation.scenarios[0]?.observation).toEqual({
    kind: 'passing',
    caseIds: ['cells', 'zulu'],
  });
});

test('[TEST-AXES-097] only terminal test-title prefixes cite scenarios, including nested suites', async () => {
  for (const terminal of ['[EXAMPLE-001] renders cells', 'renders cells']) {
    const invocation = await inspect(
      fixture('none', false, false, terminal, '', {}, false, true, '[EXAMPLE-002] suite'),
    );
    expect(invocation.exitCode, invocation.stderr).toBe(terminal.startsWith('[') ? 0 : 1);
    const observation = JSON.parse(invocation.stdout) as ReturnType<
      typeof inspectPerformanceScenarios
    >;
    expect(observation.scenarios[1]?.observation).toEqual({ kind: 'unobserved-in-selection' });
    expect(observation.citationFindings).toHaveLength(terminal.startsWith('[') ? 0 : 1);
  }
});

test('[TEST-AXES-096] upstream observation identities affect complete scenario digest', async () => {
  const setup = fixture();
  const baseline = JSON.parse((await inspect(setup)).stdout) as ReturnType<
    typeof inspectPerformanceScenarios
  >;
  const modulePath = join(import.meta.dir, 'performance-levels.ts');
  const preload = join(setup.root, 'identity-preload.ts');
  writeFileSync(
    preload,
    `import { mock } from 'bun:test';\nconst actual = await import(${JSON.stringify(modulePath + '?real-identity')});\nmock.module(${JSON.stringify(modulePath)}, () => ({ ...actual, inspectPerformanceSelection: (...args) => { const context = actual.inspectPerformanceSelection(...args); return { ...context, publication: { ...context.publication, observationDigest: 'publication-fault' }, levels: { ...context.levels, observationDigest: 'levels-fault' } }; } }));\n`,
  );
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '../cli.ts'),
      'inspect-performance-scenarios',
      setup.root,
      setup.revision,
      setup.policyPath,
      setup.authorityPath,
      'example',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode).toBe(0);
  const observation = JSON.parse(invocation.stdout.toString()) as ReturnType<
    typeof inspectPerformanceScenarios
  >;
  expect(observation.publicationObservationDigest).toBe('publication-fault');
  expect(observation.levelsObservationDigest).toBe('levels-fault');
  expect(observation.observationDigest).not.toBe(baseline.observationDigest);
  const { observationDigest, ...payload } = observation;
  expect(observationDigest).toBe(hashCanonical(payload));
});
