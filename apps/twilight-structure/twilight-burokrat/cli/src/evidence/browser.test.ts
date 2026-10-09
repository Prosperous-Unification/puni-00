import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { digestEvidenceBytes } from '@shared/test-evidence';
import { afterEach, expect, test } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { registeredRules } from '../rules/registry';
import { checkArtifactInventory, inspectBrowserBundle } from './browser';
import { hashCanonical } from './content-manifest';

const scratch: string[] = [];
const mode = 'ordinary';
const invocationId = '11111111-1111-4111-8111-111111111111';
const owner = '22222222-2222-4222-8222-222222222222';
const config = 'playwright.config.ts';
const file = 'case.spec.ts';
const title = 'example runs';

function git(root: string, args: string[]): string {
  const call = Bun.spawnSync(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (call.exitCode !== 0) throw new Error(call.stderr.toString());
  return call.stdout.toString().trim();
}

function fixture(): {
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
  writeFileSync(join(root, config), 'export default {}\n');
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
    `<testsuites tests="1" failures="0" errors="0" skipped="0"><testsuite name="${file}" hostname="chromium"><testcase name="${title}" classname="${file}"/></testsuite></testsuites>`,
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

function inspect(setup: ReturnType<typeof fixture>) {
  return inspectBrowserBundle(setup.root, setup.revision, setup.policyPath, mode);
}

function invokeInspect(setup: ReturnType<typeof fixture>): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'run',
      join(import.meta.dir, '..', 'cli.ts'),
      'inspect-browser',
      setup.root,
      setup.revision,
      setup.policyPath,
      mode,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  return {
    exitCode: invocation.exitCode,
    stdout: invocation.stdout.toString(),
    stderr: invocation.stderr.toString(),
  };
}

test('diagnoses exact Browser observations while withholding authentication and coverage', () => {
  const setup = fixture();
  const report = inspect(setup);
  expect(report.observedCases).toHaveLength(1);
  expect(report.authentication).toEqual({ kind: 'absent' });
  expect(report.certifies).toBe(false);
  expect(Object.hasOwn(report, 'verifiedCoverage')).toBe(false);
});

test('prints only diagnostic observations through the production CLI', () => {
  const setup = fixture();
  const cli = join(import.meta.dir, '..', 'cli.ts');
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'run',
      cli,
      'inspect-browser',
      setup.root,
      setup.revision,
      setup.policyPath,
      mode,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
  const output = JSON.parse(invocation.stdout.toString()) as Record<string, unknown>;
  expect(output['authentication']).toEqual({ kind: 'absent' });
  expect(output['certifies']).toBe(false);
  expect(Object.hasOwn(output, 'verifiedCoverage')).toBe(false);
  const staged = Bun.spawnSync(
    [process.execPath, 'run', cli, 'inspect-browser', setup.root, 'staged', setup.policyPath, mode],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(staged.exitCode).toBe(1);
});

test('production CLI refuses missing, malformed, old-object and foreign candidate digests', () => {
  const setup = fixture();
  const candidate = setup.manifest['candidate'];
  for (const [value, diagnostic] of [
    [undefined, 'Browser candidate is malformed'],
    ['not-a-sha256', 'Browser candidate digest is malformed'],
    [{ candidate }, 'Browser candidate is malformed'],
    ['0'.repeat(64), 'Browser candidate identity differs from committed selection'],
  ] as const) {
    if (value === undefined) delete setup.manifest['candidate'];
    else setup.manifest['candidate'] = value;
    writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
    const inspection = invokeInspect(setup);
    expect(inspection.exitCode).toBe(1);
    expect(inspection.stderr).toContain(diagnostic);
    expect(inspection.stdout).toBe('');
  }
});

test('production CLI refuses a changed manifest revision even with the exact candidate digest', () => {
  const setup = fixture();
  setup.manifest['revision'] = '0'.repeat(40);
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  const inspection = invokeInspect(setup);
  expect(inspection.exitCode).toBe(1);
  expect(inspection.stderr).toContain('Browser manifest revision differs from committed selection');
  expect(inspection.stdout).toBe('');
});

test('production CLI distinguishes an empty descendant with the same tree from its parent digest', () => {
  const setup = fixture();
  const oldTree = git(setup.root, ['rev-parse', `${setup.revision}^{tree}`]);
  git(setup.root, ['commit', '--allow-empty', '-m', 'same tree, new selection']);
  setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
  expect(git(setup.root, ['rev-parse', `${setup.revision}^{tree}`])).toBe(oldTree);
  setup.manifest['revision'] = setup.revision;
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  const inspection = invokeInspect(setup);
  expect(inspection.exitCode).toBe(1);
  expect(inspection.stderr).toContain(
    'Browser candidate identity differs from committed selection',
  );
  expect(inspection.stdout).toBe('');
});

test('refuses stale generation, changed pointer, missing bundle and symlink files', () => {
  const setup = fixture();
  writeFileSync(join(setup.root, 'tmp/junit/browser/ordinary.latest-request'), 'another');
  expect(() => inspect(setup)).toThrow('token differs');
  writeFileSync(join(setup.root, 'tmp/junit/browser/ordinary.latest-request'), owner);
  rmSync(join(setup.bundle, 'execution.json'));
  expect(() => inspect(setup)).toThrow();
  const other = join(setup.root, 'other.json');
  writeFileSync(other, '{}');
  symlinkSync(other, join(setup.bundle, 'execution.json'));
  expect(() => inspect(setup)).toThrow('symlink');
});

test('refuses raw byte, manifest case and normalized JUnit mismatches', () => {
  const setup = fixture();
  const rawPath = join(setup.bundle, 'discovery.json');
  const original = readFileSync(rawPath);
  writeFileSync(rawPath, Buffer.from([0xff]));
  expect(() => inspect(setup)).toThrow('raw discovery digest');
  writeFileSync(rawPath, original);
  const changed = structuredClone(setup.manifest);
  const cases = changed['cases'];
  if (!Array.isArray(cases) || cases[0] === undefined) throw new Error('fixture cases missing');
  Reflect.set(cases[0], 'status', 'failed');
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(changed));
  expect(() => inspect(setup)).toThrow('manifest cases differ');
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  const reportPath = join(setup.bundle, 'report.xml');
  const invalid =
    '<testsuite name="browser.ordinary" tests="1" failures="0" errors="0" skipped="0"><testcase classname="chromium" name="other" file="case.spec.ts"/></testsuite>';
  writeFileSync(reportPath, invalid);
  setup.manifest['reportDigest'] = digestEvidenceBytes(invalid);
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  expect(() => inspect(setup)).toThrow('normalized JUnit cases differ');
});

test('inspect-browser refuses contradictory raw JUnit outcomes even when counts and JSON agree', () => {
  const setup = fixture();
  const discoveryPath = join(setup.bundle, 'discovery.json');
  const executionPath = join(setup.bundle, 'execution.json');
  const discovery = JSON.parse(readFileSync(discoveryPath, 'utf8')) as {
    suites: {
      specs: {
        file: string;
        title: string;
        tests: { projectName: string; status: string; results: unknown[] }[];
      }[];
    }[];
  };
  const execution = JSON.parse(readFileSync(executionPath, 'utf8')) as typeof discovery;
  const skipped = 'opted out';
  discovery.suites[0]?.specs.push({
    file,
    title: skipped,
    tests: [{ projectName: 'chromium', status: 'skipped', results: [] }],
  });
  execution.suites[0]?.specs.push({
    file,
    title: skipped,
    tests: [{ projectName: 'chromium', status: 'skipped', results: [] }],
  });
  const discoveryBytes = Buffer.from(JSON.stringify(discovery));
  const executionBytes = Buffer.from(JSON.stringify(execution));
  writeFileSync(discoveryPath, discoveryBytes);
  writeFileSync(executionPath, executionBytes);
  const rawJunit = Buffer.from(
    `<testsuites tests="2" failures="0" errors="0" skipped="1"><testsuite name="${file}" hostname="chromium"><testcase name="${title}" classname="${file}"/><testcase name="${skipped}" classname="${file}"><failure/><skipped/></testcase></testsuite></testsuites>`,
  );
  const normalized = Buffer.from(
    `<testsuite name="browser.ordinary" tests="2" failures="0" errors="0" skipped="1"><testcase classname="chromium" name="${title}" file="${file}"/><testcase classname="chromium" name="${skipped}" file="${file}"><skipped/></testcase></testsuite>`,
  );
  writeFileSync(join(setup.bundle, 'playwright.xml'), rawJunit);
  writeFileSync(join(setup.bundle, 'report.xml'), normalized);
  const raw = setup.manifest['raw'] as {
    discovery: { digest: string };
    execution: { digest: string };
    junit: { digest: string };
  };
  raw.discovery.digest = digestEvidenceBytes(discoveryBytes);
  raw.execution.digest = digestEvidenceBytes(executionBytes);
  raw.junit.digest = digestEvidenceBytes(rawJunit);
  setup.manifest['reportDigest'] = digestEvidenceBytes(normalized);
  setup.manifest['cases'] = [
    { config, project: 'chromium', file, titlePath: [title], status: 'passed' },
    { config, project: 'chromium', file, titlePath: [skipped], status: 'skipped' },
  ];
  setup.manifest['coverage'] = { passingCases: 1, skippedDebt: 1 };
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  const cli = join(import.meta.dir, '..', 'cli.ts');
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'run',
      cli,
      'inspect-browser',
      setup.root,
      setup.revision,
      setup.policyPath,
      mode,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stderr.toString()).toContain('duplicate outcome');
});

test('requires external mode/config authority and committed candidate blob', () => {
  const setup = fixture();
  const policy = JSON.parse(readFileSync(setup.policyPath, 'utf8')) as Record<string, unknown>;
  delete policy['browser'];
  writeFileSync(setup.policyPath, JSON.stringify(policy));
  expect(() => inspect(setup)).toThrow('external policy pin');
  policy['browser'] = {
    modes: [{ mode, config, configDigest: '0'.repeat(64), projects: ['chromium'] }],
  };
  writeFileSync(setup.policyPath, JSON.stringify(policy));
  expect(() => inspect(setup)).toThrow('config differs from policy');
});

test('refuses a committed candidate without the pinned config blob', () => {
  const setup = fixture();
  git(setup.root, ['rm', config]);
  git(setup.root, ['commit', '-m', 'remove pinned Browser config']);
  setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
  expect(() => inspect(setup)).toThrow('candidate config is not a regular blob');
});

test('refuses a bundle directory in place of the manifest file', () => {
  const setup = fixture();
  const manifestPath = join(setup.bundle, 'manifest.json');
  rmSync(manifestPath);
  mkdirSync(manifestPath);
  expect(() => inspect(setup)).toThrow('evidence is not a regular file');
});

test('refuses pointer and token changes across its immutable bundle read', () => {
  const setup = fixture();
  const pointer = join(setup.root, 'tmp/junit/browser/ordinary.current.json');
  expect(() =>
    inspectBrowserBundle(setup.root, setup.revision, setup.policyPath, mode, {
      afterBundleRead: () => {
        writeFileSync(pointer, `${readFileSync(pointer, 'utf8')} `);
      },
    }),
  ).toThrow('pointer changed');
  const second = fixture();
  expect(() =>
    inspectBrowserBundle(second.root, second.revision, second.policyPath, mode, {
      afterBundleRead: () => {
        writeFileSync(join(second.root, 'tmp/junit/browser/ordinary.owner'), 'revoked');
      },
    }),
  ).toThrow('token changed');
});

test('refuses non-UTF-8 raw JSON even when the manifest digest is updated', () => {
  const setup = fixture();
  const invalid = Buffer.from([0xff]);
  writeFileSync(join(setup.bundle, 'discovery.json'), invalid);
  const raw = setup.manifest['raw'] as { discovery: { digest: string } };
  raw.discovery.digest = digestEvidenceBytes(invalid);
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  expect(() => inspect(setup)).toThrow('not UTF-8');
});

test('refuses a traversing bundle pointer and malformed normalized XML structure', () => {
  const setup = fixture();
  const pointerPath = join(setup.root, 'tmp/junit/browser/ordinary.current.json');
  const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as Record<string, unknown>;
  pointer['bundle'] = '../escape';
  writeFileSync(pointerPath, JSON.stringify(pointer));
  expect(() => inspect(setup)).toThrow('pointer identity');
  pointer['bundle'] = `tmp/junit/browser/${invocationId}`;
  writeFileSync(pointerPath, JSON.stringify(pointer));
  const invalid =
    '<testsuite name="browser.ordinary" tests="1" failures="0" errors="0" skipped="0"><nested><testcase classname="chromium" name="example runs" file="case.spec.ts"/></nested></testsuite>';
  writeFileSync(join(setup.bundle, 'report.xml'), invalid);
  setup.manifest['reportDigest'] = digestEvidenceBytes(invalid);
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  expect(() => inspect(setup)).toThrow('structure is malformed');
});

test('refuses a normalized XML doctype even with an updated report digest', () => {
  const setup = fixture();
  const reportPath = join(setup.bundle, 'report.xml');
  const invalid = `<!DOCTYPE testsuite>${readFileSync(reportPath, 'utf8')}`;
  writeFileSync(reportPath, invalid);
  setup.manifest['reportDigest'] = digestEvidenceBytes(invalid);
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  expect(() => inspect(setup)).toThrow('doctype');
});

test('checks packaged and portable served inventory path and digest claims', () => {
  for (const [selectedMode, root, artifact] of [
    ['packaged', 'dist/apps/wbs/fe-01', 'dist/apps/wbs/fe-01/index.html'],
    [
      'portable',
      'dist/libs/wbs/application/core',
      'dist/libs/wbs/application/core/portable-composition.js',
    ],
  ] as const) {
    const manifest: Record<string, unknown> = {
      artifact: { path: artifact, digest: 'a'.repeat(64) },
      served: { root, files: [{ path: artifact, digest: 'a'.repeat(64) }] },
    };
    expect(() => {
      checkArtifactInventory(manifest, selectedMode);
    }).not.toThrow();
    manifest['served'] = { root, files: [{ path: '../escape', digest: 'a'.repeat(64) }] };
    expect(() => {
      checkArtifactInventory(manifest, selectedMode);
    }).toThrow();
    manifest['served'] = { root, files: [{ path: artifact, digest: 'b'.repeat(64) }] };
    expect(() => {
      checkArtifactInventory(manifest, selectedMode);
    }).toThrow('digest differ');
    manifest['served'] = {
      root,
      files: [
        { path: artifact, digest: 'a'.repeat(64) },
        { path: artifact, digest: 'a'.repeat(64) },
      ],
    };
    expect(() => {
      checkArtifactInventory(manifest, selectedMode);
    }).toThrow('duplicated');
  }
});

test('refuses a manifest environment that does not match Browser mode selection', () => {
  const setup = fixture();
  setup.manifest['environment'] = { CI: '1', E2E_PORT_SHIFT: '0', PLAYWRIGHT_GREP: 'one case' };
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  expect(() => inspect(setup)).toThrow('unknown keys');
});

test('refuses an execution with only skipped Browser cases', () => {
  const setup = fixture();
  const path = join(setup.bundle, 'execution.json');
  const execution = JSON.parse(readFileSync(path, 'utf8')) as {
    suites: { specs: { tests: { status: string; results: unknown[] }[] }[] }[];
  };
  execution.suites[0].specs[0].tests[0].status = 'skipped';
  execution.suites[0].specs[0].tests[0].results = [];
  const bytes = Buffer.from(JSON.stringify(execution));
  writeFileSync(path, bytes);
  const raw = setup.manifest['raw'] as { execution: { digest: string } };
  raw.execution.digest = digestEvidenceBytes(bytes);
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  expect(() => inspect(setup)).toThrow('only skipped');
});
