import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
  decodePerformanceCases,
  digestEvidenceBytes,
  digestPerformanceDeclaration,
} from '@shared/test-evidence';
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
const file = `${projectRoot}/src/browser.perf.spec.ts`;
const other = `${projectRoot}/src/other.perf.spec.ts`;
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
  mkdirSync(join(root, projectRoot, 'src'), { recursive: true });
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

async function prepare() {
  const setup = fixture();
  const report = await observation(setup);
  const pin = (path: string) => ({ path, digest: hashBytes(readFileSync(join(setup.root, path))) });
  const authority = {
    schemaVersion: 1,
    revision: setup.revision,
    candidate: report['candidate'],
    mode,
    reportObservationDigest: report['observationDigest'],
    projectRoot,
    projectManifest: pin(manifestPath),
    declaration: pin(declarationPath),
    config: pin(performanceConfig),
    project: declaration.project,
  };
  const authorityPath = join(setup.policyPath, '..', 'performance-authority.json');
  writeFileSync(authorityPath, JSON.stringify(authority));
  return { ...setup, report, authority, authorityPath };
}
type Setup = Awaited<ReturnType<typeof prepare>>;
const inspectPerformance = (setup: Setup) =>
  invokeCli([
    'inspect-browser-performance',
    setup.root,
    setup.revision,
    setup.policyPath,
    mode,
    setup.authorityPath,
  ]);
async function facts(setup: Setup) {
  const call = await inspectPerformance(setup);
  expect(call.exitCode, call.stderr).toBe(0);
  return JSON.parse(call.stdout) as Record<string, unknown>;
}
async function refuse(setup: Setup, diagnostic: string) {
  const call = await inspectPerformance(setup);
  expect(call.exitCode, call.stdout).toBe(1);
  expect(call.stdout).toBe('');
  expect(call.stderr).toContain(diagnostic);
}
function writeAuthority(setup: Setup, authority: unknown = setup.authority) {
  writeFileSync(setup.authorityPath, JSON.stringify(authority));
}

function fault(setup: Setup, module: string, exports: string, expected: string) {
  const preload = join(setup.policyPath, '..', 'fault.ts');
  const modulePath = join(import.meta.dir, module);
  writeFileSync(
    preload,
    `import { mock } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
const actual = await import(${JSON.stringify(`${modulePath}?actual`)});
const authorityPath = ${JSON.stringify(setup.authorityPath)};
mock.module(${JSON.stringify(modulePath)}, () => ({ ...actual, ${exports} }));`,
  );
  const call = Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '..', 'cli.ts'),
      'inspect-browser-performance',
      setup.root,
      setup.revision,
      setup.policyPath,
      mode,
      setup.authorityPath,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(call.exitCode, call.stdout.toString()).toBe(1);
  expect(call.stdout.toString()).toBe('');
  expect(call.stderr.toString()).toContain(expected);
}

async function commit(setup: Setup) {
  git(setup.root, ['add', projectRoot]);
  git(setup.root, ['commit', '-m', 'selection change']);
  setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
  const selected = readCandidate(setup.root, { kind: 'committed', revision: setup.revision });
  setup.manifest['revision'] = setup.revision;
  setup.manifest['candidate'] = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  setup.report = await observation(setup);
  setup.authority.revision = setup.revision;
  setup.authority.candidate = setup.report['candidate'];
  setup.authority.reportObservationDigest = setup.report['observationDigest'];
  for (const pin of [
    setup.authority.projectManifest,
    setup.authority.declaration,
    setup.authority.config,
  ]) {
    if (selected.entries.some((entry) => entry.path === pin.path && entry.mode === '100644'))
      pin.digest = hashBytes(readFileSync(join(setup.root, pin.path)));
  }
  writeAuthority(setup);
}

test('[TEST-AXES-112] complete committed overlap binds declaration and every selected source', async () => {
  const setup = await prepare();
  const expectedSources = [manifestPath, declarationPath, performanceConfig, file, other]
    .sort()
    .map((path) => ({
      path,
      mode: '100644',
      contentDigest: hashBytes(readFileSync(join(setup.root, path))),
    }));
  writeFileSync(join(setup.root, other), 'working repair');
  const observed = await facts(setup);
  expect(observed['schemaVersion']).toBe(1);
  expect(observed['kind']).toBe('browser-performance');
  expect(observed['report']).toEqual(setup.report);
  expect(observed['authority']).toEqual(setup.authority);
  expect(observed['authorityDigest']).toBe(hashBytes(readFileSync(setup.authorityPath)));
  expect(observed['projectRoot']).toBe(projectRoot);
  expect(observed['projectManifest']).toEqual(setup.authority.projectManifest);
  expect(observed['collection']).toEqual([file]);
  expect(observed['sources']).toEqual(expectedSources);
  expect(observed['memberships']).toEqual({
    performance: {
      kind: 'committed',
      ...setup.authority.declaration,
      declaration: decodePerformanceCases(declaration),
      declarationDigest: digestPerformanceDeclaration(decodePerformanceCases(declaration)),
      config: setup.authority.config,
      project: declaration.project,
      selectedFiles: [file, other].sort(),
      files: [file],
    },
    manual: { kind: 'unknown' },
    conformance: { kind: 'unknown' },
    architecture: { kind: 'unknown' },
  });
  expect(observed['authentication']).toEqual({ kind: 'absent' });
  expect(observed['certifies']).toBe(false);
  for (const credit of ['classification', 'isolation', 'coverage', 'admission', 'level'])
    expect(Object.hasOwn(observed, credit)).toBe(false);
  const { observationDigest, ...payload } = observed;
  expect(observationDigest).toBe(hashCanonical(payload));
});

test('[TEST-AXES-112] disjoint complete declaration retains fixtures and empty intersection', async () => {
  const setup = await prepare();
  writeFileSync(
    join(setup.root, declarationPath),
    JSON.stringify({ ...declaration, cases: [declaration.cases[1]] }),
  );
  await commit(setup);
  const observed = await facts(setup);
  expect(observed['collection']).toEqual([file]);
  const membership = (
    observed['memberships'] as { performance: { selectedFiles: string[]; files: string[] } }
  ).performance;
  expect(membership.selectedFiles).toEqual([other]);
  expect(membership.files).toEqual([]);
  expect((observed['sources'] as { path: string }[]).map((source) => source.path)).toEqual(
    [manifestPath, declarationPath, performanceConfig, file, other].sort(),
  );
});
test('[TEST-AXES-113] authority absent unreadable malformed and escaping boundaries refuse', async () => {
  const setup = await prepare();
  rmSync(setup.authorityPath);
  await refuse(setup, 'ENOENT');
  mkdirSync(setup.authorityPath);
  await refuse(setup, 'EISDIR');
  rmSync(setup.authorityPath, { recursive: true });
  writeFileSync(setup.authorityPath, new Uint8Array([0xff]));
  await refuse(setup, 'Browser Performance authority is not UTF-8');
  writeFileSync(setup.authorityPath, '{');
  await refuse(setup, 'Browser Performance authority JSON is malformed');
  for (const authority of [
    { ...setup.authority, schemaVersion: 2 },
    { ...setup.authority, extra: true },
    { ...setup.authority, projectRoot: '../escape' },
    { ...setup.authority, projectManifest: { ...setup.authority.projectManifest, extra: true } },
  ]) {
    writeAuthority(setup, authority);
    await refuse(setup, 'Browser Performance authority');
  }
  writeFileSync(join(setup.root, 'inside.json'), JSON.stringify(setup.authority));
  setup.authorityPath = join(setup.root, 'inside.json');
  await refuse(setup, 'resolves inside selected candidate');
});
test('[TEST-AXES-113] authority pins and scope cannot substitute selected report or manifest', async () => {
  const setup = await prepare();
  for (const [key, value, diagnostic] of [
    ['revision', '0'.repeat(40), 'revision differs'],
    ['candidate', '0'.repeat(64), 'candidate differs'],
    ['mode', 'portable', 'mode differs'],
    ['reportObservationDigest', '0'.repeat(64), 'report digest differs'],
    ['projectRoot', 'apps/foreign', 'manifest differs from scope root'],
    [
      'projectManifest',
      { ...setup.authority.projectManifest, path: other },
      'manifest differs from scope root',
    ],
    [
      'projectManifest',
      { ...setup.authority.projectManifest, digest: '0'.repeat(64) },
      'manifest digest differs',
    ],
  ] as const) {
    writeAuthority(setup, { ...setup.authority, [key]: value });
    await refuse(setup, diagnostic);
  }
  writeAuthority(setup, {
    ...setup.authority,
    projectRoot: 'apps/foreign',
    projectManifest: { path: 'apps/foreign/project.json', digest: '0'.repeat(64) },
  });
  await refuse(setup, 'collection escapes declared project scope');
});
test('[TEST-AXES-115] bounded CLI and inherited publication refusals emit no observation', async () => {
  const setup = await prepare();
  for (const args of [
    [],
    [setup.root, setup.revision, setup.policyPath, 'future', setup.authorityPath],
    [setup.root, setup.revision, setup.policyPath, mode, setup.authorityPath, 'extra'],
  ]) {
    const call = await invokeCli(['inspect-browser-performance', ...args]);
    expect(call.exitCode).toBe(1);
    expect(call.stdout).toBe('');
    expect(call.stderr).toContain('usage: twilight-burokrat inspect-browser-performance');
  }
  const original = setup.revision;
  setup.revision = 'HEAD';
  await refuse(setup, 'requires a full committed SHA');
  setup.revision = original;
  git(setup.root, ['tag', '-a', 'tag', '-m', 'annotated']);
  setup.revision = git(setup.root, ['rev-parse', 'tag^{tag}']);
  await refuse(setup, 'Browser Performance selected revision differs from requested SHA');
  setup.revision = original;
  writeFileSync(join(setup.bundle, 'report.xml'), 'broken');
  await refuse(setup, 'Browser normalized report digest or path differs');
});

test('[TEST-AXES-113] every closed pin boundary refuses', async () => {
  const setup = await prepare();
  for (const key of ['declaration', 'config'] as const) {
    for (const pin of [
      undefined,
      { ...setup.authority[key], extra: true },
      { ...setup.authority[key], path: '../escape' },
    ]) {
      writeAuthority(setup, { ...setup.authority, [key]: pin });
      await refuse(setup, 'Browser Performance authority');
    }
    writeAuthority(setup, {
      ...setup.authority,
      [key]: { ...setup.authority[key], digest: '0'.repeat(64) },
    });
    await refuse(setup, `${key} digest differs`);
    writeAuthority(setup, {
      ...setup.authority,
      [key]: { ...setup.authority[key], path: 'outside' },
    });
    await refuse(
      setup,
      key === 'config' ? 'declaration config differs' : 'source escapes declared project scope',
    );
  }
  writeAuthority(setup, { ...setup.authority, declaration: setup.authority.projectManifest });
  await refuse(setup, 'pinned paths must be distinct');
  writeAuthority(setup, { ...setup.authority, project: 'foreign' });
  await refuse(setup, 'declaration project differs');
});

test('[TEST-AXES-114] all selected pin and disjoint fixture blobs refuse missing nonregular unreadable despite working repairs', async () => {
  for (const path of [manifestPath, declarationPath, performanceConfig, other])
    for (const kind of ['missing', 'symlink', 'directory', 'unreadable'] as const) {
      const setup = await prepare();
      const bytes = readFileSync(join(setup.root, path));
      if (kind === 'unreadable')
        fault(
          setup,
          '../inventory/read-blob.ts',
          `readSelectedBlob:(...args)=>{if(args[3]===${JSON.stringify(path)})throw new Error('injected unreadable selected object');return actual.readSelectedBlob(...args);}`,
          'Browser Performance cannot read selected blob',
        );
      else {
        rmSync(join(setup.root, path));
        if (kind === 'symlink') symlinkSync('project.json', join(setup.root, path));
        if (kind === 'directory') {
          mkdirSync(join(setup.root, path));
          writeFileSync(join(setup.root, path, 'child'), 'nested');
        }
        await commit(setup);
        rmSync(join(setup.root, path), { recursive: true, force: true });
        writeFileSync(join(setup.root, path), bytes);
        await refuse(setup, `Browser Performance source is not a selected regular blob: ${path}`);
      }
    }
});

test('[TEST-AXES-114] complete malformed selected manifest and declaration refuse', async () => {
  for (const [path, bytes, diagnostic] of [
    [manifestPath, new Uint8Array([255]), 'project manifest is not UTF-8'],
    [manifestPath, '{', 'project manifest JSON is malformed'],
    ...['[]', 'null', '{}', '{"targets":[]}', '{"targets":null}', '{"targets":"bad"}'].map(
      (bytes) => [manifestPath, bytes, 'project manifest is malformed'] as const,
    ),
    [declarationPath, new Uint8Array([255]), 'declaration is not UTF-8'],
    [declarationPath, '{', 'declaration JSON is malformed'],
    [
      declarationPath,
      JSON.stringify({ ...declaration, schemaVersion: 2 }),
      'Invalid Performance declaration',
    ],
    [
      declarationPath,
      JSON.stringify({ ...declaration, extra: true }),
      'Invalid Performance declaration',
    ],
    [declarationPath, JSON.stringify({ ...declaration, cases: [] }), 'fixture selection is empty'],
    [
      declarationPath,
      JSON.stringify({ ...declaration, config: file }),
      'declaration config differs',
    ],
    [
      declarationPath,
      JSON.stringify({ ...declaration, project: 'foreign' }),
      'declaration project differs',
    ],
    [
      declarationPath,
      JSON.stringify({ ...declaration, cases: [{ ...declaration.cases[0], fixture: 'outside' }] }),
      'source escapes declared project scope',
    ],
    [
      declarationPath,
      JSON.stringify({
        ...declaration,
        cases: [{ ...declaration.cases[0], fixture: '../escape' }],
      }),
      'normalized workspace path',
    ],
    [
      declarationPath,
      JSON.stringify({ ...declaration, cases: [declaration.cases[0], declaration.cases[0]] }),
      'duplicate Performance case ID',
    ],
    [
      declarationPath,
      JSON.stringify({ ...declaration, cases: [{ ...declaration.cases[0], titlePath: [] }] }),
      'no full title path',
    ],
    [
      declarationPath,
      JSON.stringify(declaration).replace('"threshold":100', '"threshold":1e999'),
      'finite threshold',
    ],
    [
      declarationPath,
      JSON.stringify(declaration).replace('"threshold":100', '"threshold":-0'),
      'serialized canonically',
    ],
  ] as const) {
    const setup = await prepare();
    writeFileSync(join(setup.root, path), bytes);
    await commit(setup);
    await refuse(setup, diagnostic);
  }
});

test('[TEST-AXES-113] broken upstream identity and source dependencies cannot join coherent substituted authority', async () => {
  for (const [alteration, diagnostic] of [
    [
      "report.revision='0'.repeat(40);authority.revision=report.revision;",
      'report revision differs',
    ],
    [
      "report.candidate='0'.repeat(64);authority.candidate=report.candidate;",
      'report candidate differs',
    ],
    ["report.mode='portable';authority.mode=report.mode;", 'report mode differs'],
    ['report.cases=[];', 'collection is empty'],
    ["report.cases[0].source.mode='100755';", 'report source differs'],
    ["report.cases[0].source.contentDigest='0'.repeat(64);", 'report source differs'],
  ] as const) {
    const setup = await prepare();
    fault(
      setup,
      './test-reports.ts',
      `inspectTestReports:(...args)=>{const report=actual.inspectTestReports(...args);const authority=JSON.parse(readFileSync(authorityPath,'utf8'));${alteration}report.observationDigest='f'.repeat(64);authority.reportObservationDigest=report.observationDigest;writeFileSync(authorityPath,JSON.stringify(authority));return report;}`,
      diagnostic,
    );
  }
  const setup = await prepare();
  fault(
    setup,
    '../inventory/read-candidate.ts',
    "readCandidate:(...args)=>({...actual.readCandidate(...args),selection:{kind:'staged',base:'0'.repeat(40),indexTree:'0'.repeat(40)}})",
    'selection is not committed',
  );
});

test('[TEST-AXES-115] later shared source bytes and modes must agree', async () => {
  for (const mutation of [
    "return new TextEncoder().encode('substitution');",
    "args[1].find(entry=>entry.path===args[3]).mode='100755';",
  ]) {
    const setup = await prepare();
    fault(
      setup,
      '../inventory/read-blob.ts',
      `readSelectedBlob:(()=>{let count=0;return (...args)=>{const bytes=actual.readSelectedBlob(...args);if(args[3]===${JSON.stringify(file)}&&++count===3){${mutation}}return bytes;};})()`,
      'same-path source disagreement',
    );
  }
});

test('[TEST-AXES-115] outcomes ordering authority bytes declaration and selected bytes bind complete identity', async () => {
  const setup = await prepare();
  publishCases(setup, [
    { title: 'z skipped', status: 'skipped' },
    { title: 'a failed', status: 'failed' },
    { title: 'b passed', status: 'passed' },
  ]);
  setup.report = await observation(setup);
  setup.authority.reportObservationDigest = setup.report['observationDigest'];
  writeAuthority(setup);
  const observed = await facts(setup);
  expect(observed['report']).toEqual(setup.report);
  expect(observed['collection']).toEqual([file]);
  publishCases(setup, [
    { title: 'b passed', status: 'passed' },
    { title: 'a failed', status: 'failed' },
    { title: 'z skipped', status: 'skipped' },
  ]);
  expect((await facts(setup))['observationDigest']).toBe(observed['observationDigest']);
  writeFileSync(setup.authorityPath, JSON.stringify(setup.authority, null, 2));
  const reformatted = await facts(setup);
  expect(reformatted['authorityDigest']).not.toBe(observed['authorityDigest']);
  expect(reformatted['observationDigest']).not.toBe(observed['observationDigest']);
  writeFileSync(join(setup.root, other), 'changed disjoint selected bytes');
  await commit(setup);
  const changed = await facts(setup);
  expect(changed['observationDigest']).not.toBe(observed['observationDigest']);
  expect(
    (changed['sources'] as { path: string; contentDigest: string }[]).find(
      (source) => source.path === other,
    )?.contentDigest,
  ).toBe(hashBytes('changed disjoint selected bytes'));
});

test('[TEST-AXES-115] built installed executable dispatches complete observation and bounded usage', async () => {
  const setup = await prepare();
  const packageRoot = mkdtempSync(join(tmpdir(), 'browser-performance-package-'));
  scratch.push(packageRoot);
  await buildPackage(packageRoot);
  const executable = join(packageRoot, 'dist/bin.mjs');
  const call = Bun.spawnSync(
    [
      process.execPath,
      executable,
      'inspect-browser-performance',
      setup.root,
      setup.revision,
      setup.policyPath,
      mode,
      setup.authorityPath,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(call.exitCode, call.stderr.toString()).toBe(0);
  expect(JSON.parse(call.stdout.toString())).toEqual(await facts(setup));
  const invalid = Bun.spawnSync([process.execPath, executable, 'inspect-browser-performance'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(invalid.exitCode).toBe(1);
  expect(invalid.stdout.toString()).toBe('');
  expect(invalid.stderr.toString()).toContain(
    'usage: twilight-burokrat inspect-browser-performance',
  );
}, 120000);

test('[TEST-AXES-115] multiple reported files retain sorted complete collection and union', async () => {
  const setup = await prepare();
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
  const junit = `<testsuites tests="2" failures="0" errors="0" skipped="0"><testsuite name="${basename(other)}" hostname="chromium"><testcase name="z outside" classname="${basename(other)}"/></testsuite><testsuite name="${basename(file)}" hostname="chromium"><testcase name="a inside" classname="${basename(file)}"/></testsuite></testsuites>`;
  writeFileSync(join(setup.bundle, 'playwright.xml'), junit);
  const junitBinding = raw['junit'];
  junitBinding.digest = digestEvidenceBytes(junit);
  const normalized = readFileSync(join(setup.bundle, 'report.xml'), 'utf8').replace(
    `name="z outside" file="${file}"`,
    `name="z outside" file="${other}"`,
  );
  writeFileSync(join(setup.bundle, 'report.xml'), normalized);
  setup.manifest['reportDigest'] = digestEvidenceBytes(normalized);
  const cases = setup.manifest['cases'] as { file: string }[];
  const first = cases[0];
  first.file = other;
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  setup.report = await observation(setup);
  setup.authority.reportObservationDigest = setup.report['observationDigest'];
  writeAuthority(setup);
  const observed = await facts(setup);
  expect(observed['collection']).toEqual([file, other].sort());
  expect(observed['report']).toEqual(setup.report);
  expect(
    (observed['memberships'] as { performance: { files: string[] } }).performance.files,
  ).toEqual([file, other].sort());
  expect((observed['sources'] as { path: string }[]).map((source) => source.path)).toEqual(
    [manifestPath, declarationPath, performanceConfig, file, other].sort(),
  );
});

test('[TEST-AXES-114] coherent out-of-root Performance config cannot use a selected outside blob', async () => {
  const setup = await prepare();
  writeFileSync(join(setup.root, declarationPath), JSON.stringify({ ...declaration, config }));
  await commit(setup);
  writeAuthority(setup, {
    ...setup.authority,
    config: { path: config, digest: hashBytes(readFileSync(join(setup.root, config))) },
  });
  await refuse(setup, 'source escapes declared project scope');
});

function emptyAuthority(setup: Setup) {
  return {
    schemaVersion: 2,
    revision: setup.authority.revision,
    candidate: setup.authority.candidate,
    mode: setup.authority.mode,
    reportObservationDigest: setup.authority.reportObservationDigest,
    projectRoot: setup.authority.projectRoot,
    projectManifest: setup.authority.projectManifest,
    performance: { kind: 'reviewed-empty' },
  };
}

async function prepareEmpty() {
  const setup = await prepare();
  rmSync(join(setup.root, declarationPath));
  await commit(setup);
  writeAuthority(setup, emptyAuthority(setup));
  return setup;
}

test('[TEST-AXES-125] explicit empty preserves complete report sources and noncertifying identity', async () => {
  const setup = await prepareEmpty();
  publishCases(setup, [
    { title: 'a passed', status: 'passed' },
    { title: 'b failed', status: 'failed' },
    { title: 'c skipped', status: 'skipped' },
  ]);
  setup.report = await observation(setup);
  setup.authority.reportObservationDigest = setup.report['observationDigest'];
  writeAuthority(setup, emptyAuthority(setup));
  const observed = await facts(setup);
  expect(observed['memberships']).toEqual({
    performance: { kind: 'reviewed-empty' },
    manual: { kind: 'unknown' },
    conformance: { kind: 'unknown' },
    architecture: { kind: 'unknown' },
  });
  expect(observed['report']).toEqual(setup.report);
  expect(observed['sources']).toEqual(
    [manifestPath, file].sort().map((path) => ({
      path,
      mode: '100644',
      contentDigest: hashBytes(readFileSync(join(setup.root, path))),
    })),
  );
  expect(observed['authentication']).toEqual({ kind: 'absent' });
  expect(observed['certifies']).toBe(false);
  const { observationDigest, ...payload } = observed;
  expect(observationDigest).toBe(hashCanonical(payload));
});

test('[TEST-AXES-126] selected targets and every declaration shape contradict empty despite working repairs', async () => {
  for (const target of ['test:performance', 'test:performance:level']) {
    for (const value of [null, {}, 'malformed']) {
      const setup = await prepareEmpty();
      writeFileSync(
        join(setup.root, manifestPath),
        JSON.stringify({ targets: { [target]: value } }),
      );
      await commit(setup);
      writeAuthority(setup, emptyAuthority(setup));
      writeFileSync(join(setup.root, manifestPath), JSON.stringify({ targets: {} }));
      await refuse(setup, 'reviewed-empty contradicts committed Performance target');
    }
  }
  for (const shape of ['malformed', 'symlink', 'directory']) {
    const setup = await prepareEmpty();
    if (shape === 'malformed') writeFileSync(join(setup.root, declarationPath), '{');
    if (shape === 'symlink') symlinkSync('project.json', join(setup.root, declarationPath));
    if (shape === 'directory') {
      mkdirSync(join(setup.root, declarationPath));
      writeFileSync(join(setup.root, declarationPath, 'nested'), 'invalid');
    }
    await commit(setup);
    writeAuthority(setup, emptyAuthority(setup));
    rmSync(join(setup.root, declarationPath), { recursive: true });
    await refuse(setup, 'reviewed-empty contradicts committed Performance declaration');
  }
});

test('[TEST-AXES-126] empty authority remains closed and source-bound', async () => {
  const missingDisposition = await prepareEmpty();
  const { performance: omittedPerformance, ...identity } = emptyAuthority(missingDisposition);
  expect(omittedPerformance).toEqual({ kind: 'reviewed-empty' });
  writeAuthority(missingDisposition, identity);
  await refuse(missingDisposition, 'authority is invalid');

  for (const change of [
    { schemaVersion: 3 },
    { performance: {} },
    { performance: { kind: 'unknown' } },
    { performance: { kind: 'reviewed-empty', files: [] } },
    { extra: true },
    { declaration: { path: declarationPath, digest: '0'.repeat(64) } },
  ]) {
    const setup = await prepareEmpty();
    writeAuthority(setup, { ...emptyAuthority(setup), ...change });
    await refuse(setup, 'authority is invalid');
  }
  const setup = await prepareEmpty();
  writeAuthority(setup, { ...emptyAuthority(setup), candidate: '0'.repeat(64) });
  await refuse(setup, 'candidate differs');
});

test('[TEST-AXES-127] v2 committed preserves v1 complete membership', async () => {
  const setup = await prepare();
  const legacy = await facts(setup);
  const { declaration: declarationPin, config: configPin, project, ...identity } = setup.authority;
  writeAuthority(setup, {
    ...identity,
    schemaVersion: 2,
    performance: { kind: 'committed', declaration: declarationPin, config: configPin, project },
  });
  const explicit = await facts(setup);
  expect(explicit['memberships']).toEqual(legacy['memberships']);
  expect(explicit['sources']).toEqual(legacy['sources']);
  expect(explicit['report']).toEqual(legacy['report']);
});

test('[TEST-AXES-125] built installed executable dispatches explicit empty and bounded usage', async () => {
  const setup = await prepareEmpty();
  const packageRoot = mkdtempSync(join(tmpdir(), 'browser-performance-package-'));
  scratch.push(packageRoot);
  await buildPackage(packageRoot);
  const executable = join(packageRoot, 'dist/bin.mjs');
  const call = Bun.spawnSync(
    [
      process.execPath,
      executable,
      'inspect-browser-performance',
      setup.root,
      setup.revision,
      setup.policyPath,
      mode,
      setup.authorityPath,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(call.exitCode, call.stderr.toString()).toBe(0);
  expect(JSON.parse(call.stdout.toString())).toEqual(await facts(setup));
  const invalid = Bun.spawnSync([process.execPath, executable, 'inspect-browser-performance'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(invalid.exitCode).toBe(1);
  expect(invalid.stdout.toString()).toBe('');
  expect(invalid.stderr.toString()).toContain(
    'usage: twilight-burokrat inspect-browser-performance',
  );
}, 120000);

test('[TEST-AXES-126] empty keeps unreadable and missing authority distinct', async () => {
  for (const unreadable of [false, true]) {
    const setup = await prepareEmpty();
    rmSync(setup.authorityPath);
    if (unreadable) mkdirSync(setup.authorityPath);
    await refuse(setup, unreadable ? 'EISDIR' : 'ENOENT');
  }
});

test('[TEST-AXES-127] v2 committed disposition rejects extra and missing pins', async () => {
  const setup = await prepare();
  const { declaration: declarationPin, config: configPin, project, ...identity } = setup.authority;
  for (const performance of [
    { kind: 'committed', declaration: declarationPin, config: configPin, project, extra: true },
    { kind: 'committed', declaration: declarationPin, config: configPin },
    { kind: 'committed', declaration: declarationPin, project },
    { kind: 'committed', config: configPin, project },
  ]) {
    writeAuthority(setup, { ...identity, schemaVersion: 2, performance });
    await refuse(setup, 'authority is invalid');
  }
});
