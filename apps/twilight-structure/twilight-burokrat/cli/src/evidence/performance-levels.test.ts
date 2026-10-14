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
import { hashCanonical } from './content-manifest';
import { inspectLevelFacts } from './level-facts';
import { digestPerformanceCase } from './performance';
import { inspectPerformanceBundle } from './performance-bundle';
import type { inspectPerformanceLevels } from './performance-levels';

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
function fixture(
  membership: 'none' | 'architecture' | 'conformance' | 'both' = 'none',
  multiple = false,
  shared = false,
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
            titlePath: ['second'],
          },
          ...baseDeclaration.cases,
        ]
      : [...baseDeclaration.cases],
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
    suites: declaration.cases.map((performanceCase) => ({
      file: performanceCase.fixture,
      title: performanceCase.fixture,
      specs: [
        {
          file: performanceCase.fixture,
          title: performanceCase.titlePath[0],
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
      ],
    })),
  });
  const report = `<testsuite name="wbs-fe-01.performance" tests="${String(declaration.cases.length)}" failures="0" errors="0" skipped="0">${declaration.cases.map((performanceCase) => `<testcase classname="${performanceCase.fixture}" file="${performanceCase.fixture}" name="${performanceCase.titlePath[0]}"/>`).join('')}</testsuite>`;
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

function inspect(setup: ReturnType<typeof fixture>, revision = setup.revision) {
  return invokeCli([
    'inspect-performance-levels',
    setup.root,
    revision,
    setup.authorityPath,
    setup.policyPath,
  ]);
}
function inspectFault(
  setup: ReturnType<typeof fixture>,
  modulePath: string,
  replacement: string,
  prelude = '',
) {
  const preload = join(setup.root, 'fault-preload.ts');
  writeFileSync(
    preload,
    `import { mock } from 'bun:test';\n${prelude}\nconst actual = await import(${JSON.stringify(`${modulePath}?real-fault`)});\nmock.module(${JSON.stringify(modulePath)}, () => ({ ...actual, ${replacement} }));\n`,
  );
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '..', 'cli.ts'),
      'inspect-performance-levels',
      setup.root,
      setup.revision,
      setup.authorityPath,
      setup.policyPath,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  return {
    exitCode: invocation.exitCode,
    stdout: invocation.stdout.toString(),
    stderr: invocation.stderr.toString(),
  };
}

test('[TEST-AXES-087] complete real facts and publication classify Performance with separate raw and semantic declaration identities', async () => {
  const setup = fixture();
  const invocation = await inspect(setup);
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stderr).toBe('');
  const observation = JSON.parse(invocation.stdout) as ReturnType<typeof inspectPerformanceLevels>;
  expect(observation.bindings).toEqual([{ fixture: fixturePath, level: 'performance' }]);
  expect(observation.isolation).toEqual({ kind: 'isolated', level: 'performance' });
  expect(observation.factsObservationDigest).toBe(
    inspectLevelFacts(setup.root, setup.revision, setup.authorityPath).observationDigest,
  );
  const publication = inspectPerformanceBundle(setup.root, setup.revision, setup.policyPath);
  expect(observation.publicationObservationDigest).toBe(publication.observationDigest);
  expect(publication.declarationDigest).not.toBe(setup.factsAuthority.scope.declaration.digest);
  expect(observation.authentication).toEqual({ kind: 'absent' });
  expect(observation.certifies).toBe(false);
  expect(observation).not.toHaveProperty('coverage');
  const { observationDigest, ...payload } = observation;
  expect(observationDigest).toBe(hashCanonical(payload));
});

test('[TEST-AXES-089] higher membership yields typed nonzero isolation with first-match precedence', async () => {
  for (const [membership, level] of [
    ['architecture', 'architecture'],
    ['conformance', 'conformance'],
    ['both', 'conformance'],
  ] as const) {
    const setup = fixture(membership);
    const invocation = await inspect(setup);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stderr).toBe('');
    const observation = JSON.parse(invocation.stdout) as ReturnType<
      typeof inspectPerformanceLevels
    >;
    expect(observation.bindings).toEqual([{ fixture: fixturePath, level }]);
    expect(observation.isolation).toEqual({
      kind: 'wrong-level',
      level: 'performance',
      files: [{ fixture: fixturePath, actual: level }],
    });
    expect(observation.authentication).toEqual({ kind: 'absent' });
    expect(observation.certifies).toBe(false);
    const { observationDigest, ...payload } = observation;
    expect(observationDigest).toBe(hashCanonical(payload));
  }
});

for (const [replacement, message] of [
  ["revision: 'fault'", 'revision'],
  ["candidate: 'fault'", 'candidate'],
  ["selection: { ...publication.selection, declarationPath: 'foreign.json' }", 'declaration path'],
  ["declarationDigest: 'fault'", 'declaration digest'],
  ["selection: { ...publication.selection, config: 'foreign.config.ts' }", 'config path'],
  ["configDigest: 'fault'", 'config digest'],
  ["selection: { ...publication.selection, configDigest: 'fault' }", 'config digest'],
  ["selection: { ...publication.selection, project: 'webkit' }", 'project'],
  ['sources: []', 'source tuples'],
  [
    "sources: publication.sources.map((source) => ({ ...source, mode: '100755' }))",
    'source tuples',
  ],
  [
    "sources: publication.sources.map((source) => ({ ...source, digest: 'fault' }))",
    'source tuples',
  ],
  ['sources: [...publication.sources, ...publication.sources]', 'source tuples'],
  ['observedCases: []', 'collection'],
  ['observedCases: [...publication.observedCases, ...publication.observedCases]', 'collection'],
  [
    "observedCases: publication.observedCases.map((performanceCase) => ({ ...performanceCase, fixture: 'foreign.test.ts' }))",
    'collection',
  ],
  [
    "observedCases: publication.observedCases.map((performanceCase) => ({ ...performanceCase, caseId: 'foreign' }))",
    'collection',
  ],
] as const) {
  test(`[TEST-AXES-088] broken real publication inspector ${replacement} refuses ${message} join`, () => {
    const setup = fixture();
    const invocation = inspectFault(
      setup,
      join(import.meta.dir, 'performance-bundle.ts'),
      `inspectPerformanceBundle: (...args) => { const publication = actual.inspectPerformanceBundle(...args); return { ...publication, ${replacement} }; },`,
    );
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(`Performance levels ${message}`);
  });
}

test('[TEST-AXES-090] bounded dispatch and inherited facts/publication refusals emit no observation', async () => {
  const setup = fixture();
  const extra = await invokeCli([
    'inspect-performance-levels',
    setup.root,
    setup.revision,
    setup.authorityPath,
    setup.policyPath,
    'extra',
  ]);
  expect(extra.exitCode).toBe(1);
  expect(extra.stdout).toBe('');
  expect(extra.stderr).toContain('usage: twilight-burokrat inspect-performance-levels');
  const symbolic = await inspect(setup, 'HEAD');
  expect(symbolic.exitCode).toBe(1);
  expect(symbolic.stdout).toBe('');
  expect(symbolic.stderr).toContain('full committed SHA');
  const annotated = git(setup.root, ['tag', '-a', 'selected-tag', '-m', 'tag', setup.revision]);
  expect(annotated).toBe('');
  const tag = await inspect(setup, git(setup.root, ['rev-parse', 'selected-tag^{tag}']));
  expect(tag.exitCode).toBe(1);
  expect(tag.stdout).toBe('');
  expect(tag.stderr).toContain('selected revision differs');
  rmSync(join(setup.root, pointerPath));
  const missing = await inspect(setup);
  expect(missing.exitCode).toBe(1);
  expect(missing.stdout).toBe('');
  expect(missing.stderr).toContain('current');
  setup.factsAuthority.candidate = '0'.repeat(64);
  writeFileSync(setup.authorityPath, JSON.stringify(setup.factsAuthority));
  const changed = await inspect(setup);
  expect(changed.exitCode).toBe(1);
  expect(changed.stdout).toBe('');
  expect(changed.stderr).toContain('authority candidate differs');
});

test('[TEST-AXES-087] multiple complete fixtures have canonical bindings independent of declaration order', async () => {
  const setup = fixture('none', true);
  const invocation = await inspect(setup);
  expect(invocation.exitCode).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<typeof inspectPerformanceLevels>;
  expect(observation.bindings).toEqual([
    { fixture: fixturePath, level: 'performance' },
    {
      fixture: `${projectRoot}/src/architecture/mod-index.architecture.test.ts`,
      level: 'performance',
    },
  ]);
});

for (const [replacement, message] of [
  ["revision: 'fault'", 'revision'],
  ['memberships: { ...facts.memberships, performance: [] }', 'collection'],
  ['scope: { ...facts.scope, fixtures: [] }', 'collection'],
  [
    'sources: facts.sources.filter((source) => source.path !== facts.scope.fixtures[0])',
    'source tuples',
  ],
  [
    "scope: { ...facts.scope, declaration: { ...facts.scope.declaration, digest: '0'.repeat(64) } }",
    'declaration byte digest',
  ],
] as const) {
  test(`[TEST-AXES-088] broken real facts inspector ${replacement} refuses ${message} join`, () => {
    const setup = fixture();
    const invocation = inspectFault(
      setup,
      join(import.meta.dir, 'level-facts.ts'),
      `inspectLevelFacts: (...args) => { const facts = actual.inspectLevelFacts(...args); return { ...facts, ${replacement} }; },`,
    );
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(`Performance levels ${message}`);
  });
}

test('[TEST-AXES-088] selected declaration snapshot and entry faults refuse by name', () => {
  for (const [mutation, message] of [
    ["return { ...selected, selection: { kind: 'staged' } };", 'declaration selection'],
    [
      "return { ...selected, selection: { kind: 'committed', revision: '0'.repeat(40) } };",
      'declaration selection',
    ],
    ["return { ...selected, untracked: ['fault'] };", 'declaration selection'],
    ['selected.entries.find = () => undefined; return selected;', 'declaration source'],
    [
      "const entry = selected.entries.find((entry) => entry.path.endsWith('playwright.performance.cases.json')); selected.entries.find = () => ({ ...entry, mode: '120000' }); return selected;",
      'declaration source',
    ],
  ] as const) {
    const setup = fixture();
    const invocation = inspectFault(
      setup,
      join(import.meta.dir, '../inventory/read-candidate.ts'),
      `readCandidate: (() => { let reads = 0; return (...args) => { const selected = actual.readCandidate(...args); if (++reads === 3) { ${mutation} } return selected; }; })(),`,
    );
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(`Performance levels ${message}`);
  }
}, 20_000);

test('[TEST-AXES-088] broken classifier cannot leave a complete fixture unresolved', () => {
  const setup = fixture();
  const invocation = inspectFault(
    setup,
    join(import.meta.dir, '../../../../../../libs/shared/domain/test-levels/src/index.ts'),
    'classifyDeclaredTest: () => undefined,',
  );
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('fixture has no declared level');
});

test('[TEST-AXES-087] both upstream digest identities change the complete own observation digest', async () => {
  const setup = fixture();
  const baseline = JSON.parse((await inspect(setup)).stdout) as ReturnType<
    typeof inspectPerformanceLevels
  >;
  for (const [module, method, field] of [
    ['level-facts.ts', 'inspectLevelFacts', 'factsObservationDigest'],
    ['performance-bundle.ts', 'inspectPerformanceBundle', 'publicationObservationDigest'],
  ] as const) {
    const invocation = inspectFault(
      setup,
      join(import.meta.dir, module),
      `${method}: (...args) => ({ ...actual.${method}(...args), observationDigest: 'fault' }),`,
    );
    expect(invocation.exitCode).toBe(0);
    const observation = JSON.parse(invocation.stdout) as ReturnType<
      typeof inspectPerformanceLevels
    >;
    expect(observation[field]).toBe('fault');
    expect(observation.observationDigest).not.toBe(baseline.observationDigest);
    const { observationDigest, ...payload } = observation;
    expect(observationDigest).toBe(hashCanonical(payload));
  }
});

test('[TEST-AXES-090] packaged dispatch observes isolation success and wrong-level failure', async () => {
  const packageRoot = mkdtempSync(join(tmpdir(), 'performance-levels-package-'));
  scratch.push(packageRoot);
  await buildPackage(packageRoot);
  for (const membership of ['none', 'both'] as const) {
    const setup = fixture(membership);
    const invocation = Bun.spawnSync(
      [
        process.execPath,
        join(packageRoot, 'dist/bin.mjs'),
        'inspect-performance-levels',
        setup.root,
        setup.revision,
        setup.authorityPath,
        setup.policyPath,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(invocation.exitCode).toBe(membership === 'none' ? 0 : 1);
    expect(invocation.stderr.toString()).toBe(
      membership === 'none' ? '' : 'Twilight Burokrat validator exited 1\n',
    );
    const observation = JSON.parse(invocation.stdout.toString()) as ReturnType<
      typeof inspectPerformanceLevels
    >;
    expect(observation.isolation.kind).toBe(membership === 'none' ? 'isolated' : 'wrong-level');
    expect(observation.certifies).toBe(false);
    expect(observation.authentication).toEqual({ kind: 'absent' });
  }
}, 120_000);

test('[TEST-AXES-088] coherently changed inspector config and project must still match the selected declaration', () => {
  for (const [scope, selection, message] of [
    [
      "config: { ...facts.scope.config, path: 'foreign.config.ts' }",
      "config: 'foreign.config.ts'",
      'config path',
    ],
    ["project: 'webkit'", "project: 'webkit'", 'project'],
  ] as const) {
    const setup = fixture();
    const publicationPath = join(import.meta.dir, 'performance-bundle.ts');
    const prelude = `const publicationActual = await import(${JSON.stringify(`${publicationPath}?coherent-fault`)}); mock.module(${JSON.stringify(publicationPath)}, () => ({ ...publicationActual, inspectPerformanceBundle: (...args) => { const publication = publicationActual.inspectPerformanceBundle(...args); return { ...publication, selection: { ...publication.selection, ${selection} } }; } }));`;
    const invocation = inspectFault(
      setup,
      join(import.meta.dir, 'level-facts.ts'),
      `inspectLevelFacts: (...args) => { const facts = actual.inspectLevelFacts(...args); return { ...facts, scope: { ...facts.scope, ${scope} } }; },`,
      prelude,
    );
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(`Performance levels ${message}`);
  }
});

test('[TEST-AXES-087] case and source enumeration order cannot change canonical level bindings', () => {
  const setup = fixture('none', true);
  const invocation = inspectFault(
    setup,
    join(import.meta.dir, 'performance-bundle.ts'),
    'inspectPerformanceBundle: (...args) => { const publication = actual.inspectPerformanceBundle(...args); return { ...publication, observedCases: [...publication.observedCases].reverse(), sources: [...publication.sources].reverse() }; },',
  );
  expect(invocation.exitCode).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<typeof inspectPerformanceLevels>;
  expect(observation.bindings.map((binding) => binding.fixture)).toEqual([
    fixturePath,
    `${projectRoot}/src/architecture/mod-index.architecture.test.ts`,
  ]);
});

test('[TEST-AXES-087] distinct recorded cases sharing one fixture yield one classified binding', async () => {
  const setup = fixture('none', true, true);
  const invocation = await inspect(setup);
  expect(invocation.exitCode).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<typeof inspectPerformanceLevels>;
  expect(observation.bindings).toEqual([{ fixture: fixturePath, level: 'performance' }]);
});

test('[TEST-AXES-088] shared earlier Performance row requires recorded Playwright membership', () => {
  const setup = fixture();
  const invocation = inspectFault(
    setup,
    join(import.meta.dir, '../../../../../../libs/shared/domain/test-levels/src/index.ts'),
    'classifyDeclaredTest: (path, facts) => actual.classifyDeclaredTest(path, { ...facts, browserFiles: new Set() }),',
  );
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain(
    'claims Performance but is not in a declared Playwright suite',
  );
});

test('[TEST-AXES-088] broken selected reader cannot replace declaration decoding with malformed bytes', () => {
  const invalidText = JSON.stringify({
    ...baseDeclaration,
    cases: [{ ...baseDeclaration.cases[0], titlePath: ['renders X'] }],
  });
  const invalidUtf8 = new TextEncoder().encode(invalidText);
  invalidUtf8[invalidText.indexOf('X')] = 0xff;
  for (const [bytes, message] of [
    [invalidUtf8, 'encoded data was not valid'],
    [new TextEncoder().encode('['), 'JSON Parse error'],
    [
      new TextEncoder().encode(JSON.stringify({ ...baseDeclaration, schemaVersion: 2 })),
      'schemaVersion',
    ],
  ] as const) {
    const setup = fixture();
    const readerPath = join(import.meta.dir, '../inventory/read-blob.ts');
    const prelude = `const reader = await import(${JSON.stringify(`${readerPath}?malformed-fault`)}); const injected = Uint8Array.from(${JSON.stringify([...bytes])}); let reads = 0; mock.module(${JSON.stringify(readerPath)}, () => ({ ...reader, readSelectedBlob: (...args) => args[3] === ${JSON.stringify(declarationPath)} && ++reads === 3 ? injected : reader.readSelectedBlob(...args) }));`;
    const invocation = inspectFault(
      setup,
      join(import.meta.dir, 'level-facts.ts'),
      `inspectLevelFacts: (...args) => { const facts = actual.inspectLevelFacts(...args); return { ...facts, scope: { ...facts.scope, declaration: { ...facts.scope.declaration, digest: ${JSON.stringify(digestEvidenceBytes(bytes))} } } }; },`,
      prelude,
    );
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(message);
  }
}, 20_000);
