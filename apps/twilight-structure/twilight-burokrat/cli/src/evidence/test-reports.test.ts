import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { digestEvidenceBytes } from '@shared/test-evidence';
import { afterEach, expect, test } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { registeredRules } from '../rules/registry';
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

function inspect(setup: ReturnType<typeof fixture>): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const call = Bun.spawnSync(
    [
      process.execPath,
      'run',
      join(import.meta.dir, '..', 'cli.ts'),
      'inspect-test-reports',
      setup.root,
      setup.revision,
      setup.policyPath,
      mode,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  return {
    exitCode: call.exitCode,
    stdout: call.stdout.toString(),
    stderr: call.stderr.toString(),
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
  const playwright = `<testsuites tests="${total}" failures="${failures}" errors="0" skipped="${skipped}"><testsuite name="${caseFile}" hostname="chromium">${observations.map((observation) => `<testcase name="${observation.title}" classname="${caseFile}">${outcomeXml(observation.status)}</testcase>`).join('')}</testsuite></testsuites>`;
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

function observation(setup: ReturnType<typeof fixture>): Record<string, unknown> {
  const call = inspect(setup);
  expect(call.exitCode, call.stderr).toBe(0);
  return JSON.parse(call.stdout) as Record<string, unknown>;
}

test('[TEST-AXES-042] production CLI binds a committed case source and provenance without credit', () => {
  const setup = fixture();
  const report = observation(setup);
  const cases = report['cases'] as {
    caseId: string;
    source: { mode: string; contentDigest: string };
    status: string;
  }[];
  expect(report['schemaVersion']).toBe(1);
  expect(report['revision']).toBe(setup.revision);
  expect(report['candidate']).toBe(setup.manifest['candidate']);
  expect(report['mode']).toBe(mode);
  expect(report['invocationId']).toBe(invocationId);
  expect(cases).toHaveLength(1);
  expect(cases[0]?.caseId).toBe(hashCanonical([config, 'chromium', file, [title]]));
  expect(cases[0]?.source).toEqual({
    mode: '100644',
    contentDigest: digestEvidenceBytes('test("example runs", () => {});\n'),
  });
  expect(cases[0]?.status).toBe('passed');
  expect(report['authentication']).toEqual({ kind: 'absent' });
  expect(report['certifies']).toBe(false);
  for (const credit of ['coverage', 'verifiedCoverage', 'scenarioCoverage', 'admission'])
    expect(Object.hasOwn(report, credit)).toBe(false);
  const { observationDigest, ...payload } = report;
  expect(observationDigest).toBe(hashCanonical(payload));
});

test('[TEST-AXES-042] nested Browser titles retain the full ordered title path', () => {
  const setup = fixture();
  const prefix = 'parent suite';
  const bindings = setup.manifest['raw'] as {
    discovery: { digest: string };
    execution: { digest: string };
    junit: { digest: string };
  };
  for (const [name, binding] of [
    ['discovery.json', bindings.discovery],
    ['execution.json', bindings.execution],
  ] as const) {
    const path = join(setup.bundle, name);
    const document = JSON.parse(readFileSync(path, 'utf8')) as {
      suites: { file: string; specs: unknown[]; suites?: unknown[] }[];
    };
    const suite = document.suites.at(0);
    if (suite === undefined) throw new Error('fixture suite missing');
    suite.suites = [{ file, title: prefix, specs: suite.specs }];
    suite.specs = [];
    const source = JSON.stringify(document);
    writeFileSync(path, source);
    binding.digest = digestEvidenceBytes(source);
  }
  for (const [name, update] of [
    [
      'playwright.xml',
      (digest: string) => {
        bindings.junit.digest = digest;
      },
    ],
    [
      'report.xml',
      (digest: string) => {
        setup.manifest['reportDigest'] = digest;
      },
    ],
  ] as const) {
    const path = join(setup.bundle, name);
    const original = readFileSync(path, 'utf8');
    const source = original.replace(`name="${title}"`, `name="${prefix} › ${title}"`);
    expect(source).not.toBe(original);
    writeFileSync(path, source);
    update(digestEvidenceBytes(source));
  }
  setup.manifest['cases'] = [
    {
      config,
      project: 'chromium',
      file,
      titlePath: [prefix, title],
      status: 'passed',
    },
  ];
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  const report = observation(setup);
  const cases = report['cases'] as { caseId: string; titlePath: string[] }[];
  expect(cases[0]?.titlePath).toEqual([prefix, title]);
  expect(cases[0]?.caseId).toBe(hashCanonical([config, 'chromium', file, [prefix, title]]));
});

test('[TEST-AXES-043] missing committed case source refuses even if a working file exists', () => {
  const setup = fixture('missing');
  writeFileSync(join(setup.root, file), 'working tree is not committed\n');
  const call = inspect(setup);
  expect(call.exitCode, `${call.stdout} ${call.stderr}`).toBe(1);
  expect(call.stdout).toBe('');
  expect(call.stderr).toContain(
    'test report case source is not a regular committed blob: case.spec.ts',
  );
});

test('[TEST-AXES-043] nonregular committed case source refuses', () => {
  const call = inspect(fixture('symlink'));
  expect(call.exitCode).toBe(1);
  expect(call.stdout).toBe('');
  expect(call.stderr).toContain(
    'test report case source is not a regular committed blob: case.spec.ts',
  );
});

test('[TEST-AXES-043] escaping case source refuses before any selected blob read', () => {
  const setup = fixture();
  publishCases(setup, [{ title, status: 'passed' }], '../escape.spec.ts');
  const call = inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stdout).toBe('');
  expect(call.stderr).toContain('path is not a normalized workspace path');
});

test.each([
  ['equal', ['passed', 'passed']],
  ['differing', ['passed', 'failed']],
] as const)(
  '[TEST-AXES-044] duplicated source identity refuses with %s outcomes',
  (_, statuses) => {
    const setup = fixture();
    // Proof: removing the shared Browser decoder's duplicate-selection dependency made both
    // production CLI assertions fail on a later "Browser JUnit identity is ambiguous" refusal.
    // The downstream adapter intentionally has no unreachable duplicate guard.
    publishCases(
      setup,
      statuses.map((status) => ({ title, status })),
    );
    const call = inspect(setup);
    expect(call.exitCode).toBe(1);
    expect(call.stdout).toBe('');
    expect(call.stderr).toContain('Browser case selection is empty or duplicated');
  },
);

test('[TEST-AXES-045] failed and skipped observations remain noncertifying outcomes', () => {
  const setup = fixture();
  publishCases(setup, [
    { title, status: 'failed' },
    { title: 'opted out', status: 'skipped' },
  ]);
  const report = observation(setup);
  const cases = report['cases'] as { status: string }[];
  expect(cases.map((entry) => entry.status)).toEqual(['failed', 'skipped']);
  expect(report['certifies']).toBe(false);
  expect(report['authentication']).toEqual({ kind: 'absent' });
  expect(Object.hasOwn(report, 'coverage')).toBe(false);
  expect(Object.hasOwn(report, 'admission')).toBe(false);
});

test('[TEST-AXES-046] normalized digest is order-independent and status-sensitive', () => {
  const setup = fixture();
  const cases = [
    { title, status: 'passed' },
    { title: 'opted out', status: 'skipped' },
  ] as const;
  publishCases(setup, cases);
  const first = observation(setup);
  publishCases(setup, [...cases].reverse());
  const reordered = observation(setup);
  expect(reordered['observationDigest']).toBe(first['observationDigest']);
  expect(reordered['cases']).toEqual(first['cases']);
  publishCases(setup, [
    { title, status: 'failed' },
    { title: 'opted out', status: 'skipped' },
  ]);
  const changed = observation(setup);
  const originalCases = first['cases'] as { caseId: string; status: string }[];
  const changedCases = changed['cases'] as { caseId: string; status: string }[];
  expect(changedCases.map((entry) => entry.caseId)).toEqual(
    originalCases.map((entry) => entry.caseId),
  );
  expect(changed['observationDigest']).not.toBe(first['observationDigest']);
});

test('[TEST-AXES-046] source and external policy identities change observation digest', () => {
  const setup = fixture();
  const original = observation(setup);
  writeFileSync(
    join(setup.root, file),
    'test("example runs", () => { expect(true).toBe(true); });\n',
  );
  git(setup.root, ['add', file]);
  git(setup.root, ['commit', '-m', 'edit case source']);
  setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
  const selected = readCandidate(setup.root, { kind: 'committed', revision: setup.revision });
  setup.manifest['revision'] = setup.revision;
  setup.manifest['candidate'] = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  const changedSource = observation(setup);
  const sourceCases = changedSource['cases'] as {
    caseId: string;
    source: { contentDigest: string };
  }[];
  const originalCases = original['cases'] as {
    caseId: string;
    source: { contentDigest: string };
  }[];
  expect(sourceCases[0]?.caseId).toBe(originalCases[0]?.caseId);
  expect(sourceCases[0]?.source.contentDigest).not.toBe(originalCases[0]?.source.contentDigest);
  expect(changedSource['observationDigest']).not.toBe(original['observationDigest']);
  chmodSync(join(setup.root, file), 0o755);
  git(setup.root, ['add', file]);
  git(setup.root, ['commit', '-m', 'make case executable']);
  setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
  const executable = readCandidate(setup.root, { kind: 'committed', revision: setup.revision });
  setup.manifest['revision'] = setup.revision;
  setup.manifest['candidate'] = hashCanonical({
    selection: executable.selection,
    entries: executable.entries,
    untracked: executable.untracked,
  });
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  const changedMode = observation(setup);
  const executableCases = changedMode['cases'] as {
    source: { mode: string; contentDigest: string };
  }[];
  expect(executableCases[0]?.source.mode).toBe('100755');
  expect(executableCases[0]?.source.contentDigest).toBe(sourceCases[0]?.source.contentDigest);
  expect(changedMode['observationDigest']).not.toBe(changedSource['observationDigest']);
  const policy = JSON.parse(readFileSync(setup.policyPath, 'utf8')) as Record<string, unknown>;
  policy['policyId'] = 'browser-fixture-revised';
  writeFileSync(setup.policyPath, JSON.stringify(policy));
  const changedPolicy = observation(setup);
  expect(changedPolicy['policyDigest']).not.toBe(changedMode['policyDigest']);
  expect(changedPolicy['observationDigest']).not.toBe(changedMode['observationDigest']);
});

test('[TEST-AXES-047] inherited policy, candidate, report parity and token refusals survive the adapter', () => {
  const setup = fixture();
  const policy = readFileSync(setup.policyPath, 'utf8');
  const manifest = JSON.stringify(setup.manifest);
  const originalCandidate = setup.manifest['candidate'];
  const report = readFileSync(join(setup.bundle, 'report.xml'), 'utf8');
  const tokenPath = join(setup.root, 'tmp/junit/browser/ordinary.latest-request');
  const token = readFileSync(tokenPath, 'utf8');
  const assertRefusal = (diagnostic: string): void => {
    const call = inspect(setup);
    expect(call.exitCode).toBe(1);
    expect(call.stdout).toBe('');
    expect(call.stderr).toContain(diagnostic);
  };
  const withoutMode = JSON.parse(policy) as Record<string, unknown>;
  delete withoutMode['browser'];
  writeFileSync(setup.policyPath, JSON.stringify(withoutMode));
  assertRefusal('external policy pin');
  writeFileSync(setup.policyPath, policy);
  setup.manifest['candidate'] = '0'.repeat(64);
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  assertRefusal('candidate identity differs');
  setup.manifest['candidate'] = originalCandidate;
  writeFileSync(join(setup.bundle, 'manifest.json'), manifest);
  const changedReport = report.replace('name="example runs"', 'name="other case"');
  writeFileSync(join(setup.bundle, 'report.xml'), changedReport);
  setup.manifest['reportDigest'] = digestEvidenceBytes(changedReport);
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  assertRefusal('normalized JUnit cases differ');
  writeFileSync(join(setup.bundle, 'report.xml'), report);
  writeFileSync(join(setup.bundle, 'manifest.json'), manifest);
  writeFileSync(tokenPath, 'revoked');
  assertRefusal('publication token differs');
  writeFileSync(tokenPath, token);
  expect(observation(setup)['certifies']).toBe(false);
});

test('[TEST-AXES-047] symbolic revision is refused before Browser inspection', () => {
  const setup = fixture();
  const call = Bun.spawnSync(
    [
      process.execPath,
      'run',
      join(import.meta.dir, '..', 'cli.ts'),
      'inspect-test-reports',
      setup.root,
      'HEAD',
      setup.policyPath,
      mode,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(call.exitCode).toBe(1);
  expect(call.stdout.toString()).toBe('');
  expect(call.stderr.toString()).toContain('requires a full committed SHA');
});

test('[TEST-AXES-047] CLI refuses omitted and unsupported Browser modes at its own boundary', () => {
  const setup = fixture();
  for (const arguments_ of [
    ['inspect-test-reports', setup.root, setup.revision, setup.policyPath],
    ['inspect-test-reports', setup.root, setup.revision, setup.policyPath, 'future'],
    ['inspect-test-reports', setup.root, setup.revision, setup.policyPath, mode, 'extra'],
  ]) {
    const call = Bun.spawnSync(
      [process.execPath, 'run', join(import.meta.dir, '..', 'cli.ts'), ...arguments_],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(call.exitCode).toBe(1);
    expect(call.stdout.toString()).toBe('');
    expect(call.stderr.toString()).toContain('usage: twilight-burokrat inspect-test-reports');
  }
});

test('[TEST-AXES-047] a faulted committed reader cannot supply a staged source selection', () => {
  const setup = fixture();
  const preload = join(setup.root, 'fault-selection.ts');
  const modulePath = join(import.meta.dir, '..', 'inventory/read-candidate.ts');
  writeFileSync(
    preload,
    `import { mock } from 'bun:test';
const actual = await import(${JSON.stringify(`${modulePath}?real-selection`)});
mock.module(${JSON.stringify(modulePath)}, () => ({
  ...actual,
  readCandidate: (...args) => ({
    ...actual.readCandidate(...args),
    selection: { kind: 'staged', base: '0'.repeat(40), indexTree: '0'.repeat(40) },
  }),
}));
`,
  );
  const call = Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '..', 'cli.ts'),
      'inspect-test-reports',
      setup.root,
      setup.revision,
      setup.policyPath,
      mode,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(call.exitCode).toBe(1);
  expect(call.stdout.toString()).toBe('');
  expect(call.stderr.toString()).toContain('test report selection is not committed');
});

test('[TEST-AXES-047] a faulted inspector candidate cannot be joined to the captured source', () => {
  const setup = fixture();
  const preload = join(setup.root, 'fault-inspector.ts');
  const browserModule = join(import.meta.dir, 'browser.ts');
  writeFileSync(
    preload,
    `import { mock } from 'bun:test';
const actual = await import(${JSON.stringify(`${browserModule}?real-inspector`)});
mock.module(${JSON.stringify(browserModule)}, () => ({
  ...actual,
  inspectBrowserBundle: (...args) => ({
    ...actual.inspectBrowserBundle(...args),
    candidate: '0'.repeat(64),
  }),
}));
`,
  );
  const call = Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '..', 'cli.ts'),
      'inspect-test-reports',
      setup.root,
      setup.revision,
      setup.policyPath,
      mode,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(call.exitCode, `${call.stdout.toString()} ${call.stderr.toString()}`).toBe(1);
  expect(call.stdout.toString()).toBe('');
  expect(call.stderr.toString()).toContain(
    'test report Browser candidate differs from selected source',
  );
});
