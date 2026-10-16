import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { digestEvidenceBytes } from '@shared/test-evidence';
import { afterEach, expect, test } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { invokeCli } from '../invoke-cli';
import { buildPackage } from '../packaging/build';
import { registeredRules } from '../rules/registry';
import type { inspectBrowserLevels } from './browser-levels';
import { hashBytes, hashCanonical } from './content-manifest';
import type { inspectTestSources } from './test-sources';

const scratch: string[] = [];
const mode = 'ordinary';
const invocationId = '11111111-1111-4111-8111-111111111111';
const owner = '22222222-2222-4222-8222-222222222222';
const config = 'playwright.config.ts';
const projectRoot = 'apps/example';
const manifestPath = `${projectRoot}/project.json`;
const file = `${projectRoot}/src/architecture/f7.architecture.test.ts`;
const other = `${projectRoot}/src/z.test.ts`;
const declarationPath = `${projectRoot}/performance-cases.json`;
const performanceConfig = `${projectRoot}/performance.config.ts`;
const declaration = {
  schemaVersion: 1,
  config: performanceConfig,
  project: 'performance-chromium',
  cases: [
    {
      caseId: 'first',
      fixture: file,
      titlePath: ['first'],
      measurement: 'cells',
      unit: 'count',
      operator: 'lte',
      threshold: 100,
    },
    {
      caseId: 'second',
      fixture: other,
      titlePath: ['second'],
      measurement: 'cells',
      unit: 'count',
      operator: 'lte',
      threshold: 100,
    },
    {
      caseId: 'shared',
      fixture: file,
      titlePath: ['shared'],
      measurement: 'cells',
      unit: 'count',
      operator: 'lte',
      threshold: 100,
    },
  ],
};
const title = 'example runs';

function git(root: string, args: string[]): string {
  const call = Bun.spawnSync(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (call.exitCode !== 0) throw new Error(call.stderr.toString());
  return call.stdout.toString().trim();
}

function fixture(source: 'regular' | 'missing' | 'symlink' = 'regular'): {
  root: string;
  policyPath: string;
  revision: string;
  bundle: string;
  manifest: Record<string, unknown>;
} {
  const base = mkdtempSync(join(tmpdir(), 'burokrat-browser-'));
  scratch.push(base);
  const root = join(base, 'candidate');
  mkdirSync(root);
  git(root, ['init']);
  git(root, ['config', 'user.name', 'Browser Fixture']);
  git(root, ['config', 'user.email', 'browser@example.invalid']);
  mkdirSync(join(root, projectRoot, 'src/architecture'), { recursive: true });
  writeFileSync(join(root, declarationPath), JSON.stringify(declaration));
  writeFileSync(join(root, manifestPath), JSON.stringify({ targets: {} }));
  writeFileSync(join(root, other), 'throw new Error("candidate executed");');
  writeFileSync(join(root, config), 'export default {}\n');
  writeFileSync(join(root, performanceConfig), 'throw new Error("config executed");');
  if (source === 'regular') writeFileSync(join(root, file), 'test("example runs", () => {});\n');
  if (source === 'symlink') symlinkSync(config, join(root, file));
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
  writeFileSync(
    policyPath,
    JSON.stringify({
      schemaVersion: 1,
      policyId: 'browser-fixture',
      ruleModes: registeredRules().map((rule) => ({ ruleId: rule.id, mode: 'observe' })),
      browser: {
        modes: [
          {
            mode,
            config,
            configDigest: digestEvidenceBytes('export default {}\n'),
            projects: ['chromium'],
          },
        ],
      },
    }),
  );
  const browserRoot = join(root, 'tmp/junit/browser');
  const bundle = join(browserRoot, invocationId);
  mkdirSync(bundle, { recursive: true });
  const pointer = {
    schemaVersion: 2,
    invocationId,
    mode,
    bundle: `tmp/junit/browser/${invocationId}`,
    owner,
  };
  writeFileSync(join(browserRoot, `${mode}.current.json`), JSON.stringify(pointer));
  writeFileSync(join(browserRoot, `${mode}.owner`), owner);
  writeFileSync(join(browserRoot, `${mode}.latest-request`), owner);
  const raw = (phase: 'list' | 'run') => ({
    config: {
      configFile: join(root, config),
      version: '1.63.0',
      rootDir: root,
      projects: [{ name: 'chromium' }],
    },
    errors: [],
    suites: [
      {
        file,
        title: file,
        specs: [
          {
            file,
            title,
            tests: [
              {
                projectName: 'chromium',
                status: phase === 'list' ? 'skipped' : 'expected',
                results: phase === 'list' ? [] : [{ status: 'passed' }],
              },
            ],
          },
        ],
      },
    ],
  });
  const discovery = Buffer.from(JSON.stringify(raw('list')));
  const execution = Buffer.from(JSON.stringify(raw('run')));
  const playwright = Buffer.from(
    `<testsuites tests="1" failures="0" errors="0" skipped="0"><testsuite name="${basename(file)}" hostname="chromium"><testcase name="${title}" classname="${basename(file)}"/></testsuite></testsuites>`,
  );
  const report = Buffer.from(
    `<testsuite name="browser.ordinary" tests="1" failures="0" errors="0" skipped="0"><testcase classname="chromium" name="${title}" file="${file}"/></testsuite>`,
  );
  for (const [name, bytes] of [
    ['discovery.json', discovery],
    ['execution.json', execution],
    ['playwright.xml', playwright],
    ['report.xml', report],
  ] as const)
    writeFileSync(join(bundle, name), bytes);
  const relative = `tmp/junit/browser/${invocationId}`;
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    certifies: false,
    invocationId,
    mode,
    revision,
    candidate,
    config,
    configDigest: digestEvidenceBytes('export default {}\n'),
    runnerVersion: '1.63.0',
    environment: { CI: '1', E2E_PORT_SHIFT: '0' },
    cases: [{ config, project: 'chromium', file, titlePath: [title], status: 'passed' }],
    coverage: { passingCases: 1, skippedDebt: 0 },
    raw: {
      discovery: { path: `${relative}/discovery.json`, digest: digestEvidenceBytes(discovery) },
      execution: { path: `${relative}/execution.json`, digest: digestEvidenceBytes(execution) },
      junit: { path: `${relative}/playwright.xml`, digest: digestEvidenceBytes(playwright) },
    },
    report: `${relative}/report.xml`,
    reportDigest: digestEvidenceBytes(report),
  };
  writeFileSync(join(bundle, 'manifest.json'), JSON.stringify(manifest));
  return { root, policyPath, revision, bundle, manifest };
}

afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

async function inspect(setup: ReturnType<typeof fixture>): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const call = await invokeCli([
    'inspect-test-reports',
    setup.root,
    setup.revision,
    setup.policyPath,
    mode,
  ]);
  return {
    exitCode: call.exitCode,
    stdout: call.stdout,
    stderr: call.stderr,
  };
}

function publishCases(
  setup: ReturnType<typeof fixture>,
  observations: readonly { title: string; status: 'passed' | 'failed' | 'skipped' }[],
  caseFile = file,
): void {
  const raw = (phase: 'list' | 'run') => ({
    config: {
      configFile: join(setup.root, config),
      version: '1.63.0',
      rootDir: setup.root,
      projects: [{ name: 'chromium' }],
    },
    errors: [],
    suites: [
      {
        file: caseFile,
        title: caseFile,
        specs: observations.map((observation) => ({
          file: caseFile,
          title: observation.title,
          tests: [
            {
              projectName: 'chromium',
              status: phase === 'list' || observation.status === 'skipped' ? 'skipped' : 'expected',
              results:
                phase === 'list' || observation.status === 'skipped'
                  ? []
                  : [{ status: observation.status }],
            },
          ],
        })),
      },
    ],
  });
  const failureCount = observations.filter((observation) => observation.status === 'failed').length;
  const skippedCount = observations.filter(
    (observation) => observation.status === 'skipped',
  ).length;
  const outcomeXml = (status: 'passed' | 'failed' | 'skipped') =>
    status === 'passed' ? '' : status === 'failed' ? '<failure/>' : '<skipped/>';
  const discovery = JSON.stringify(raw('list'));
  const execution = JSON.stringify(raw('run'));
  const total = String(observations.length);
  const failures = String(failureCount);
  const skipped = String(skippedCount);
  const playwright = `<testsuites tests="${total}" failures="${failures}" errors="0" skipped="${skipped}"><testsuite name="${basename(caseFile)}" hostname="chromium">${observations.map((observation) => `<testcase name="${observation.title}" classname="${basename(caseFile)}">${outcomeXml(observation.status)}</testcase>`).join('')}</testsuite></testsuites>`;
  const report = `<testsuite name="browser.ordinary" tests="${total}" failures="${failures}" errors="0" skipped="${skipped}">${observations.map((observation) => `<testcase classname="chromium" name="${observation.title}" file="${caseFile}">${outcomeXml(observation.status)}</testcase>`).join('')}</testsuite>`;
  for (const [name, source] of [
    ['discovery.json', discovery],
    ['execution.json', execution],
    ['playwright.xml', playwright],
    ['report.xml', report],
  ] as const)
    writeFileSync(join(setup.bundle, name), source);
  const bindings = setup.manifest['raw'] as {
    discovery: { digest: string };
    execution: { digest: string };
    junit: { digest: string };
  };
  bindings.discovery.digest = digestEvidenceBytes(discovery);
  bindings.execution.digest = digestEvidenceBytes(execution);
  bindings.junit.digest = digestEvidenceBytes(playwright);
  setup.manifest['reportDigest'] = digestEvidenceBytes(report);
  setup.manifest['cases'] = observations.map((observation) => ({
    config,
    project: 'chromium',
    file: caseFile,
    titlePath: [observation.title],
    status: observation.status,
  }));
  setup.manifest['coverage'] = {
    passingCases: observations.filter((observation) => observation.status === 'passed').length,
    skippedDebt: skippedCount,
  };
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
}

async function observation(setup: ReturnType<typeof fixture>): Promise<Record<string, unknown>> {
  const call = await inspect(setup);
  expect(call.exitCode, call.stderr).toBe(0);
  return JSON.parse(call.stdout) as Record<string, unknown>;
}

async function prepare(
  memberships = { conformance: false, architecture: false, performance: false },
  performanceEmpty = false,
) {
  const setup = fixture();
  const targets = memberships.conformance
    ? {
        'test:conformance': {
          executor: 'nx:run-commands',
          options: {
            command: 'bun test ./src/architecture/f7.architecture.test.ts --timeout=1000',
            cwd: projectRoot,
            forwardAllArgs: false,
          },
        },
      }
    : {};
  writeFileSync(join(setup.root, manifestPath), JSON.stringify({ targets }));
  writeFileSync(
    join(setup.root, declarationPath),
    JSON.stringify({
      ...declaration,
      cases: [{ ...declaration.cases[0], fixture: memberships.performance ? file : other }],
    }),
  );
  const architecturePath = `${projectRoot}/src/architecture-fixtures.json`;
  if (memberships.architecture)
    writeFileSync(
      join(setup.root, architecturePath),
      JSON.stringify({
        schemaVersion: 1,
        fixtures: [{ ruleId: 'F7', file: 'src/architecture/f7.architecture.test.ts' }],
      }),
    );
  if (performanceEmpty) rmSync(join(setup.root, declarationPath));
  const index = {
    schemaVersion: 1,
    moduleId: 'module.example',
    memberships: [
      'project.json',
      'performance.config.ts',
      ...(performanceEmpty ? [] : ['performance-cases.json']),
      'src/architecture/f7.architecture.test.ts',
      'src/z.test.ts',
      ...(memberships.architecture ? ['src/architecture-fixtures.json'] : []),
    ].map((path) => ({ kind: 'path', path })),
    relationshipSelectors: [],
    applicableChecks: [],
    inapplicableSections: [
      { section: 'relationships', reason: 'No relationships in fixture.' },
      { section: 'invariants', reason: 'No cross-file invariant.' },
      { section: 'checks', reason: 'Index checker validates fixture.' },
    ],
    externalConsumers: { kind: 'none-known', knowledgeLimit: 'Fixture only.' },
  };
  writeFileSync(
    join(setup.root, projectRoot, 'README.md'),
    `# Example\n\n<!-- module-index ${JSON.stringify(index)} -->\n\n- [Case](src/architecture/f7.architecture.test.ts)\n- [Other](src/z.test.ts)\n- [Manifest](project.json)\n- [Config](performance.config.ts)\n${performanceEmpty ? '' : '- [Declaration](performance-cases.json)\n'}${memberships.architecture ? '- [Architecture](src/architecture-fixtures.json)\n' : ''}`,
  );
  // Empty Architecture forbids suffix discovery only when the policy is committed.
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'memberships']);
  setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
  const selected = readCandidate(setup.root, { kind: 'committed', revision: setup.revision });
  setup.manifest['revision'] = setup.revision;
  setup.manifest['candidate'] = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  const report = await observation(setup);
  const identity = {
    revision: setup.revision,
    candidate: report['candidate'],
    mode,
    reportObservationDigest: report['observationDigest'],
  };
  const pin = (path: string) => ({ path, digest: hashBytes(readFileSync(join(setup.root, path))) });
  const scope = { ...identity, projectRoot, projectManifest: pin(manifestPath) };
  const authorities = {
    review: {
      schemaVersion: 1,
      ...identity,
      memberships: [
        { level: 'manual', kind: 'reviewed-empty' },
        { level: 'conformance', kind: 'unknown' },
        { level: 'architecture', kind: 'unknown' },
        { level: 'performance', kind: 'unknown' },
      ],
    },
    conformance: {
      schemaVersion: 2,
      ...scope,
      conformance: { kind: memberships.conformance ? 'committed' : 'reviewed-empty' },
    },
    architecture: {
      schemaVersion: 1,
      ...scope,
      architecture: memberships.architecture
        ? { kind: 'committed', ...pin(architecturePath) }
        : { kind: 'reviewed-empty' },
    },
    performance: performanceEmpty
      ? {
          schemaVersion: 2,
          ...scope,
          performance: { kind: 'reviewed-empty' },
        }
      : {
          schemaVersion: 1,
          ...scope,
          declaration: pin(declarationPath),
          config: pin(performanceConfig),
          project: declaration.project,
        },
  };
  const paths = {
    review: join(setup.policyPath, '..', 'review.json'),
    conformance: join(setup.policyPath, '..', 'conformance.json'),
    architecture: join(setup.policyPath, '..', 'architecture.json'),
    performance: join(setup.policyPath, '..', 'performance.json'),
  };
  for (const name of ['review', 'conformance', 'architecture', 'performance'] as const)
    writeFileSync(paths[name], JSON.stringify(authorities[name]));
  return { ...setup, report, authorities, paths };
}
type Setup = Awaited<ReturnType<typeof prepare>>;
function operands(setup: Setup) {
  return [
    setup.root,
    setup.revision,
    setup.policyPath,
    mode,
    setup.paths.review,
    setup.paths.conformance,
    setup.paths.architecture,
    setup.paths.performance,
  ];
}
const inspectLevels = (setup: Setup) =>
  invokeCli(['inspect-browser-source-levels', ...operands(setup)]);
async function facts(setup: Setup, exitCode = 0) {
  const call = await inspectLevels(setup);
  expect(call.exitCode, call.stderr).toBe(exitCode);
  return JSON.parse(call.stdout) as Record<string, unknown>;
}
async function refuse(setup: Setup, diagnostic: string) {
  const call = await inspectLevels(setup);
  expect(call.exitCode, call.stdout).toBe(1);
  expect(call.stdout).toBe('');
  expect(call.stderr).toContain(diagnostic);
}

test('[TEST-AXES-144] joins real case ownership to full levels without promotion', async () => {
  const setup = await prepare();
  const observed = await facts(setup);
  const sourceCall = await invokeCli(['inspect-test-sources', ...operands(setup).slice(0, 4)]);
  const levelCall = await invokeCli(['inspect-browser-levels', ...operands(setup)]);
  expect(sourceCall.exitCode, sourceCall.stderr).toBe(0);
  expect(levelCall.exitCode, levelCall.stderr).toBe(0);
  const sources = JSON.parse(sourceCall.stdout) as ReturnType<typeof inspectTestSources>;
  const levels = JSON.parse(levelCall.stdout) as ReturnType<typeof inspectBrowserLevels>;
  expect(observed['schemaVersion']).toBe(1);
  expect(observed['kind']).toBe('browser-source-levels');
  expect(observed['revision']).toBe(setup.revision);
  expect(observed['candidate']).toBe(setup.report['candidate']);
  expect(observed['mode']).toBe(mode);
  expect(observed['sources']).toEqual(sources);
  expect(observed['levels']).toEqual(levels);
  expect(observed['sourceObservationDigest']).toBe(sources.observationDigest);
  expect(observed['levelObservationDigest']).toBe(levels.observationDigest);
  expect(observed['indexIdentity']).toBe(sources.indexIdentity);
  expect(observed['indexReviewDebt']).toEqual(sources.indexReviewDebt);
  expect(observed['bindings']).toEqual(
    sources.bindings.map((binding: Record<string, unknown>) => ({ ...binding, level: 'browser' })),
  );
  expect(observed['isolation']).toEqual({ kind: 'isolated', level: 'browser' });
  expect(observed['authentication']).toEqual({ kind: 'absent' });
  expect(observed['certifies']).toBe(false);
  for (const credit of ['coverage', 'admission', 'T2', 'testedModule'])
    expect(Object.hasOwn(observed, credit)).toBe(false);
  const { observationDigest, ...payload } = observed;
  expect(observationDigest).toBe(hashCanonical(payload));
});

function fault(
  setup: Setup,
  module: string,
  symbol: string,
  alteration: string,
  diagnostic?: string,
) {
  const preload = join(setup.policyPath, '..', 'fault.ts');
  const modulePath = join(import.meta.dir, module);
  writeFileSync(
    preload,
    `import {mock} from 'bun:test';
import {writeFileSync} from 'node:fs';
import {hashCanonical} from ${JSON.stringify(join(import.meta.dir, 'content-manifest.ts'))};
const actual=await import(${JSON.stringify(`${modulePath}?actual`)});
let reads=0;
function seal(entry){const {observationDigest,...payload}=entry;entry.observationDigest=hashCanonical(payload);}
mock.module(${JSON.stringify(modulePath)},()=>({...actual,${symbol}:(...args)=>{
const observation=actual.${symbol}(...args);++reads;${alteration};seal(observation);return observation;
}}));`,
  );
  const call = Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '..', 'cli.ts'),
      'inspect-browser-source-levels',
      ...operands(setup),
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  if (diagnostic !== undefined) {
    expect(call.exitCode, call.stdout.toString()).toBe(1);
    expect(call.stdout.toString()).toBe('');
    expect(call.stderr.toString()).toContain(diagnostic);
  }
  return {
    exitCode: call.exitCode,
    stdout: call.stdout.toString(),
    stderr: call.stderr.toString(),
  };
}

test('[TEST-AXES-145] snapshot digest mode report and markers must agree', async () => {
  const setup = await prepare();
  for (const [module, symbol] of [
    ['test-sources.ts', 'inspectTestSources'],
    ['browser-levels.ts', 'inspectBrowserLevels'],
  ] as const) {
    for (const alteration of [
      "observation.revision='0'.repeat(40)",
      "observation.candidate='0'.repeat(64)",
    ])
      fault(setup, module, symbol, alteration, 'upstream snapshot differs');
    for (const alteration of [
      "observation.authentication={kind:'authenticated'}",
      'observation.certifies=true',
    ])
      fault(setup, module, symbol, alteration, 'upstream diagnostic markers differ');
    fault(
      setup,
      module,
      symbol,
      "return {...observation,observationDigest:'0'.repeat(64)}",
      'upstream digest is invalid',
    );
  }
  for (const alteration of [
    "observation.review.report.revision='0'.repeat(40)",
    "observation.review.report.candidate='0'.repeat(64)",
  ])
    fault(
      setup,
      'browser-levels.ts',
      'inspectBrowserLevels',
      `${alteration};seal(observation.review.report)`,
      'upstream snapshot differs',
    );
  for (const alteration of [
    "observation.review.report.authentication={kind:'authenticated'}",
    'observation.review.report.certifies=true',
  ])
    fault(
      setup,
      'browser-levels.ts',
      'inspectBrowserLevels',
      `${alteration};seal(observation.review.report)`,
      'upstream diagnostic markers differ',
    );
  fault(
    setup,
    'browser-levels.ts',
    'inspectBrowserLevels',
    "observation.mode='portable'",
    'upstream mode differs',
  );
  fault(
    setup,
    'browser-levels.ts',
    'inspectBrowserLevels',
    "observation.review.report.mode='portable';seal(observation.review.report)",
    'upstream mode differs',
  );
  fault(
    setup,
    'browser-levels.ts',
    'inspectBrowserLevels',
    "observation.review.report.observationDigest='0'.repeat(64)",
    'upstream digest is invalid',
  );
  fault(
    setup,
    'test-sources.ts',
    'inspectTestSources',
    "observation.reportObservationDigest='0'.repeat(64)",
    'report differs between',
  );
});

test('[TEST-AXES-145] case-ID bijection rejects missing extra duplicate substituted and mismatched tuples', async () => {
  const setup = await prepare();
  for (const [alteration, diagnostic] of [
    ['observation.bindings=[]', 'source cases omit'],
    ['observation.bindings.push({...observation.bindings[0]})', 'source case identities differ'],
    [
      "observation.bindings.push({...observation.bindings[0],caseId:'foreign'})",
      'source case identities differ',
    ],
    ["observation.bindings[0].caseId='foreign'", 'source case identities differ'],
    ["observation.bindings[0].file='foreign.ts'", 'case file outcome or source differs'],
    ["observation.bindings[0].status='failed'", 'case file outcome or source differs'],
    ["observation.bindings[0].source.mode='100755'", 'case file outcome or source differs'],
    [
      "observation.bindings[0].source.contentDigest='0'.repeat(64)",
      'case file outcome or source differs',
    ],
  ] as const)
    fault(setup, 'test-sources.ts', 'inspectTestSources', alteration, diagnostic);
  for (const [alteration, diagnostic] of [
    [
      'observation.review.report.cases.push({...observation.review.report.cases[0]});seal(observation.review.report)',
      'report case identities are not unique and nonempty',
    ],
    ['observation.collection=[]', 'collection differs'],
    ['observation.collection.push(...observation.collection)', 'collection differs'],
    ['observation.bindings=[]', 'classification membership differs'],
    [
      'observation.bindings.push({...observation.bindings[0]})',
      'classification membership differs',
    ],
    ["observation.bindings[0].fixture='foreign.ts'", 'case classification is absent'],
    ["observation.bindings[0].level='performance'", 'isolation differs'],
    ["observation.isolation={kind:'wrong-level',level:'browser',files:[]}", 'isolation differs'],
    [
      'observation.review.report.cases=[];seal(observation.review.report)',
      'report case identities are not unique and nonempty',
    ],
  ] as const)
    fault(setup, 'browser-levels.ts', 'inspectBrowserLevels', alteration, diagnostic);
});

function repinReport(setup: Setup, report: Record<string, unknown>) {
  for (const name of ['review', 'conformance', 'architecture', 'performance'] as const) {
    setup.authorities[name].reportObservationDigest = report['observationDigest'];
    writeFileSync(setup.paths[name], JSON.stringify(setup.authorities[name]));
  }
}
async function commitCandidate(setup: Setup) {
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'index mutation']);
  setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
  const selected = readCandidate(setup.root, { kind: 'committed', revision: setup.revision });
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  setup.manifest['revision'] = setup.revision;
  setup.manifest['candidate'] = candidate;
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  for (const name of ['review', 'conformance', 'architecture', 'performance'] as const) {
    setup.authorities[name].revision = setup.revision;
    setup.authorities[name].candidate = candidate;
  }
  repinReport(setup, await observation(setup));
}

test('[TEST-AXES-146] real malformed absent and unreadable committed index refuse', async () => {
  const malformed = await prepare();
  writeFileSync(
    join(malformed.root, projectRoot, 'README.md'),
    '# Bad\n<!-- module-index {} -->\n',
  );
  await commitCandidate(malformed);
  await refuse(malformed, 'index metadata malformed');
  const absent = await prepare();
  rmSync(join(absent.root, projectRoot, 'README.md'));
  await commitCandidate(absent);
  await refuse(absent, 'selected candidate contains no module indexes');
  const unreadable = await prepare();
  const blob = git(unreadable.root, ['rev-parse', `HEAD:${projectRoot}/README.md`]);
  rmSync(join(unreadable.root, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  await refuse(unreadable, `cannot read selected index ${projectRoot}/README.md`);
});

test('[TEST-AXES-146] final real publication read refuses physical corruption and resealed drift', async () => {
  const setup = await prepare();
  for (const alteration of [
    "observation.invocationId='changed'",
    "observation.cases[0].status='failed'",
  ])
    fault(
      setup,
      'test-reports.ts',
      'inspectTestReports',
      `if(reads===7){${alteration};seal(observation)}`,
      'publication changed during composition',
    );
  fault(
    setup,
    'test-reports.ts',
    'inspectTestReports',
    "if(reads===7)return {...observation,observationDigest:'0'.repeat(64)}",
    'upstream digest is invalid',
  );
  fault(
    setup,
    'browser-levels.ts',
    'inspectBrowserLevels',
    `writeFileSync(${JSON.stringify(join(setup.bundle, 'report.xml'))},'broken')`,
    'Browser normalized report digest or path differs',
  );
});

test('[TEST-AXES-147] isolated failed and skipped cases stay diagnostic and stable', async () => {
  const setup = await prepare();
  publishCases(setup, [
    { title: 'z skipped', status: 'skipped' },
    { title: 'a failed', status: 'failed' },
    { title: 'm passed', status: 'passed' },
  ]);
  repinReport(setup, await observation(setup));
  const observed = await facts(setup);
  const bindings = observed['bindings'] as { caseId: string; status: string; level: string }[];
  expect(bindings).toHaveLength(3);
  expect(bindings.map((binding) => binding.status).sort()).toEqual(['failed', 'passed', 'skipped']);
  expect(bindings.every((binding) => binding.level === 'browser')).toBe(true);
  expect(bindings.map((binding) => binding.caseId)).toEqual(
    bindings.map((binding) => binding.caseId).sort(),
  );
  publishCases(setup, [
    { title: 'm passed', status: 'passed' },
    { title: 'a failed', status: 'failed' },
    { title: 'z skipped', status: 'skipped' },
  ]);
  const repeated = await facts(setup);
  expect(repeated).toEqual(observed);
  // Full upstreams retain their canonical identities; this command canonicalizes its case bindings.
  const reordered = fault(
    setup,
    'test-sources.ts',
    'inspectTestSources',
    'observation.bindings.reverse()',
  );
  expect(reordered.exitCode, reordered.stderr).toBe(0);
  const altered = JSON.parse(reordered.stdout) as Record<string, unknown>;
  expect(altered['bindings']).toEqual(observed['bindings']);
  expect(altered['observationDigest']).not.toBe(observed['observationDigest']);
  const { observationDigest, ...payload } = altered;
  expect(observationDigest).toBe(hashCanonical(payload));
});

test('[TEST-AXES-147] wrong-level exits one and retains real owners and classifications', async () => {
  for (const [memberships, level] of [
    [{ conformance: true, architecture: true, performance: true }, 'conformance'],
    [{ conformance: false, architecture: true, performance: true }, 'architecture'],
    [{ conformance: false, architecture: false, performance: true }, 'performance'],
  ] as const) {
    const setup = await prepare(memberships);
    const observed = await facts(setup, 1);
    expect(observed['isolation']).toEqual({
      kind: 'wrong-level',
      level: 'browser',
      files: [{ fixture: file, actual: level }],
    });
    const bindings = observed['bindings'] as { level: string; owner: unknown }[];
    expect(bindings[0].level).toBe(level);
    expect(bindings[0].owner).toMatchObject({
      moduleId: 'module.example',
      indexPath: `${projectRoot}/README.md`,
    });
  }
});

test('[TEST-AXES-147] exact selection and operands are required', async () => {
  const setup = await prepare();
  const revision = setup.revision;
  setup.revision = 'HEAD';
  await refuse(setup, 'requires a full committed SHA');
  setup.revision = revision;
  git(setup.root, ['tag', '-a', 'tag', '-m', 'tag']);
  setup.revision = git(setup.root, ['rev-parse', 'tag^{tag}']);
  await refuse(setup, 'selected revision differs from requested SHA');
  setup.revision = revision;
  fault(
    setup,
    '../inventory/read-candidate.ts',
    'readCandidate',
    "return {...observation,selection:{kind:'staged',revision:args[1].revision,base:'0'.repeat(40),indexTree:'0'.repeat(40)}}",
    'selected revision differs from requested SHA',
  );
  for (const args of [
    operands(setup).slice(0, -1),
    [...operands(setup), 'extra'],
    operands(setup).map((arg, index) => (index === 3 ? 'invalid' : arg)),
  ]) {
    const call = await invokeCli(['inspect-browser-source-levels', ...args]);
    expect(call.exitCode).toBe(1);
    expect(call.stdout).toBe('');
    expect(call.stderr).toContain('usage: twilight-burokrat inspect-browser-source-levels');
  }
});

test('[TEST-AXES-144] real index review debt survives complete ownership and level binding', async () => {
  const setup = await prepare();
  const path = join(setup.root, projectRoot, 'README.md');
  let markdown = readFileSync(path, 'utf8');
  const match = /<!-- module-index (.*?) -->/.exec(markdown);
  if (match === null) throw new Error('fixture index metadata missing');
  const metadata = JSON.parse(match[1]) as { memberships: { kind: string; path: string }[] };
  for (let index = 0; index < 40; index++) {
    const name = `debt-${String(index)}.ts`;
    writeFileSync(join(setup.root, projectRoot, name), 'export {};');
    metadata.memberships.push({ kind: 'path', path: name });
    markdown += `- [Debt ${String(index)}](${name})\n`;
  }
  markdown = markdown.replace(match[0], `<!-- module-index ${JSON.stringify(metadata)} -->`);
  writeFileSync(path, markdown);
  await commitCandidate(setup);
  const observed = await facts(setup);
  expect(observed['indexReviewDebt']).toEqual([
    { indexPath: `${projectRoot}/README.md`, directEntries: 45, limit: 40 },
  ]);
  expect((observed['sources'] as { indexReviewDebt: unknown }).indexReviewDebt).toEqual(
    observed['indexReviewDebt'],
  );
});

test('[TEST-AXES-147] built executable matches source isolation wrong-level and usage', async () => {
  const setup = await prepare();
  const packageRoot = mkdtempSync(join(tmpdir(), 'browser-source-levels-package-'));
  scratch.push(packageRoot);
  await buildPackage(packageRoot);
  const executable = join(packageRoot, 'dist/bin.mjs');
  const inspect = (args: string[]) =>
    Bun.spawnSync([process.execPath, executable, 'inspect-browser-source-levels', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  const isolated = inspect(operands(setup));
  expect(isolated.exitCode, isolated.stderr.toString()).toBe(0);
  expect(isolated.stdout.toString()).toBe((await inspectLevels(setup)).stdout);
  const wrong = await prepare({ conformance: true, architecture: true, performance: true });
  const overlap = inspect(operands(wrong));
  expect(overlap.exitCode, overlap.stderr.toString()).toBe(1);
  expect(overlap.stdout.toString()).toBe((await inspectLevels(wrong)).stdout);
  const unsupported = inspect([]);
  expect(unsupported.exitCode).toBe(1);
  expect(unsupported.stdout.toString()).toBe('');
  expect(unsupported.stderr.toString()).toContain(
    'usage: twilight-burokrat inspect-browser-source-levels',
  );
}, 120_000);

test('[TEST-AXES-147] diagnostic certification requires literal false', async () => {
  const setup = await prepare();
  for (const marker of ['null', '0', "''"])
    fault(
      setup,
      'test-sources.ts',
      'inspectTestSources',
      `observation.certifies=${marker}`,
      'upstream diagnostic markers differ',
    );
});
