import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { invokeCli } from '../invoke-cli';
import { buildPackage } from '../packaging/build';
import type { inspectBunTestReports } from './bun-test-reports';
import { hashBytes, hashCanonical } from './content-manifest';

type Observation = ReturnType<typeof inspectBunTestReports>;
function parseObservation(source: string): Observation {
  return JSON.parse(source) as Observation;
}

const scratch: string[] = [];
const projectRoot = 'libs/sqlite';
const file = `${projectRoot}/src/case.db.test.ts`;
const source =
  'import { test, expect } from "bun:test"; test("passing", () => expect(1).toBe(1)); test("failing", () => expect(1).toBe(2)); test.skip("skipping", () => {});';

function git(root: string, args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', root, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

function fixture(
  kind: 'regular' | 'missing' | 'symlink' = 'regular',
  manifestKind: 'regular' | 'missing' | 'malformed' | 'symlink' = 'regular',
) {
  const base = mkdtempSync(join(tmpdir(), 'burokrat-bun-reports-'));
  scratch.push(base);
  const root = join(base, 'candidate');
  const sentinelPath = join(base, 'selected-source-executed');
  const selectedSource = `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(sentinelPath)}, 'executed'); ${source}`;
  mkdirSync(join(root, projectRoot, 'src'), { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'user.name', 'Bun Report Fixture']);
  git(root, ['config', 'user.email', 'bun@example.invalid']);
  const manifest = Buffer.from(
    JSON.stringify({
      name: 'sqlite',
      targets: {
        'test:api': {
          executor: 'nx:run-commands',
          options: { command: 'bun test ./src/case.db.test.ts', cwd: projectRoot },
        },
      },
    }),
  );
  writeFileSync(join(root, projectRoot, 'project.json'), manifest);
  if (kind === 'regular') writeFileSync(join(root, file), selectedSource);
  if (kind === 'symlink') symlinkSync('../project.json', join(root, file));
  if (manifestKind === 'missing') rmSync(join(root, projectRoot, 'project.json'));
  if (manifestKind === 'malformed') writeFileSync(join(root, projectRoot, 'project.json'), '{');
  if (manifestKind === 'symlink') {
    rmSync(join(root, projectRoot, 'project.json'));
    symlinkSync('src/case.db.test.ts', join(root, projectRoot, 'project.json'));
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
  const reportPath = join(base, 'report.xml');
  const authorityPath = join(base, 'authority.json');
  const xml =
    '<testsuites><testsuite name="src/case.db.test.ts"><testcase name="passing" file="src/case.db.test.ts"/><testcase name="failing" file="src/case.db.test.ts"><failure message="intentional">failure</failure></testcase><testcase name="skipping" file="src/case.db.test.ts"><skipped/></testcase></testsuite></testsuites>';
  writeFileSync(reportPath, xml);
  const authority = {
    schemaVersion: 1,
    revision,
    candidate,
    projectRoot,
    projectManifest: { path: `${projectRoot}/project.json`, digest: hashBytes(manifest) },
    target: 'test:api',
    junit: { path: reportPath, digest: hashBytes(Buffer.from(xml)) },
  };
  const setup = {
    root,
    base,
    revision,
    reportPath,
    authorityPath,
    authority,
    sentinelPath,
    selectedSource,
  };
  publish(setup);
  return setup;
}

type Fixture = ReturnType<typeof fixture>;
function publish(setup: Fixture, xml?: string | Uint8Array): void {
  if (xml !== undefined) {
    writeFileSync(setup.reportPath, xml);
    setup.authority.junit.digest = hashBytes(typeof xml === 'string' ? Buffer.from(xml) : xml);
  }
  writeFileSync(setup.authorityPath, JSON.stringify(setup.authority));
}
async function inspect(setup: Fixture, revision = setup.revision) {
  return invokeCli(['inspect-bun-test-reports', setup.root, revision, setup.authorityPath]);
}
async function refuses(setup: Fixture, message: string, revision = setup.revision): Promise<void> {
  const invocation = await inspect(setup, revision);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain(message);
}
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

test('[TEST-AXES-150] Bun reports preserve all outcomes, selected sources, unresolved axes and complete digest', async () => {
  const setup = fixture();
  writeFileSync(join(setup.root, file), 'working-tree disagreement');
  const invocation = await inspect(setup);
  expect(invocation.exitCode).toBe(0);
  expect(invocation.stderr).toBe('');
  const observation = parseObservation(invocation.stdout);
  expect(observation.cases.map((entry: { status: string }) => entry.status).sort()).toEqual([
    'failed',
    'passed',
    'skipped',
  ]);
  for (const entry of observation.cases) {
    expect(entry.file).toBe(file);
    expect(entry.source).toEqual({
      mode: '100644',
      blob: git(setup.root, ['rev-parse', `${setup.revision}:${file}`]),
      contentDigest: hashBytes(Buffer.from(setup.selectedSource)),
    });
    expect(entry.level).toEqual({ kind: 'unresolved' });
    expect(entry.isolation).toEqual({ kind: 'unresolved' });
  }
  expect(observation.authentication).toEqual({ kind: 'absent' });
  expect(observation.certifies).toBe(false);
  expect(observation.target).toBe('test:api');
  expect(existsSync(setup.sentinelPath)).toBe(false);
  expect(observation.projectManifest.path).toBe(`${projectRoot}/project.json`);
  expect(observation.authority).toEqual({
    path: setup.authorityPath,
    digest: hashBytes(readFileSync(setup.authorityPath)),
  });
  expect(observation.junit).toEqual(setup.authority.junit);
  const { observationDigest, ...payload } = observation;
  expect(observationDigest).toBe(hashCanonical(payload));
});

test('[TEST-AXES-150] Bun reports parse real Bun JUnit pass fail and skip without executing selected code', async () => {
  const setup = fixture();
  const producer = join(setup.base, 'independent-producer');
  mkdirSync(join(producer, 'src'), { recursive: true });
  writeFileSync(join(producer, 'src/case.db.test.ts'), source);
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'test',
      './src/case.db.test.ts',
      '--reporter=junit',
      `--reporter-outfile=${setup.reportPath}`,
    ],
    { cwd: producer, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode).toBe(1);
  setup.authority.junit.digest = hashBytes(readFileSync(setup.reportPath));
  publish(setup);
  expect(existsSync(setup.sentinelPath)).toBe(false);
  const inspected = await inspect(setup);
  expect(inspected.exitCode).toBe(0);
  expect(existsSync(setup.sentinelPath)).toBe(false);
  expect(
    parseObservation(inspected.stdout)
      .cases.map((entry: { status: string }) => entry.status)
      .sort(),
  ).toEqual(['failed', 'passed', 'skipped']);
});

test('[TEST-AXES-151] Bun reports refuse symbolic and annotated object selections and authority revision drift', async () => {
  const setup = fixture();
  await refuses(setup, 'requires a full committed SHA', 'HEAD');
  git(setup.root, ['tag', '-a', 'annotated', '-m', 'tag']);
  await refuses(setup, 'selected revision differs', git(setup.root, ['rev-parse', 'annotated']));
  setup.authority.revision = '0'.repeat(40);
  publish(setup);
  await refuses(setup, 'authority revision differs');
});

test('[TEST-AXES-151] Bun reports refuse candidate manifest and report digest drift', async () => {
  for (const field of ['candidate', 'manifest', 'report'] as const) {
    const setup = fixture();
    if (field === 'candidate') setup.authority.candidate = '0'.repeat(64);
    if (field === 'manifest') setup.authority.projectManifest.digest = '0'.repeat(64);
    if (field === 'report') setup.authority.junit.digest = '0'.repeat(64);
    publish(setup);
    await refuses(setup, `${field} digest differs`);
  }
});

test('[TEST-AXES-151] Bun reports refuse missing and unreadable authority and report distinctly', async () => {
  for (const subject of ['authority', 'report'] as const) {
    for (const fault of ['missing', 'unreadable'] as const) {
      const setup = fixture();
      const path = subject === 'authority' ? setup.authorityPath : setup.reportPath;
      if (fault === 'missing') rmSync(path);
      else chmodSync(path, 0);
      await refuses(setup, `cannot open Bun report ${subject}`);
      if (fault === 'unreadable') chmodSync(path, 0o600);
    }
  }
});

test('[TEST-AXES-151] Bun reports refuse malformed UTF8 JSON XML schemas and contradictory outcomes', async () => {
  for (const [fault, message] of [
    ['authority-utf8', 'authority is not UTF-8'],
    ['authority-json', 'authority JSON is malformed'],
    ['version', 'schemaVersion'],
    ['unknown', 'unexpected'],
    ['nested-unknown', 'unexpected'],
    ['manifest-unknown', 'unexpected'],
    ['xml', 'JUnit'],
    ['report-utf8', 'report is not UTF-8'],
    ['outcomes', 'duplicate outcome'],
    ['repeated-failure', 'duplicate outcome'],
    ['repeated-skipped', 'duplicate outcome'],
  ] as const) {
    const setup = fixture();
    if (fault === 'authority-utf8') writeFileSync(setup.authorityPath, Buffer.from([255]));
    if (fault === 'authority-json') writeFileSync(setup.authorityPath, '{');
    if (fault === 'version')
      writeFileSync(setup.authorityPath, JSON.stringify({ ...setup.authority, schemaVersion: 2 }));
    if (fault === 'unknown')
      writeFileSync(setup.authorityPath, JSON.stringify({ ...setup.authority, unexpected: true }));
    if (fault === 'nested-unknown')
      writeFileSync(
        setup.authorityPath,
        JSON.stringify({
          ...setup.authority,
          junit: { ...setup.authority.junit, unexpected: true },
        }),
      );
    if (fault === 'manifest-unknown')
      writeFileSync(
        setup.authorityPath,
        JSON.stringify({
          ...setup.authority,
          projectManifest: { ...setup.authority.projectManifest, unexpected: true },
        }),
      );
    if (fault === 'xml') publish(setup, '<testsuites><testcase></testsuites>');
    if (fault === 'report-utf8') publish(setup, Buffer.from([255]));
    if (fault === 'outcomes')
      publish(
        setup,
        '<testsuites><testsuite><testcase name="bad" file="src/case.db.test.ts"><failure/><skipped/></testcase></testsuite></testsuites>',
      );
    if (fault === 'repeated-failure')
      publish(
        setup,
        '<testsuites><testsuite><testcase name="bad" file="src/case.db.test.ts"><failure/><failure/></testcase></testsuite></testsuites>',
      );
    if (fault === 'repeated-skipped')
      publish(
        setup,
        '<testsuites><testsuite><testcase name="bad" file="src/case.db.test.ts"><skipped/><skipped/></testcase></testsuite></testsuites>',
      );
    await refuses(setup, message);
  }
});

test('[TEST-AXES-151] Bun reports refuse external path aliases symlinks and interior artifacts', async () => {
  for (const fault of ['alias', 'symlink', 'interior', 'relative'] as const) {
    const setup = fixture();
    if (fault === 'alias')
      setup.authority.junit.path = join(setup.base, 'absent', '..', 'report.xml').replace(
        '/report.xml',
        '/./report.xml',
      );
    if (fault === 'relative') setup.authority.junit.path = 'report.xml';
    if (fault === 'symlink') {
      const alias = join(setup.base, 'alias.xml');
      symlinkSync(setup.reportPath, alias);
      setup.authority.junit.path = alias;
    }
    if (fault === 'interior') {
      const inside = join(setup.root, 'report.xml');
      writeFileSync(inside, readFileSync(setup.reportPath));
      setup.authority.junit.path = inside;
    }
    publish(setup);
    await refuses(setup, fault === 'interior' ? 'resolves inside selected candidate' : 'canonical');
  }
});

test('[TEST-AXES-151] Bun reports refuse missing nonregular and noncanonical source despite repair', async () => {
  for (const kind of ['missing', 'symlink'] as const) {
    const setup = fixture(kind);
    if (kind === 'symlink') rmSync(join(setup.root, file));
    writeFileSync(join(setup.root, file), source);
    await refuses(setup, 'source is not a regular committed blob');
  }
  for (const path of [
    '../case.db.test.ts',
    '/case.db.test.ts',
    './src/case.db.test.ts',
    'src/../case.db.test.ts',
  ]) {
    const setup = fixture();
    publish(
      setup,
      `<testsuites><testsuite><testcase name="escaping" file="${path}"/></testsuite></testsuites>`,
    );
    await refuses(setup, 'canonical project-relative');
  }
});

test('[TEST-AXES-151] Bun reports refuse missing target and manifest substitution', async () => {
  const setup = fixture();
  for (const target of ['test:missing', 'toString']) {
    setup.authority.target = target;
    publish(setup);
    await refuses(setup, 'target is absent');
  }
  setup.authority.target = 'test:api';
  setup.authority.projectManifest.path = `${projectRoot}/other.json`;
  publish(setup);
  await refuses(setup, 'manifest path differs');
});

test('[TEST-AXES-152] Bun reports refuse equal conflicting duplicate identities and bind order outcome provenance', async () => {
  const setup = fixture();
  const wrap = (cases: string) => `<testsuites><testsuite>${cases}</testsuite></testsuites>`;
  const pass = '<testcase name="same" file="src/case.db.test.ts"/>';
  const fail = '<testcase name="same" file="src/case.db.test.ts"><failure/></testcase>';
  for (const second of [pass, fail]) {
    publish(setup, wrap(pass + second));
    await refuses(setup, 'duplicate case identity');
  }
  publish(setup, wrap(pass));
  const passing = parseObservation((await inspect(setup)).stdout);
  publish(setup, wrap(fail));
  const failing = parseObservation((await inspect(setup)).stdout);
  expect(passing.cases[0].caseId).toBe(failing.cases[0].caseId);
  expect(passing.observationDigest).not.toBe(failing.observationDigest);
  const other = '<testcase name="other" file="src/case.db.test.ts"/>';
  publish(setup, wrap(pass + other));
  const forward = parseObservation((await inspect(setup)).stdout);
  publish(setup, wrap(other + pass));
  const reverse = parseObservation((await inspect(setup)).stdout);
  expect(forward.cases).toEqual(reverse.cases);
  expect(forward.observationDigest).not.toBe(reverse.observationDigest); // Raw report and authority provenance differ.
});

test('[TEST-AXES-151] Bun reports refuse malformed CLI operands', async () => {
  const setup = fixture();
  for (const args of [
    [],
    [setup.root],
    [setup.root, setup.revision],
    [setup.root, setup.revision, setup.authorityPath, 'extra'],
  ]) {
    const invocation = await invokeCli(['inspect-bun-test-reports', ...args]);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('usage: twilight-burokrat inspect-bun-test-reports');
  }
});

test('[TEST-AXES-151] Bun reports refuse authority path aliases symlinks and interior authority', async () => {
  for (const fault of ['alias', 'symlink', 'interior'] as const) {
    const setup = fixture();
    const path =
      fault === 'alias'
        ? `${setup.base}/./authority.json`
        : fault === 'symlink'
          ? join(setup.base, 'authority-link.json')
          : join(setup.root, 'authority.json');
    if (fault === 'symlink') symlinkSync(setup.authorityPath, path);
    if (fault === 'interior') writeFileSync(path, readFileSync(setup.authorityPath));
    const invocation = await invokeCli([
      'inspect-bun-test-reports',
      setup.root,
      setup.revision,
      path,
    ]);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(
      fault === 'interior' ? 'resolves inside selected candidate' : 'canonical',
    );
  }
});

test('[TEST-AXES-151] Bun reports refuse missing malformed and nonregular committed manifests despite working repair', async () => {
  for (const kind of ['missing', 'malformed', 'symlink'] as const) {
    const setup = fixture('regular', kind);
    const path = join(setup.root, projectRoot, 'project.json');
    if (kind === 'symlink') rmSync(path);
    writeFileSync(path, JSON.stringify({ name: 'sqlite', targets: { 'test:api': {} } }));
    if (kind === 'malformed') {
      setup.authority.projectManifest.digest = hashBytes(Buffer.from('{'));
      publish(setup);
    }
    await refuses(
      setup,
      kind === 'malformed'
        ? 'manifest JSON is malformed'
        : 'manifest is not a regular committed blob',
    );
  }
});

test('[TEST-AXES-152] Bun reports installed executable preserves dependency closure outcomes arity and exit', async () => {
  const setup = fixture();
  const packageRoot = join(setup.base, 'package');
  await buildPackage(packageRoot);
  const executable = join(packageRoot, 'dist/bin.mjs');
  const spawn = (args: string[]) =>
    Bun.spawnSync([process.execPath, executable, 'inspect-bun-test-reports', ...args], {
      cwd: setup.base,
      stdout: 'pipe',
      stderr: 'pipe',
    });
  const observed = spawn([setup.root, setup.revision, setup.authorityPath]);
  expect(observed.exitCode, observed.stderr.toString()).toBe(0);
  expect(observed.stdout.toString()).toBe((await inspect(setup)).stdout);
  expect(existsSync(setup.sentinelPath)).toBe(false);
  const unsupported = spawn([]);
  expect(unsupported.exitCode).toBe(1);
  expect(unsupported.stdout.toString()).toBe('');
  expect(unsupported.stderr.toString()).toContain(
    'usage: twilight-burokrat inspect-bun-test-reports',
  );
  setup.authority.candidate = '0'.repeat(64);
  publish(setup);
  const refused = spawn([setup.root, setup.revision, setup.authorityPath]);
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout.toString()).toBe('');
  expect(refused.stderr.toString()).toContain('candidate digest differs');
}, 120_000);

test('[TEST-AXES-151] Bun reports refuse committed reader selection disagreement through production dispatch', () => {
  for (const fault of ['staged', 'revision'] as const) {
    const setup = fixture();
    const modulePath = join(import.meta.dir, '../inventory/read-candidate.ts');
    const preload = join(setup.base, 'reader-fault.ts');
    writeFileSync(
      preload,
      `import {mock} from 'bun:test';
const actual=await import(${JSON.stringify(`${modulePath}?actual`)});
mock.module(${JSON.stringify(modulePath)},()=>({...actual,readCandidate:(...args)=>{const selected=actual.readCandidate(...args); selected.selection=${fault === 'staged' ? "{kind:'staged',base:args[1].revision}" : "{kind:'committed',revision:'0'.repeat(40)}"}; return selected;}}));`,
    );
    const invocation = Bun.spawnSync(
      [
        process.execPath,
        'run',
        `--preload=${preload}`,
        join(import.meta.dir, '../cli.ts'),
        'inspect-bun-test-reports',
        setup.root,
        setup.revision,
        setup.authorityPath,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout.toString()).toBe('');
    expect(invocation.stderr.toString()).toContain(
      fault === 'staged' ? 'selection is not committed' : 'selected revision differs',
    );
  }
});

test('[TEST-AXES-150] Bun reports preserve real nested same-leaf title ancestry', async () => {
  const setup = fixture();
  const producer = join(setup.base, 'nested-producer');
  mkdirSync(join(producer, 'src'), { recursive: true });
  writeFileSync(
    join(producer, 'src/case.db.test.ts'),
    `import {describe,test,expect} from 'bun:test'; describe('a',()=>{describe('inner',()=>test('works',()=>expect(1).toBe(1)))});describe('b',()=>test('works',()=>expect(1).toBe(1)));`,
  );
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'test',
      './src/case.db.test.ts',
      '--reporter=junit',
      `--reporter-outfile=${setup.reportPath}`,
    ],
    { cwd: producer, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode).toBe(0);
  setup.authority.junit.digest = hashBytes(readFileSync(setup.reportPath));
  publish(setup);
  const observed = await inspect(setup);
  expect(observed.exitCode, observed.stderr).toBe(0);
  const cases = parseObservation(observed.stdout).cases;
  expect(cases.map((entry: { titlePath: string[] }) => entry.titlePath)).toEqual([
    ['a', 'inner', 'works'],
    ['b', 'works'],
  ]);
  expect(new Set(cases.map((entry: { caseId: string }) => entry.caseId)).size).toBe(2);
  expect(existsSync(setup.sentinelPath)).toBe(false);
  const prior = cases[0].caseId;
  publish(setup, readFileSync(setup.reportPath, 'utf8').replace('name="inner"', 'name="moved"'));
  expect(parseObservation((await inspect(setup)).stdout).cases[0].caseId).not.toBe(prior);
});

test('[TEST-AXES-151] Bun reports refuse malformed selected manifest and project root shapes', async () => {
  for (const manifest of [
    { targets: { 'test:api': {} } },
    { name: 'sqlite', targets: null },
    { name: 'sqlite', targets: [] },
    { name: 'sqlite', targets: { 'test:api': null } },
  ]) {
    const setup = fixture();
    const bytes = Buffer.from(JSON.stringify(manifest));
    writeFileSync(join(setup.root, projectRoot, 'project.json'), bytes);
    git(setup.root, ['add', '.']);
    git(setup.root, ['commit', '-m', 'malformed manifest']);
    setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
    const selected = readCandidate(setup.root, { kind: 'committed', revision: setup.revision });
    setup.authority.revision = setup.revision;
    setup.authority.candidate = hashCanonical({
      selection: selected.selection,
      entries: selected.entries,
      untracked: selected.untracked,
    });
    setup.authority.projectManifest.digest = hashBytes(bytes);
    publish(setup);
    await refuses(
      setup,
      Object.hasOwn(manifest, 'name')
        ? 'test:api' in (manifest.targets ?? {})
          ? 'target is malformed'
          : 'targets is malformed'
        : 'name',
    );
  }
  const setup = fixture();
  setup.authority.projectRoot = 'libs/../sqlite';
  publish(setup);
  await refuses(setup, 'projectRoot');
  publish(
    setup,
    '<testsuites><testsuite><testsuite><testcase name="bad" file="src/case.db.test.ts"/></testsuite></testsuite></testsuites>',
  );
  setup.authority.projectRoot = projectRoot;
  publish(setup);
  await refuses(setup, 'nested suite name is absent');
});

test('[TEST-AXES-151] Bun reports refuse missing and malformed closed authority pins', async () => {
  for (const fault of [
    'revision',
    'candidate',
    'manifest-digest',
    'report-digest',
    'target',
    'manifest-path',
    'project-root',
    'junit-path',
  ]) {
    const setup = fixture();
    const authority: Record<string, unknown> = { ...setup.authority };
    if (fault === 'revision') authority['revision'] = 'bad';
    if (fault === 'candidate') authority['candidate'] = 'bad';
    if (fault === 'target') authority['target'] = '';
    if (fault === 'project-root') authority['projectRoot'] = '.';
    if (fault === 'manifest-path')
      authority['projectManifest'] = {
        ...setup.authority.projectManifest,
        path: '../project.json',
      };
    if (fault === 'manifest-digest')
      authority['projectManifest'] = { ...setup.authority.projectManifest, digest: 'bad' };
    if (fault === 'report-digest') authority['junit'] = { ...setup.authority.junit, digest: 'bad' };
    if (fault === 'junit-path') authority['junit'] = { ...setup.authority.junit, path: 0 };
    writeFileSync(setup.authorityPath, JSON.stringify(authority));
    await refuses(setup, 'must be');
  }
  for (const field of Object.keys(fixture().authority)) {
    const setup = fixture();
    const authority: Record<string, unknown> = { ...setup.authority };
    Reflect.deleteProperty(authority, field);
    writeFileSync(setup.authorityPath, JSON.stringify(authority));
    await refuses(setup, 'must be');
  }
});
