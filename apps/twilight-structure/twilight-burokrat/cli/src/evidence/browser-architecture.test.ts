import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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
const file = `${projectRoot}/src/architecture/mod-index.architecture.test.ts`;
const other = `${projectRoot}/src/architecture/f7.architecture.test.ts`;
const architecturePath = `${projectRoot}/src/architecture-fixtures.json`;
const mappings = [
  { ruleId: 'MOD-INDEX', file: 'src/architecture/mod-index.architecture.test.ts' },
  { ruleId: 'F7', file: 'src/architecture/f7.architecture.test.ts' },
];
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
  writeFileSync(
    join(root, architecturePath),
    JSON.stringify({ schemaVersion: 1, fixtures: mappings }),
  );
  writeFileSync(join(root, manifestPath), JSON.stringify({ targets: {} }));
  writeFileSync(join(root, other), 'throw new Error("candidate executed");');
  writeFileSync(join(root, config), 'export default {}\n');
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
  const authority = {
    schemaVersion: 1,
    revision: setup.revision,
    candidate: report['candidate'],
    mode,
    reportObservationDigest: report['observationDigest'],
    projectRoot,
    architecture: {
      kind: 'committed',
      path: architecturePath,
      digest: hashBytes(readFileSync(join(setup.root, architecturePath))),
    },
    projectManifest: {
      path: manifestPath,
      digest: hashBytes(readFileSync(join(setup.root, manifestPath))),
    },
  };
  const authorityPath = join(setup.policyPath, '..', 'architecture-authority.json');
  writeFileSync(authorityPath, JSON.stringify(authority));
  return { ...setup, report, authority, authorityPath };
}
type Setup = Awaited<ReturnType<typeof prepare>>;
const inspectArchitecture = (setup: Setup) =>
  invokeCli([
    'inspect-browser-architecture',
    setup.root,
    setup.revision,
    setup.policyPath,
    mode,
    setup.authorityPath,
  ]);
async function refuse(setup: Setup, diagnostic: string) {
  const call = await inspectArchitecture(setup);
  expect(call.exitCode, call.stdout).toBe(1);
  expect(call.stdout).toBe('');
  expect(call.stderr).toContain(diagnostic);
}
async function facts(setup: Setup) {
  const call = await inspectArchitecture(setup);
  expect(call.exitCode, call.stderr).toBe(0);
  return JSON.parse(call.stdout) as Record<string, unknown>;
}
function writeAuthority(setup: Setup, authority: unknown = setup.authority) {
  writeFileSync(setup.authorityPath, JSON.stringify(authority));
}
async function commit(setup: Setup) {
  git(setup.root, ['add', projectRoot]);
  git(setup.root, ['commit', '-m', 'selection change']);
  setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
  const snapshot = readCandidate(setup.root, { kind: 'committed', revision: setup.revision });
  setup.manifest['revision'] = setup.revision;
  setup.manifest['candidate'] = hashCanonical({
    selection: snapshot.selection,
    entries: snapshot.entries,
    untracked: snapshot.untracked,
  });
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  setup.report = await observation(setup);
  setup.authority.revision = setup.revision;
  setup.authority.candidate = setup.report['candidate'];
  setup.authority.reportObservationDigest = setup.report['observationDigest'];
  setup.authority.projectManifest.digest = hashBytes(readFileSync(join(setup.root, manifestPath)));
  if (
    setup.authority.architecture.kind === 'committed' &&
    readCandidate(setup.root, { kind: 'committed', revision: setup.revision }).entries.some(
      (entry) => entry.path === architecturePath && entry.mode === '100644',
    )
  )
    setup.authority.architecture.digest = hashBytes(
      readFileSync(join(setup.root, architecturePath)),
    );
  writeAuthority(setup);
}
function policy(setup: Setup, fixtures: unknown = mappings) {
  writeFileSync(join(setup.root, architecturePath), JSON.stringify({ schemaVersion: 1, fixtures }));
}
test('[TEST-AXES-109] authority absent unreadable malformed and escaping boundaries refuse', async () => {
  const setup = await prepare();
  rmSync(setup.authorityPath);
  await refuse(setup, 'ENOENT');
  mkdirSync(setup.authorityPath);
  await refuse(setup, 'EISDIR');
  rmSync(setup.authorityPath, { recursive: true });
  writeFileSync(setup.authorityPath, new Uint8Array([0xff]));
  await refuse(setup, 'Browser Architecture authority is not UTF-8');
  writeFileSync(setup.authorityPath, '{');
  await refuse(setup, 'Browser Architecture authority JSON is malformed');
  for (const authority of [
    { ...setup.authority, schemaVersion: 2 },
    { ...setup.authority, extra: true },
    { ...setup.authority, projectRoot: '../escape' },
    { ...setup.authority, projectManifest: { ...setup.authority.projectManifest, extra: true } },
  ]) {
    writeAuthority(setup, authority);
    await refuse(setup, 'Browser Architecture authority');
  }
  writeFileSync(join(setup.root, 'inside.json'), JSON.stringify(setup.authority));
  setup.authorityPath = join(setup.root, 'inside.json');
  await refuse(setup, 'resolves inside selected candidate');
});
test('[TEST-AXES-109] authority pins and scope cannot substitute selected report or manifest', async () => {
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
test('[TEST-AXES-111] bounded CLI and inherited publication refusals emit no observation', async () => {
  const setup = await prepare();
  for (const args of [
    [],
    [setup.root, setup.revision, setup.policyPath, 'future', setup.authorityPath],
    [setup.root, setup.revision, setup.policyPath, mode, setup.authorityPath, 'extra'],
  ]) {
    const call = await invokeCli(['inspect-browser-architecture', ...args]);
    expect(call.exitCode).toBe(1);
    expect(call.stdout).toBe('');
    expect(call.stderr).toContain('usage: twilight-burokrat inspect-browser-architecture');
  }
  const original = setup.revision;
  setup.revision = 'HEAD';
  await refuse(setup, 'requires a full committed SHA');
  setup.revision = original;
  git(setup.root, ['tag', '-a', 'tag', '-m', 'annotated']);
  setup.revision = git(setup.root, ['rev-parse', 'tag^{tag}']);
  await refuse(setup, 'Browser Architecture selected revision differs from requested SHA');
  setup.revision = original;
  writeFileSync(join(setup.bundle, 'report.xml'), 'broken');
  await refuse(setup, 'Browser normalized report digest or path differs');
});

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
      'inspect-browser-architecture',
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

test('[TEST-AXES-109] broken report dependencies cannot coherently substitute capture pins mode collection or source tuples', async () => {
  const setup = await prepare();
  for (const [alteration, expected] of [
    [
      "report.revision = '0'.repeat(40); authority.revision = report.revision;",
      'report revision differs',
    ],
    [
      "report.candidate = '0'.repeat(64); authority.candidate = report.candidate;",
      'report candidate differs',
    ],
    [
      "report.mode = 'portable'; authority.mode = report.mode;",
      'report mode differs from requested mode',
    ],
    ['report.cases = [];', 'collection is empty'],
    ["report.cases[0].file = '../escape.test.ts';", 'collection escapes declared project scope'],
    ["report.cases[0].source.mode = '100755';", 'report source differs from selected blob'],
    [
      "report.cases[0].source.contentDigest = '0'.repeat(64);",
      'report source differs from selected blob',
    ],
    [
      "report.cases.push({...report.cases[0], caseId:'duplicate-source', source:{...report.cases[0].source,contentDigest:'0'.repeat(64)}});",
      'report source differs from selected blob',
    ],
  ]) {
    writeAuthority(setup);
    fault(
      setup,
      'test-reports.ts',
      `inspectTestReports: (...args) => { const report = actual.inspectTestReports(...args); const authority = JSON.parse(readFileSync(authorityPath,'utf8')); ${alteration} report.observationDigest = 'f'.repeat(64); authority.reportObservationDigest = report.observationDigest; writeFileSync(authorityPath,JSON.stringify(authority)); return report; }`,
      expected,
    );
  }
});

test('[TEST-AXES-109] broken candidate dependency cannot provide noncommitted selection', async () => {
  const setup = await prepare();
  fault(
    setup,
    '../inventory/read-candidate.ts',
    "readCandidate: (...args) => ({...actual.readCandidate(...args),selection:{kind:'staged',base:'0'.repeat(40),indexTree:'0'.repeat(40)}})",
    'Browser Architecture selection is not committed',
  );
});

test('[TEST-AXES-110] complete disjoint selected sources refuse missing nonregular unreadable objects despite working repairs', async () => {
  for (const kind of ['missing', 'symlink', 'directory', 'unreadable'] as const) {
    const setup = await prepare();
    if (kind === 'unreadable') {
      fault(
        setup,
        '../inventory/read-blob.ts',
        `readSelectedBlob: (...args) => { if (args[3] === ${JSON.stringify(other)}) throw new Error('injected unreadable selected object'); return actual.readSelectedBlob(...args); }`,
        `Browser Architecture cannot read selected blob: ${other}`,
      );
    } else {
      rmSync(join(setup.root, other));
      if (kind === 'symlink')
        symlinkSync('mod-index.architecture.test.ts', join(setup.root, other));
      if (kind === 'directory') {
        mkdirSync(join(setup.root, other));
        writeFileSync(join(setup.root, other, 'child'), 'nested');
      }
      await commit(setup);
      rmSync(join(setup.root, other), { force: true, recursive: true });
      writeFileSync(join(setup.root, other), 'working repair');
      await refuse(setup, `Browser Architecture source is not a selected regular blob: ${other}`);
    }
  }
});

test('[TEST-AXES-110] selected manifest malformed UTF-8 JSON and target shapes refuse', async () => {
  for (const [bytes, diagnostic] of [
    [new Uint8Array([0xff]), 'project manifest is not UTF-8'],
    ['{', 'project manifest JSON is malformed'],
    ['[]', 'project manifest is malformed'],
    ['null', 'project manifest is malformed'],
    ['{}', 'project manifest is malformed'],
    ['{"targets":[]}', 'project manifest is malformed'],
    ['{"targets":null}', 'project manifest is malformed'],
    ['{"targets":"foreign"}', 'project manifest is malformed'],
  ] as const) {
    const setup = await prepare();
    writeFileSync(join(setup.root, manifestPath), bytes);
    await commit(setup);
    await refuse(setup, diagnostic);
  }
});

test('[TEST-AXES-110] missing nonregular and unreadable selected manifest cannot be repaired in working tree', async () => {
  for (const kind of ['missing', 'symlink', 'unreadable'] as const) {
    const setup = await prepare();
    if (kind === 'unreadable') {
      fault(
        setup,
        '../inventory/read-blob.ts',
        `readSelectedBlob: (...args) => { if(args[3] === ${JSON.stringify(manifestPath)}) throw new Error('injected unreadable manifest'); return actual.readSelectedBlob(...args); }`,
        'Browser Architecture cannot read selected blob',
      );
    } else {
      rmSync(join(setup.root, manifestPath));
      if (kind === 'symlink')
        symlinkSync('mod-index.architecture.test.ts', join(setup.root, manifestPath));
      git(setup.root, ['add', projectRoot]);
      git(setup.root, ['commit', '-m', 'broken manifest']);
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
      writeAuthority(setup);
      rmSync(join(setup.root, manifestPath), { force: true });
      writeFileSync(join(setup.root, manifestPath), 'working repair');
      await refuse(setup, 'Browser Architecture source is not a selected regular blob');
    }
  }
});

test('[TEST-AXES-111] built installed executable dispatches the complete observation and named usage', async () => {
  const setup = await prepare();
  const packageRoot = mkdtempSync(join(tmpdir(), 'browser-architecture-package-'));
  scratch.push(packageRoot);
  await buildPackage(packageRoot);
  const executable = join(packageRoot, 'dist/bin.mjs');
  const call = Bun.spawnSync(
    [
      process.execPath,
      executable,
      'inspect-browser-architecture',
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
  const unsupported = Bun.spawnSync(
    [process.execPath, executable, 'inspect-browser-architecture'],
    {
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  expect(unsupported.exitCode).toBe(1);
  expect(unsupported.stdout.toString()).toBe('');
  expect(unsupported.stderr.toString()).toContain(
    'usage: twilight-burokrat inspect-browser-architecture',
  );
}, 120_000);

test('[TEST-AXES-111] broken selected-byte dependency cannot replace a shared path on its later read', async () => {
  const setup = await prepare();
  fault(
    setup,
    '../inventory/read-blob.ts',
    `readSelectedBlob: (() => { let count=0; return (...args) => { const bytes=actual.readSelectedBlob(...args); if(args[3] === ${JSON.stringify(file)} && ++count === 3) return new TextEncoder().encode('substituted selected bytes'); return bytes; }; })()`,
    'Browser Architecture same-path source disagreement',
  );
});

test('[TEST-AXES-108] complete committed overlap binds all selected bytes and canonical noncertifying envelope', async () => {
  const setup = await prepare();
  const expectedSources = [manifestPath, architecturePath, other, file].sort().map((path) => ({
    path,
    mode: '100644',
    contentDigest: hashBytes(readFileSync(join(setup.root, path))),
  }));
  writeFileSync(join(setup.root, other), 'working repair');
  const observed = await facts(setup);
  expect(observed['schemaVersion']).toBe(1);
  expect(observed['kind']).toBe('browser-architecture');
  expect(observed['report']).toEqual(setup.report);
  expect(observed['projectRoot']).toBe(projectRoot);
  expect(observed['projectManifest']).toEqual(setup.authority.projectManifest);
  expect(observed['collection']).toEqual([file]);
  expect(observed['sources']).toEqual(expectedSources);
  expect(observed['authority']).toEqual(setup.authority);
  expect(observed['authorityDigest']).toBe(hashBytes(readFileSync(setup.authorityPath)));
  expect(observed['memberships']).toEqual({
    architecture: {
      kind: 'committed',
      path: architecturePath,
      digest: setup.authority.architecture.digest,
      selectedFiles: [other, file],
      files: [file],
    },
    manual: { kind: 'unknown' },
    conformance: { kind: 'unknown' },
    performance: { kind: 'unknown' },
  });
  expect(observed['authentication']).toEqual({ kind: 'absent' });
  expect(observed['certifies']).toBe(false);
  for (const credit of ['classification', 'isolation', 'coverage', 'admission', 'level'])
    expect(Object.hasOwn(observed, credit)).toBe(false);
  const { observationDigest, ...payload } = observed;
  expect(observationDigest).toBe(hashCanonical(payload));
});

test('[TEST-AXES-108] disjoint mapped fixtures retain complete selection and source union', async () => {
  const setup = await prepare();
  const browserFile = `${projectRoot}/browser.test.ts`;
  policy(setup, [mappings[1]]);
  renameSync(join(setup.root, file), join(setup.root, browserFile));
  publishCases(setup, [{ title, status: 'passed' }], browserFile);
  await commit(setup);
  const observed = await facts(setup);
  expect(observed['collection']).toEqual([browserFile]);
  expect(observed['memberships']).toEqual({
    architecture: { ...setup.authority.architecture, selectedFiles: [other], files: [] },
    manual: { kind: 'unknown' },
    conformance: { kind: 'unknown' },
    performance: { kind: 'unknown' },
  });
  expect((observed['sources'] as { path: string }[]).map((source) => source.path)).toEqual(
    [browserFile, manifestPath, architecturePath, other].sort(),
  );
});

test('[TEST-AXES-110] reviewed-empty is explicit and refuses policy descendants or target', async () => {
  for (const kind of ['absent', 'policy', 'descendant', 'target'] as const) {
    const setup = await prepare();
    if (kind !== 'policy') rmSync(join(setup.root, architecturePath));
    if (kind === 'descendant') {
      mkdirSync(join(setup.root, architecturePath));
      writeFileSync(join(setup.root, architecturePath, 'child'), 'policy descendant');
    }
    if (kind === 'target')
      writeFileSync(
        join(setup.root, manifestPath),
        JSON.stringify({ targets: { 'test:architecture:level': {} } }),
      );
    if (kind !== 'policy') await commit(setup);
    writeAuthority(setup, { ...setup.authority, architecture: { kind: 'reviewed-empty' } });
    if (kind === 'absent') {
      const observed = await facts(setup);
      expect((observed['memberships'] as { architecture: unknown }).architecture).toEqual({
        kind: 'reviewed-empty',
      });
      expect((observed['sources'] as { path: string }[]).map((source) => source.path)).toEqual(
        [manifestPath, file].sort(),
      );
    } else
      await refuse(
        setup,
        'Browser Architecture reviewed-empty contradicts committed policy or target',
      );
  }
});

test('[TEST-AXES-110] fixed policy pins and closed architecture authority refuse unsupported variants', async () => {
  const setup = await prepare();
  for (const architecture of [
    undefined,
    { kind: 'unknown' },
    { kind: 'reviewed-empty', path: architecturePath },
    { ...setup.authority.architecture, extra: true },
  ]) {
    writeAuthority(setup, { ...setup.authority, architecture });
    await refuse(setup, 'Browser Architecture authority is invalid');
  }
  for (const [architecture, diagnostic] of [
    [{ ...setup.authority.architecture, path: other }, 'policy pin differs from fixed runner path'],
    [
      { ...setup.authority.architecture, digest: '0'.repeat(64) },
      'policy pin digest differs from selected blob',
    ],
  ] as const) {
    writeAuthority(setup, { ...setup.authority, architecture });
    await refuse(setup, diagnostic);
  }
});

test('[TEST-AXES-110] malformed policy and every mapping validator preserve named production refusals', async () => {
  for (const [contents, diagnostic] of [
    [new Uint8Array([0xff]), 'Architecture policy is not UTF-8'],
    ['{', 'Architecture policy JSON is malformed'],
    [JSON.stringify({ schemaVersion: 2, fixtures: mappings }), 'schemaVersion'],
    [JSON.stringify({ schemaVersion: 1, fixtures: [], extra: true }), 'extra'],
    [JSON.stringify({ schemaVersion: 1, fixtures: [] }), 'no-cases'],
    [JSON.stringify({ schemaVersion: 1, fixtures: [{ ...mappings[0], extra: true }] }), 'extra'],
    [
      JSON.stringify({ schemaVersion: 1, fixtures: [{ ruleId: 'F7', file: 'src/unit.test.ts' }] }),
      'cannot collect Unit file',
    ],
    [
      JSON.stringify({ schemaVersion: 1, fixtures: [{ ruleId: 'F7', file: mappings[0].file }] }),
      'needs its own fixture',
    ],
    [
      JSON.stringify({
        schemaVersion: 1,
        fixtures: [{ ruleId: 'UNKNOWN', file: 'src/architecture/unknown.architecture.test.ts' }],
      }),
      'unknown rule',
    ],
    [JSON.stringify({ schemaVersion: 1, fixtures: [mappings[0], mappings[0]] }), 'mapped twice'],
  ] as const) {
    const setup = await prepare();
    writeFileSync(join(setup.root, architecturePath), contents);
    await commit(setup);
    await refuse(setup, diagnostic);
  }
});

test('[TEST-AXES-110] unmapped immediate suffix files and directory children refuse while ordinary nesting is ignored', async () => {
  for (const kind of ['file', 'directory', 'nested'] as const) {
    const setup = await prepare();
    const addition = join(
      setup.root,
      projectRoot,
      'src/architecture',
      kind === 'nested' ? 'nested/ordinary.architecture.test.ts' : 'extra.architecture.test.ts',
    );
    if (kind === 'directory') {
      mkdirSync(addition);
      writeFileSync(join(addition, 'child'), 'selected child');
    } else {
      mkdirSync(join(addition, '..'), { recursive: true });
      writeFileSync(addition, 'throw new Error("never execute");');
    }
    await commit(setup);
    if (kind === 'nested') expect((await facts(setup))['collection']).toEqual([file]);
    else
      await refuse(
        setup,
        'unmapped architecture fixture: src/architecture/extra.architecture.test.ts',
      );
  }
});

test('[TEST-AXES-110] missing symlink directory and unreadable policy refuse despite working repairs', async () => {
  for (const kind of ['missing', 'symlink', 'directory', 'unreadable'] as const) {
    const setup = await prepare();
    if (kind === 'unreadable')
      fault(
        setup,
        '../inventory/read-blob.ts',
        `readSelectedBlob:(...args)=>{if(args[3]===${JSON.stringify(architecturePath)})throw new Error('injected unreadable policy');return actual.readSelectedBlob(...args);}`,
        'Browser Architecture cannot read selected blob',
      );
    else {
      rmSync(join(setup.root, architecturePath));
      if (kind === 'symlink') symlinkSync('project.json', join(setup.root, architecturePath));
      if (kind === 'directory') {
        mkdirSync(join(setup.root, architecturePath));
        writeFileSync(join(setup.root, architecturePath, 'child'), 'child');
      }
      await commit(setup);
      rmSync(join(setup.root, architecturePath), { recursive: true, force: true });
      policy(setup);
      await refuse(
        setup,
        `Browser Architecture source is not a selected regular blob: ${architecturePath}`,
      );
    }
  }
});

test('[TEST-AXES-111] report outcomes and ordering bind deterministic complete identity and raw authority bytes', async () => {
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
  policy(setup, [...mappings].reverse());
  await commit(setup);
  expect((await facts(setup))['memberships']).toEqual({
    ...(observed['memberships'] as Record<string, unknown>),
    architecture: { ...setup.authority.architecture, selectedFiles: [other, file], files: [file] },
  });
  const beforeSourceChange = (await facts(setup))['observationDigest'];
  writeFileSync(join(setup.root, other), 'changed committed disjoint bytes');
  await commit(setup);
  const afterSourceChange = await facts(setup);
  expect(afterSourceChange['observationDigest']).not.toBe(beforeSourceChange);
  expect(
    (afterSourceChange['sources'] as { path: string; contentDigest: string }[]).find(
      (source) => source.path === other,
    )?.contentDigest,
  ).toBe(hashBytes('changed committed disjoint bytes'));
});

test('[TEST-AXES-111] multiple reported files retain sorted complete collection and union', async () => {
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
  expect(observed['collection']).toEqual([other, file]);
  expect(observed['report']).toEqual(setup.report);
  expect(
    (observed['memberships'] as { architecture: { files: string[] } }).architecture.files,
  ).toEqual([other, file]);
  expect((observed['sources'] as { path: string }[]).map((source) => source.path)).toEqual([
    manifestPath,
    architecturePath,
    other,
    file,
  ]);
});

test('[TEST-AXES-111] repeated selected path mode disagreement refuses', async () => {
  const setup = await prepare();
  fault(
    setup,
    '../inventory/read-blob.ts',
    `readSelectedBlob:(()=>{let count=0;return (...args)=>{const bytes=actual.readSelectedBlob(...args);if(args[3]===${JSON.stringify(file)} && ++count===3)args[1].find(entry=>entry.path===args[3]).mode='100755';return bytes;};})()`,
    'Browser Architecture same-path source disagreement',
  );
});
