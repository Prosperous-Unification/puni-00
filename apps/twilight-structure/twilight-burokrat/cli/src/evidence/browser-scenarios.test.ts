import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { digestEvidenceBytes } from '@shared/test-evidence';
import { afterEach, expect, test } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { invokeCli } from '../invoke-cli';
import { buildPackage } from '../packaging/build';
import { registeredRules } from '../rules/registry';
import { proposeScenarioAllocation } from '../rules/scenarios';
import type { inspectBrowserLevels } from './browser-levels';
import type { inspectBrowserScenarios } from './browser-scenarios';
import { hashBytes, hashCanonical } from './content-manifest';
import type { inspectTestReports } from './test-reports';

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
  if (source === 'regular')
    writeFileSync(join(root, file), 'throw new Error("candidate Browser fixture executed");\n');
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
  parentTitle = '',
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
  const rawWithParent = (phase: 'list' | 'run') => {
    const publication = raw(phase);
    if (parentTitle === '') return publication;
    return {
      ...publication,
      suites: publication.suites.map((suite) => ({
        ...suite,
        specs: [],
        suites: [{ title: parentTitle, file: caseFile, specs: suite.specs }],
      })),
    };
  };
  const fullTitle = (terminal: string) =>
    parentTitle === '' ? terminal : `${parentTitle} › ${terminal}`;
  const failureCount = observations.filter((observation) => observation.status === 'failed').length;
  const skippedCount = observations.filter(
    (observation) => observation.status === 'skipped',
  ).length;
  const outcomeXml = (status: 'passed' | 'failed' | 'skipped') =>
    status === 'passed' ? '' : status === 'failed' ? '<failure/>' : '<skipped/>';
  const discovery = JSON.stringify(rawWithParent('list'));
  const execution = JSON.stringify(rawWithParent('run'));
  const total = String(observations.length);
  const failures = String(failureCount);
  const skipped = String(skippedCount);
  const playwright = `<testsuites tests="${total}" failures="${failures}" errors="0" skipped="${skipped}"><testsuite name="${basename(caseFile)}" hostname="chromium">${observations.map((observation) => `<testcase name="${fullTitle(observation.title)}" classname="${basename(caseFile)}">${outcomeXml(observation.status)}</testcase>`).join('')}</testsuite></testsuites>`;
  const report = `<testsuite name="browser.ordinary" tests="${total}" failures="${failures}" errors="0" skipped="${skipped}">${observations.map((observation) => `<testcase classname="chromium" name="${fullTitle(observation.title)}" file="${caseFile}">${outcomeXml(observation.status)}</testcase>`).join('')}</testsuite>`;
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
    titlePath: parentTitle === '' ? [observation.title] : [parentTitle, observation.title],
    status: observation.status,
  }));
  setup.manifest['coverage'] = {
    passingCases: observations.filter((observation) => observation.status === 'passed').length,
    skippedDebt: skippedCount,
  };
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
}

async function observation(
  setup: ReturnType<typeof fixture>,
): Promise<ReturnType<typeof inspectTestReports>> {
  const call = await inspect(setup);
  expect(call.exitCode, call.stderr).toBe(0);
  return JSON.parse(call.stdout) as ReturnType<typeof inspectTestReports>;
}

async function prepare(
  memberships = { conformance: false, architecture: false, performance: false },
  performanceEmpty = false,
  options: { specTail?: string; files?: Record<string, string>; retireSecond?: boolean } = {},
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
  mkdirSync(join(setup.root, 'openspec/specs/example'), { recursive: true });
  writeFileSync(
    join(setup.root, 'openspec/scenario-allocations.json'),
    JSON.stringify({ schemaVersion: 1, events: [] }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'scenario predecessor']);
  const baseRevision = git(setup.root, ['rev-parse', 'HEAD']);
  const allocation = proposeScenarioAllocation(
    { schemaVersion: 1, events: [] },
    'openspec/specs/example/spec.md',
    '# Example\n\n## Requirements\n\n### Requirement: Render\n\n#### Scenario: first\n- **WHEN** read\n- **THEN** rendered\n\n#### Scenario: second\n- **WHEN** read\n- **THEN** rendered\n',
  );
  const otherAllocation = proposeScenarioAllocation(
    allocation.journal,
    'openspec/specs/other/spec.md',
    '# Other\n\n## Requirements\n\n### Requirement: Other\n\n#### Scenario: other scenario\n- **WHEN** read\n- **THEN** observed\n',
  );
  mkdirSync(join(setup.root, 'openspec/specs/other'), { recursive: true });
  writeFileSync(join(setup.root, 'openspec/specs/other/spec.md'), otherAllocation.specMarkdown);
  const retired = options.retireSecond === true;
  writeFileSync(
    join(setup.root, 'openspec/specs/example/spec.md'),
    (retired
      ? allocation.specMarkdown.slice(
          0,
          allocation.specMarkdown.indexOf('#### Scenario: [EXAMPLE-002]'),
        )
      : allocation.specMarkdown) + (options.specTail ?? ''),
  );
  writeFileSync(
    join(setup.root, 'openspec/scenario-allocations.json'),
    JSON.stringify(
      retired
        ? {
            ...otherAllocation.journal,
            events: [...otherAllocation.journal.events, { kind: 'retire', id: 'EXAMPLE-002' }],
          }
        : otherAllocation.journal,
    ),
  );
  for (const [path, content] of Object.entries(options.files ?? {})) {
    mkdirSync(join(setup.root, path, '..'), { recursive: true });
    writeFileSync(join(setup.root, path), content);
  }
  const policy = JSON.parse(readFileSync(setup.policyPath, 'utf8')) as {
    scenarios?: { baseRevision: string };
  };
  policy.scenarios = { baseRevision };
  writeFileSync(setup.policyPath, JSON.stringify(policy));
  publishCases(setup, [{ title: '[EXAMPLE-001] first', status: 'passed' }]);
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
    candidate: report.candidate,
    mode,
    reportObservationDigest: report.observationDigest,
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
const inspectScenarios = (setup: Setup, capability = 'example', extra: string[] = []) =>
  invokeCli(['inspect-browser-scenarios', ...operands(setup), capability, ...extra]);
async function facts(setup: Setup, exitCode = 0) {
  const call = await inspectScenarios(setup);
  expect(call.exitCode, call.stderr).toBe(exitCode);
  return JSON.parse(call.stdout) as ReturnType<typeof inspectBrowserScenarios>;
}
async function refuse(setup: Setup, diagnostic: string) {
  const call = await inspectScenarios(setup);
  expect(call.exitCode, call.stdout).toBe(1);
  expect(call.stdout).toBe('');
  expect(call.stderr).toContain(diagnostic);
}

test('[TEST-AXES-128] real isolated Browser scenarios retain complete reports and unobserved rows', async () => {
  const setup = await prepare();
  const observed = await facts(setup);
  expect(observed.kind).toBe('browser-scenarios');
  expect(observed.schemaVersion).toBe(1);
  expect(observed.revision).toBe(setup.revision);
  expect(observed.candidate).toBe(setup.report.candidate);
  expect(observed.mode).toBe(mode);
  expect(observed.policyId).toBe('browser-fixture');
  expect(observed.policyDigest).toBe(hashBytes(readFileSync(setup.policyPath)));
  expect(observed.scenarios).toEqual([
    {
      id: 'EXAMPLE-001',
      title: 'first',
      observation: { kind: 'observed', cases: observed.report.cases },
    },
    { id: 'EXAMPLE-002', title: 'second', observation: { kind: 'unobserved-in-selection' } },
  ]);
  expect(observed.citations).toEqual([{ id: 'EXAMPLE-001', cases: observed.report.cases }]);
  expect(observed.citationFindings).toEqual([]);
  const levels = await invokeCli(['inspect-browser-levels', ...operands(setup)]);
  expect(levels.exitCode, levels.stderr).toBe(0);
  expect(observed.levels).toEqual(
    JSON.parse(levels.stdout) as ReturnType<typeof inspectBrowserLevels>,
  );
  expect(observed.report).toEqual(setup.report);
  expect(observed.levelsObservationDigest).toBe(observed.levels.observationDigest);
  expect(observed.reportObservationDigest).toBe(observed.report.observationDigest);
  expect(observed.specifications.selectorVersion).toBe(3);
  expect(observed.authentication).toEqual({ kind: 'absent' });
  expect(observed.certifies).toBe(false);
  const { observationDigest, ...payload } = observed;
  expect(observationDigest).toBe(hashCanonical(payload));
});

async function repin(setup: Setup) {
  const report = await observation(setup);
  setup.report = report;
  for (const name of ['review', 'conformance', 'architecture', 'performance'] as const) {
    setup.authorities[name].reportObservationDigest = report.observationDigest;
    writeFileSync(setup.paths[name], JSON.stringify(setup.authorities[name]));
  }
}

test('[TEST-AXES-128] keeps passed failed skipped cases and unobserved rows without coverage credit', async () => {
  const setup = await prepare();
  publishCases(setup, [
    { title: '[EXAMPLE-001] passing', status: 'passed' },
    { title: '[EXAMPLE-001] failing', status: 'failed' },
    { title: '[EXAMPLE-001] skipped', status: 'skipped' },
    { title: '[OTHER-001] other capability', status: 'passed' },
  ]);
  await repin(setup);
  const observed = await facts(setup);
  expect(observed.report.cases.map((entry) => entry.status).sort()).toEqual([
    'failed',
    'passed',
    'passed',
    'skipped',
  ]);
  const cases = observed.report.cases
    .filter((entry) => entry.titlePath.at(-1)?.startsWith('[EXAMPLE-001]'))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  expect(observed.scenarios[0]?.observation).toEqual({ kind: 'observed', cases });
  expect(observed.scenarios[1]?.observation).toEqual({ kind: 'unobserved-in-selection' });
  expect(observed.citations).toEqual([
    { id: 'EXAMPLE-001', cases },
    {
      id: 'OTHER-001',
      cases: observed.report.cases.filter((entry) =>
        entry.titlePath.at(-1)?.startsWith('[OTHER-001]'),
      ),
    },
  ]);
});

for (const [terminal, kind] of [
  ['no citation', 'missing'],
  ['[EXAMPLE-1] short', 'malformed'],
  ['[example-001] lowercase', 'malformed'],
  ['[EXAMPLE-001]no space', 'malformed'],
  ['[EXAMPLE-999] unknown', 'inactive'],
] as const) {
  test(`[TEST-AXES-129] terminal ${kind} citation ${terminal} is diagnostic JSON`, async () => {
    const setup = await prepare();
    publishCases(setup, [
      { title: terminal, status: 'skipped' },
      { title: '[OTHER-001] passing', status: 'passed' },
    ]);
    await repin(setup);
    const observed = await facts(setup, 1);
    expect(observed.citationFindings).toEqual([
      {
        caseId: observed.report.cases.find((entry) => entry.status === 'skipped')!.caseId,
        kind,
        title: terminal,
        status: 'skipped',
      },
    ]);
    expect(
      observed.scenarios.every((entry) => entry.observation.kind === 'unobserved-in-selection'),
    ).toBe(true);
    expect(observed.citations.map((entry) => entry.id)).toEqual(['OTHER-001']);
  });
}

test('[TEST-AXES-129] retired citation remains inactive', async () => {
  const setup = await prepare(undefined, false, { retireSecond: true });
  publishCases(setup, [{ title: '[EXAMPLE-002] retired', status: 'failed' }]);
  await repin(setup);
  const observed = await facts(setup, 1);
  expect(observed.citationFindings[0]?.kind).toBe('inactive');
  expect(observed.scenarios.map((entry) => entry.id)).toEqual(['EXAMPLE-001']);
});

test('[TEST-AXES-130] refuses unidentified requested scenario and preserves unrelated B3 debt', async () => {
  const debt = '\n#### Scenario: unidentified debt\n- **WHEN** read\n- **THEN** unresolved\n';
  await refuse(
    await prepare(undefined, false, { specTail: debt }),
    'requested capability has unidentified scenarios',
  );
  const setup = await prepare(undefined, false, {
    files: {
      'openspec/specs/debt/spec.md': '# Debt\n\n## Requirements\n\n### Requirement: Debt\n' + debt,
    },
  });
  const observed = await facts(setup);
  expect(observed.specifications.unidentified).toEqual([
    { path: 'openspec/specs/debt/spec.md', title: 'unidentified debt' },
  ]);
  expect(observed.scenarios).toHaveLength(2);
});

test('[TEST-AXES-130] unrelated competing overlays refuse before capability filtering', async () => {
  const content =
    '## ADDED Requirements\n\n### Requirement: Debt\n\n#### Scenario: debt\n- **WHEN** read\n- **THEN** unresolved\n';
  const setup = await prepare(undefined, false, {
    files: {
      'openspec/changes/one/specs/debt/spec.md': content,
      'openspec/changes/two/specs/debt/spec.md': content,
    },
  });
  await refuse(setup, 'competing overlay operation: debt');
});

test('[TEST-AXES-130] real wrong level and missing scenarios policy refuse without JSON', async () => {
  await refuse(
    await prepare({ conformance: false, architecture: false, performance: true }),
    'requires isolated Browser',
  );
  const setup = await prepare();
  const policy = JSON.parse(readFileSync(setup.policyPath, 'utf8')) as {
    scenarios?: { baseRevision: string };
  };
  delete policy.scenarios;
  writeFileSync(setup.policyPath, JSON.stringify(policy));
  await repin(setup);
  await refuse(setup, 'needs external policy.scenarios');
});

test('[TEST-AXES-130] inherited absent unreadable malformed policy authority and publication failures refuse', async () => {
  for (const fault of [
    'missing',
    'unreadable',
    'malformed',
    'policy',
    'publication',
    'source',
  ] as const) {
    const setup = await prepare();
    if (fault === 'missing') rmSync(setup.paths.review);
    if (fault === 'unreadable') {
      rmSync(setup.paths.review);
      mkdirSync(setup.paths.review);
    }
    if (fault === 'malformed') writeFileSync(setup.paths.review, '{broken');
    if (fault === 'policy') writeFileSync(setup.policyPath, '{broken');
    if (fault === 'publication') rmSync(join(setup.bundle, 'execution.json'));
    if (fault === 'source') {
      writeFileSync(join(setup.root, file), 'changed');
      git(setup.root, ['add', '.']);
      git(setup.root, ['commit', '-m', 'changed']);
      setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
    }
    const call = await inspectScenarios(setup);
    expect(call.exitCode).toBe(1);
    expect(call.stdout).toBe('');
    expect(call.stderr.length).toBeGreaterThan(0);
  }
});

test('[TEST-AXES-131] source usage and absent capability refuse without JSON', async () => {
  const setup = await prepare();
  for (const args of [
    [],
    [...operands(setup), 'example', 'extra'],
    [...operands(setup).slice(0, 3), 'invalid', ...operands(setup).slice(4), 'example'],
  ]) {
    const call = await invokeCli(['inspect-browser-scenarios', ...args]);
    expect(call.exitCode).toBe(1);
    expect(call.stdout).toBe('');
    expect(call.stderr).toContain('usage: twilight-burokrat inspect-browser-scenarios');
  }
  const absent = await inspectScenarios(setup, 'absent');
  expect(absent.exitCode).toBe(1);
  expect(absent.stdout).toBe('');
  expect(absent.stderr).toContain('capability is absent');
});

test('[TEST-AXES-131] installed dispatch preserves full identity and findings exit status', async () => {
  const setup = await prepare();
  const packageRoot = mkdtempSync(join(tmpdir(), 'browser-scenarios-package-'));
  scratch.push(packageRoot);
  await buildPackage(packageRoot);
  const run = (args: string[]) =>
    Bun.spawnSync(
      [process.execPath, join(packageRoot, 'dist/bin.mjs'), 'inspect-browser-scenarios', ...args],
      { stdout: 'pipe', stderr: 'pipe' },
    );
  const call = run([...operands(setup), 'example']);
  expect(call.exitCode, call.stderr.toString()).toBe(0);
  expect(call.stdout.toString()).toBe((await inspectScenarios(setup)).stdout);
  publishCases(setup, [{ title: 'invalid citation', status: 'passed' }]);
  await repin(setup);
  const findings = run([...operands(setup), 'example']);
  expect(findings.exitCode, findings.stderr.toString()).toBe(1);
  expect(findings.stdout.toString()).toBe((await inspectScenarios(setup)).stdout);
  const usage = run([]);
  expect(usage.exitCode).toBe(1);
  expect(usage.stdout.toString()).toBe('');
  expect(usage.stderr.toString()).toContain('usage: twilight-burokrat inspect-browser-scenarios');
}, 120000);

function inject(setup: Setup, moduleName: string, exportName: string, mutation: string) {
  const modulePath = join(import.meta.dir, moduleName);
  const preload = join(setup.root, 'fault-preload.ts');
  writeFileSync(
    preload,
    `import {mock} from 'bun:test';
const actual=await import(${JSON.stringify(modulePath + '?real-fault')});
const {hashCanonical}=await import(${JSON.stringify(join(import.meta.dir, 'content-manifest.ts'))});
const seal=(value)=>{const {observationDigest,...payload}=value;return {...payload,observationDigest:hashCanonical(payload)}};
mock.module(${JSON.stringify(modulePath)},()=>({...actual,${exportName}:(...args)=>{const observed=actual.${exportName}(...args);${mutation}}}));
`,
  );
  return Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '../cli.ts'),
      'inspect-browser-scenarios',
      ...operands(setup),
      'example',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
}
for (const [name, mutation, diagnostic] of [
  ['levels-revision', "return seal({...observed,revision:'0'.repeat(40)});", 'revision differs'],
  ['levels-candidate', "return seal({...observed,candidate:'0'.repeat(64)});", 'candidate differs'],
  ['levels-mode', "return seal({...observed,mode:'portable'});", 'mode differs'],
  [
    'report-revision',
    "return seal({...observed,review:{...observed.review,report:seal({...observed.review.report,revision:'0'.repeat(40)})}});",
    'revision differs',
  ],
  [
    'report-candidate',
    "return seal({...observed,review:{...observed.review,report:seal({...observed.review.report,candidate:'0'.repeat(64)})}});",
    'candidate differs',
  ],
  [
    'report-mode',
    "return seal({...observed,review:{...observed.review,report:seal({...observed.review.report,mode:'portable'})}});",
    'mode differs',
  ],
  [
    'levels-digest',
    "return {...observed,observationDigest:'0'.repeat(64)};",
    'levels digest is invalid',
  ],
  [
    'report-digest',
    "return seal({...observed,review:{...observed.review,report:{...observed.review.report,observationDigest:'0'.repeat(64)}}});",
    'report digest is invalid',
  ],
  [
    'policy',
    "return seal({...observed,review:{...observed.review,report:seal({...observed.review.report,policyDigest:'0'.repeat(64)})}});",
    'policy differs from publication',
  ],
  [
    'terminal',
    'return seal({...observed,review:{...observed.review,report:seal({...observed.review.report,cases:observed.review.report.cases.map(entry=>({...entry,titlePath:[]}))})}});',
    'terminal test title is absent',
  ],
] as const) {
  test(`[TEST-AXES-130] WATCH_${name} coherent real levels dependency fault refuses`, async () => {
    const setup = await prepare();
    const call = inject(setup, 'browser-levels.ts', 'inspectBrowserLevels', mutation);
    expect(call.exitCode).toBe(1);
    expect(call.stdout.toString()).toBe('');
    expect(call.stderr.toString()).toContain(`Browser scenarios ${diagnostic}`);
  });
}

test('[TEST-AXES-130] WATCH_committed broken selected reader refuses', async () => {
  const setup = await prepare();
  const call = inject(
    setup,
    '../inventory/read-candidate.ts',
    'readCandidate',
    "return {...observed,selection:{kind:'staged',base:args[1].revision}};",
  );
  expect(call.exitCode).toBe(1);
  expect(call.stdout.toString()).toBe('');
  expect(call.stderr.toString()).toContain('Browser scenarios selection is not committed');
});
test('[TEST-AXES-130] symbolic and annotated tag selections refuse by name', async () => {
  const setup = await prepare();
  setup.revision = 'HEAD';
  await refuse(setup, 'Browser scenarios selection requires a full committed SHA');
  git(setup.root, ['tag', '-a', 'candidate-tag', '-m', 'tag']);
  setup.revision = git(setup.root, ['rev-parse', 'candidate-tag']);
  await refuse(setup, 'Browser scenarios selected revision differs from requested SHA');
});

test('[TEST-AXES-129] real nested suite prefixes cannot cite a terminal scenario', async () => {
  const setup = await prepare();
  publishCases(
    setup,
    [{ title: 'terminal without citation', status: 'passed' }],
    file,
    '[EXAMPLE-001] suite',
  );
  await repin(setup);
  const missing = await facts(setup, 1);
  expect(missing.citationFindings).toEqual([
    {
      caseId: missing.report.cases[0].caseId,
      kind: 'missing',
      title: 'terminal without citation',
      status: 'passed',
    },
  ]);
  expect(
    missing.scenarios.every((entry) => entry.observation.kind === 'unobserved-in-selection'),
  ).toBe(true);
  publishCases(
    setup,
    [{ title: '[EXAMPLE-002] terminal', status: 'passed' }],
    file,
    '[EXAMPLE-001] suite',
  );
  await repin(setup);
  const observed = await facts(setup);
  expect(observed.scenarios[0]?.observation).toEqual({ kind: 'unobserved-in-selection' });
  expect(observed.scenarios[1]?.observation).toEqual({
    kind: 'observed',
    cases: observed.report.cases,
  });
});

test('[TEST-AXES-131] canonical cases and digest bind complete changed policy authority', async () => {
  const setup = await prepare();
  publishCases(setup, [
    { title: '[EXAMPLE-001] zulu', status: 'passed' },
    { title: '[EXAMPLE-001] alpha', status: 'passed' },
  ]);
  await repin(setup);
  const baseline = await facts(setup);
  expect(baseline.scenarios[0]?.observation).toEqual({
    kind: 'observed',
    cases: [...baseline.report.cases].sort((left, right) =>
      left.caseId.localeCompare(right.caseId),
    ),
  });
  publishCases(setup, [
    { title: '[EXAMPLE-001] alpha', status: 'passed' },
    { title: '[EXAMPLE-001] zulu', status: 'passed' },
  ]);
  await repin(setup);
  expect((await facts(setup)).observationDigest).toBe(baseline.observationDigest);
  writeFileSync(setup.policyPath, readFileSync(setup.policyPath, 'utf8') + '\n');
  await repin(setup);
  const changed = await facts(setup);
  expect(changed.policyDigest).not.toBe(baseline.policyDigest);
  expect(changed.observationDigest).not.toBe(baseline.observationDigest);
  const { observationDigest, ...payload } = changed;
  expect(observationDigest).toBe(hashCanonical(payload));
});

test('[TEST-AXES-128] active other-capability observations leave every requested row validly unobserved', async () => {
  const setup = await prepare();
  publishCases(setup, [{ title: '[OTHER-001] other capability only', status: 'passed' }]);
  await repin(setup);
  const observed = await facts(setup);
  expect(observed.citationFindings).toEqual([]);
  expect(observed.citations).toEqual([{ id: 'OTHER-001', cases: observed.report.cases }]);
  expect(observed.scenarios.map((scenario) => scenario.observation)).toEqual([
    { kind: 'unobserved-in-selection' },
    { kind: 'unobserved-in-selection' },
  ]);
});
