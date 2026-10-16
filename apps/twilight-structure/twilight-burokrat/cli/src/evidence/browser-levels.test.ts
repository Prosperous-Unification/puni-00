import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { digestEvidenceBytes } from '@shared/test-evidence';
import { afterEach, expect, test } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { invokeCli } from '../invoke-cli';
import { buildPackage } from '../packaging/build';
import { registeredRules } from '../rules/registry';
import { hashBytes, hashCanonical } from './content-manifest';

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
const inspectLevels = (setup: Setup) => invokeCli(['inspect-browser-levels', ...operands(setup)]);
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
async function upstream(setup: Setup) {
  const observations: Record<string, Record<string, unknown>> = {};
  for (const [name, command] of [
    ['review', 'inspect-browser-memberships'],
    ['conformance', 'inspect-browser-conformance'],
    ['architecture', 'inspect-browser-architecture'],
    ['performance', 'inspect-browser-performance'],
  ] as const) {
    const call = await invokeCli([
      command,
      setup.root,
      setup.revision,
      setup.policyPath,
      mode,
      setup.paths[name],
    ]);
    expect(call.exitCode, call.stderr).toBe(0);
    observations[name] = JSON.parse(call.stdout) as Record<string, unknown>;
  }
  return observations;
}
test('[TEST-AXES-120] complete real Browser collection is isolated and preserves every upstream observation', async () => {
  const setup = await prepare();
  const expected = await upstream(setup);
  const observed = await facts(setup);
  expect(observed['schemaVersion']).toBe(1);
  expect(observed['kind']).toBe('browser-levels');
  expect(observed['revision']).toBe(setup.revision);
  expect(observed['candidate']).toBe(setup.report['candidate']);
  expect(observed['mode']).toBe(mode);
  expect(observed['collection']).toEqual([file]);
  for (const name of ['review', 'conformance', 'architecture', 'performance']) {
    expect(observed[name]).toEqual(expected[name]);
    expect(observed[`${name}ObservationDigest`]).toBe(expected[name]['observationDigest']);
  }
  const union = [manifestPath, declarationPath, performanceConfig, file, other]
    .sort()
    .map((path) => ({
      path,
      mode: '100644',
      contentDigest: hashBytes(readFileSync(join(setup.root, path))),
    }));
  expect(observed['sources']).toEqual(union);
  expect(observed['bindings']).toEqual([{ fixture: file, level: 'browser' }]);
  expect(observed['isolation']).toEqual({ kind: 'isolated', level: 'browser' });
  expect(observed['authentication']).toEqual({ kind: 'absent' });
  expect(observed['certifies']).toBe(false);
  const { observationDigest, ...payload } = observed;
  expect(observationDigest).toBe(hashCanonical(payload));
});
test('[TEST-AXES-123] Conformance Architecture Performance first-match precedence produces wrong-level findings', async () => {
  for (const [memberships, level] of [
    [{ conformance: true, architecture: true, performance: true }, 'conformance'],
    [{ conformance: false, architecture: true, performance: true }, 'architecture'],
    [{ conformance: false, architecture: false, performance: true }, 'performance'],
  ] as const) {
    const setup = await prepare(memberships);
    const observed = await facts(setup, 1);
    expect(observed['bindings']).toEqual([{ fixture: file, level }]);
    expect(observed['isolation']).toEqual({
      kind: 'wrong-level',
      level: 'browser',
      files: [{ fixture: file, actual: level }],
    });
  }
});

test('[TEST-AXES-123] multiple reported files preserve complete sorted bindings and source union', async () => {
  const setup = await prepare({ conformance: true, architecture: true, performance: false });
  publishCases(setup, [
    { title: 'z outside', status: 'passed' },
    { title: 'a inside', status: 'passed' },
  ]);
  const raw = setup.manifest['raw'] as Record<string, { path: string; digest: string }>;
  for (const name of ['discovery', 'execution']) {
    const binding = raw[name];
    const path = join(setup.root, binding.path);
    const report = JSON.parse(readFileSync(path, 'utf8')) as {
      suites: { file: string; title: string; specs: { file: string; title: string }[] }[];
    };
    const suite = report.suites[0];
    const spec = suite.specs.shift();
    if (spec === undefined) throw new Error('fixture spec absent');
    spec.file = other;
    report.suites.unshift({ file: other, title: other, specs: [spec] });
    const bytes = JSON.stringify(report);
    writeFileSync(path, bytes);
    binding.digest = digestEvidenceBytes(bytes);
  }
  const junit = `<testsuites tests="2" failures="0" errors="0" skipped="0"><testsuite name="z.test.ts" hostname="chromium"><testcase name="z outside" classname="z.test.ts"/></testsuite><testsuite name="f7.architecture.test.ts" hostname="chromium"><testcase name="a inside" classname="f7.architecture.test.ts"/></testsuite></testsuites>`;
  writeFileSync(join(setup.bundle, 'playwright.xml'), junit);
  raw['junit'].digest = digestEvidenceBytes(junit);
  const normalized = readFileSync(join(setup.bundle, 'report.xml'), 'utf8').replace(
    `name="z outside" file="${file}"`,
    `name="z outside" file="${other}"`,
  );
  writeFileSync(join(setup.bundle, 'report.xml'), normalized);
  setup.manifest['reportDigest'] = digestEvidenceBytes(normalized);
  const cases = setup.manifest['cases'] as { file: string }[];
  cases[0].file = other;
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  const report = await observation(setup);
  for (const name of ['review', 'conformance', 'architecture', 'performance'] as const) {
    setup.authorities[name].reportObservationDigest = report['observationDigest'];
    writeFileSync(setup.paths[name], JSON.stringify(setup.authorities[name]));
  }
  const observed = await facts(setup, 1);
  expect(observed['collection']).toEqual([file, other]);
  expect(observed['bindings']).toEqual([
    { fixture: file, level: 'conformance' },
    { fixture: other, level: 'performance' },
  ]);
  expect(observed['isolation']).toEqual({
    kind: 'wrong-level',
    level: 'browser',
    files: [
      { fixture: file, actual: 'conformance' },
      { fixture: other, actual: 'performance' },
    ],
  });
  const expected = await upstream(setup);
  for (const name of Object.keys(expected)) expect(observed[name]).toEqual(expected[name]);
});

function fault(
  setup: Setup,
  module: string,
  symbol: string,
  alteration: string,
  diagnostic: string,
) {
  const preload = join(setup.policyPath, '..', 'fault.ts');
  const modulePath = join(import.meta.dir, module);
  writeFileSync(
    preload,
    `import { mock } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { hashCanonical } from ${JSON.stringify(join(import.meta.dir, 'content-manifest.ts'))};
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
      'inspect-browser-levels',
      ...operands(setup),
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(call.exitCode, call.stdout.toString()).toBe(1);
  expect(call.stdout.toString()).toBe('');
  expect(call.stderr.toString()).toContain(diagnostic);
}

test('[TEST-AXES-121] exact upstream reports collection scope pins and source identities cannot substitute', async () => {
  const setup = await prepare();
  for (const [alteration, diagnostic] of [
    [
      "observation.report.revision='0'.repeat(40);seal(observation.report)",
      'report revision differs',
    ],
    [
      "observation.report.candidate='0'.repeat(64);seal(observation.report)",
      'report candidate differs',
    ],
    ["observation.report.mode='portable';seal(observation.report)", 'report mode differs'],
    ["observation.report.observationDigest='0'.repeat(64)", 'report digest is invalid'],
    ["return {...observation,observationDigest:'0'.repeat(64)}", 'observation digest is invalid'],
    [
      "observation.report.invocationId='changed';seal(observation.report)",
      'report differs between observations',
    ],
    ['observation.collection=[]', 'collection differs'],
    [`observation.collection.push(${JSON.stringify(other)})`, 'collection differs'],
    ['observation.collection.push(...observation.collection)', 'collection differs'],
    ["observation.projectRoot='apps/foreign'", 'project root differs'],
    [
      "observation.projectManifest={...observation.projectManifest,path:'apps/foreign/project.json'}",
      'project manifest differs',
    ],
    [
      "observation.projectManifest={...observation.projectManifest,digest:'0'.repeat(64)}",
      'project manifest differs',
    ],
    [
      `observation.sources.find(source=>source.path===${JSON.stringify(file)}).contentDigest='0'.repeat(64)`,
      'source disagreement',
    ],
    [
      `observation.sources.find(source=>source.path===${JSON.stringify(file)}).mode='100755'`,
      'source disagreement',
    ],
    ['observation.sources.push({...observation.sources[0]})', 'duplicate source'],
    [
      `observation.sources=observation.sources.filter(source=>source.path!==${JSON.stringify(file)})`,
      'missing Browser source',
    ],
    [
      `observation.sources=observation.sources.filter(source=>source.path!==${JSON.stringify(manifestPath)})`,
      'missing project manifest source',
    ],
  ] as const)
    fault(
      setup,
      'browser-conformance.ts',
      'inspectBrowserConformance',
      alteration,
      `Browser levels ${diagnostic}`,
    );
});

test('[TEST-AXES-122] complete explicit review refuses unknown Manual and promoted unknown rows', async () => {
  const setup = await prepare();
  for (const level of ['manual', 'conformance', 'architecture', 'performance']) {
    const authority = structuredClone(setup.authorities.review);
    const membership = authority.memberships.find((membership) => membership.level === level);
    if (membership === undefined) throw new Error('fixture membership absent');
    membership.kind = level === 'manual' ? 'unknown' : 'reviewed-empty';
    writeFileSync(setup.paths.review, JSON.stringify(authority));
    await refuse(
      setup,
      'Browser levels requires Manual reviewed-empty and other review rows unknown',
    );
  }
  writeFileSync(setup.paths.review, JSON.stringify(setup.authorities.review));
  for (const [module, symbol, row] of [
    ['browser-conformance.ts', 'inspectBrowserConformance', 'manual'],
    ['browser-architecture.ts', 'inspectBrowserArchitecture', 'conformance'],
    ['browser-performance.ts', 'inspectBrowserPerformance', 'architecture'],
  ] as const)
    fault(
      setup,
      module,
      symbol,
      `observation.memberships.${row}={kind:'reviewed-empty'}`,
      'Browser levels unrelated adapter membership is not unknown',
    );
});

test('[TEST-AXES-122] every external authority remains required and unreadability differs from absence', async () => {
  const setup = await prepare();
  for (const name of ['review', 'conformance', 'architecture', 'performance'] as const) {
    rmSync(setup.paths[name]);
    await refuse(setup, 'ENOENT');
    mkdirSync(setup.paths[name]);
    await refuse(setup, 'EISDIR');
    rmSync(setup.paths[name], { recursive: true });
    writeFileSync(setup.paths[name], JSON.stringify(setup.authorities[name]));
  }
});

test('[TEST-AXES-122] publication identity collection and digest drift after the last adapter refuse', async () => {
  const setup = await prepare();
  for (const alteration of [
    "observation.invocationId='changed'",
    `observation.cases[0].file=${JSON.stringify(other)}`,
    "observation.cases[0].status='failed'",
  ])
    fault(
      setup,
      'test-reports.ts',
      'inspectTestReports',
      `if(reads===5){${alteration};seal(observation)}`,
      'Browser levels publication changed during composition',
    );
  fault(
    setup,
    'browser-performance.ts',
    'inspectBrowserPerformance',
    `writeFileSync(${JSON.stringify(join(setup.bundle, 'report.xml'))},'broken')`,
    'Browser normalized report digest or path differs',
  );
});

test('[TEST-AXES-121] complete membership intersections and pinned manifest tuples cannot be substituted', async () => {
  const setup = await prepare({ conformance: true, architecture: false, performance: false });
  for (const [alteration, diagnostic] of [
    [
      'observation.memberships.conformance.selectedFiles.push(...observation.memberships.conformance.selectedFiles)',
      'complete membership is not sorted and unique',
    ],
    [
      'observation.memberships.conformance.files=[]',
      'membership differs from complete intersection',
    ],
    [
      `observation.memberships.conformance.files.push(${JSON.stringify(other)})`,
      'membership differs from complete intersection',
    ],
    [
      `observation.sources.find(source=>source.path===${JSON.stringify(manifestPath)}).contentDigest='0'.repeat(64)`,
      'project manifest source differs from pin',
    ],
  ] as const)
    fault(
      setup,
      'browser-conformance.ts',
      'inspectBrowserConformance',
      alteration,
      `Browser levels ${diagnostic}`,
    );
});

test('[TEST-AXES-121] exact candidate selection and nonempty complete report are required', async () => {
  const setup = await prepare();
  const revision = setup.revision;
  setup.revision = 'HEAD';
  await refuse(setup, 'Browser levels selection requires a full committed SHA');
  setup.revision = revision;
  git(setup.root, ['tag', '-a', 'tag', '-m', 'tag']);
  setup.revision = git(setup.root, ['rev-parse', 'tag^{tag}']);
  await refuse(setup, 'Browser levels selected revision differs from requested SHA');
  setup.revision = revision;
  fault(
    setup,
    '../inventory/read-candidate.ts',
    'readCandidate',
    "return {...observation,selection:{kind:'staged',base:'0'.repeat(40),indexTree:'0'.repeat(40)}}",
    'Browser levels selection is not committed',
  );
  fault(
    setup,
    'browser-memberships.ts',
    'inspectBrowserMemberships',
    'observation.report.cases=[];observation.collection=[];seal(observation.report)',
    'Browser levels collection is empty',
  );
});

test('[TEST-AXES-123] only an admitted complete collection member may fall through to Browser', async () => {
  const setup = await prepare();
  const preload = join(setup.policyPath, '..', 'classifier-fault.ts');
  writeFileSync(
    preload,
    `import {mock} from 'bun:test';
mock.module('@shared/test-levels',()=>({classifyDeclaredTest:(path,facts)=>{facts.browserFiles.delete(path);return undefined;}}));`,
  );
  const call = Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '..', 'cli.ts'),
      'inspect-browser-levels',
      ...operands(setup),
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(call.exitCode, call.stdout.toString()).toBe(1);
  expect(call.stdout.toString()).toBe('');
  expect(call.stderr.toString()).toContain('Browser levels fixture is not in admitted collection');
});

test('[TEST-AXES-124] outcomes enumeration authority bytes and full envelope digest remain bound', async () => {
  const setup = await prepare();
  publishCases(setup, [
    { title: 'failed', status: 'failed' },
    { title: 'skipped', status: 'skipped' },
    { title: 'passed', status: 'passed' },
  ]);
  const report = await observation(setup);
  for (const name of ['review', 'conformance', 'architecture', 'performance'] as const) {
    setup.authorities[name].reportObservationDigest = report['observationDigest'];
    writeFileSync(setup.paths[name], JSON.stringify(setup.authorities[name]));
  }
  const original = await facts(setup);
  expect((original['review'] as { report: unknown }).report).toEqual(report);
  const expected = await upstream(setup);
  for (const name of Object.keys(expected)) expect(original[name]).toEqual(expected[name]);
  publishCases(setup, [
    { title: 'passed', status: 'passed' },
    { title: 'skipped', status: 'skipped' },
    { title: 'failed', status: 'failed' },
  ]);
  expect((await facts(setup))['observationDigest']).toBe(original['observationDigest']);
  writeFileSync(setup.paths.review, JSON.stringify(setup.authorities.review, null, 2));
  const changed = await facts(setup);
  expect(changed['observationDigest']).not.toBe(original['observationDigest']);
  const { observationDigest, ...payload } = changed;
  expect(observationDigest).toBe(hashCanonical(payload));
  for (const credit of ['coverage', 'admission', 'T2'])
    expect(Object.hasOwn(changed, credit)).toBe(false);
});

test('[TEST-AXES-124] valid review object field order does not change review meaning', async () => {
  const setup = await prepare();
  const original = await facts(setup);
  const authority = {
    ...setup.authorities.review,
    memberships: setup.authorities.review.memberships.map(({ level, kind }) => ({ kind, level })),
  };
  writeFileSync(setup.paths.review, JSON.stringify(authority));
  const changed = await facts(setup);
  expect(changed['bindings']).toEqual(original['bindings']);
  expect(changed['isolation']).toEqual(original['isolation']);
  expect(changed['observationDigest']).not.toBe(original['observationDigest']);
});

test('[TEST-AXES-124] bounded CLI refuses wrong arity mode and inherited publication failures', async () => {
  const setup = await prepare();
  const args = operands(setup);
  for (const invalid of [
    [],
    [...args, 'extra'],
    [...args.slice(0, 3), 'future', ...args.slice(4)],
  ]) {
    const call = await invokeCli(['inspect-browser-levels', ...invalid]);
    expect(call.exitCode).toBe(1);
    expect(call.stdout).toBe('');
    expect(call.stderr).toContain('usage: twilight-burokrat inspect-browser-levels');
  }
  writeFileSync(join(setup.bundle, 'report.xml'), 'broken');
  await refuse(setup, 'Browser normalized report digest or path differs');
});

test('[TEST-AXES-124] built installed executable preserves complete isolated and wrong-level observations', async () => {
  const setup = await prepare();
  const packageRoot = mkdtempSync(join(tmpdir(), 'browser-levels-package-'));
  scratch.push(packageRoot);
  await buildPackage(packageRoot);
  const executable = join(packageRoot, 'dist/bin.mjs');
  const inspect = (args: string[]) =>
    Bun.spawnSync([process.execPath, executable, 'inspect-browser-levels', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  const call = inspect(operands(setup));
  expect(call.exitCode, call.stderr.toString()).toBe(0);
  expect(call.stdout.toString()).toBe((await inspectLevels(setup)).stdout);
  const overlap = await prepare({ conformance: true, architecture: true, performance: true });
  const wrong = inspect(operands(overlap));
  expect(wrong.exitCode, wrong.stderr.toString()).toBe(1);
  expect(wrong.stdout.toString()).toBe((await inspectLevels(overlap)).stdout);
  const unsupported = inspect([]);
  expect(unsupported.exitCode).toBe(1);
  expect(unsupported.stdout.toString()).toBe('');
  expect(unsupported.stderr.toString()).toContain(
    'usage: twilight-burokrat inspect-browser-levels',
  );
}, 120_000);

test('[TEST-AXES-125] real composer accepts explicit empty Performance without fabricating results', async () => {
  const setup = await prepare(undefined, true);
  const expected = await upstream(setup);
  const observed = await facts(setup);
  expect(observed['performance']).toEqual(expected['performance']);
  expect(expected['performance']['memberships']).toEqual({
    performance: { kind: 'reviewed-empty' },
    manual: { kind: 'unknown' },
    conformance: { kind: 'unknown' },
    architecture: { kind: 'unknown' },
  });
  expect(observed['bindings']).toEqual([{ fixture: file, level: 'browser' }]);
  expect(observed['isolation']).toEqual({ kind: 'isolated', level: 'browser' });
  expect(observed['sources']).toEqual(
    [manifestPath, file].sort().map((path) => ({
      path,
      mode: '100644',
      contentDigest: hashBytes(readFileSync(join(setup.root, path))),
    })),
  );
  expect(observed['certifies']).toBe(false);
});
