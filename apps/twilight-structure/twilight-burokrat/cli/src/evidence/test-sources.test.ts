import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { digestEvidenceBytes } from '@shared/test-evidence';
import { afterEach, expect, test } from 'bun:test';

import { checkIndexes } from '../indexes/check-indexes';
import { readCandidate } from '../inventory/read-candidate';
import { registeredRules } from '../rules/registry';
import { hashCanonical } from './content-manifest';

const scratch: string[] = [];
const mode = 'ordinary';
const invocationId = '11111111-1111-4111-8111-111111111111';
const owner = '22222222-2222-4222-8222-222222222222';
const config = 'playwright.config.ts';
const file = 'apps/alpha/nested/case.spec.ts';
const title = 'example runs';

function git(root: string, args: string[]): string {
  const call = Bun.spawnSync(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (call.exitCode !== 0) throw new Error(call.stderr.toString());
  return call.stdout.toString().trim();
}

function fixture(
  source: 'regular' | 'missing' | 'symlink' = 'regular',
  ownership: 'nested' | 'unowned' = 'nested',
): {
  root: string;
  policyPath: string;
  revision: string;
  bundle: string;
  manifest: Record<string, unknown>;
  caseFile: string;
} {
  const base = mkdtempSync(join(tmpdir(), 'burokrat-browser-'));
  scratch.push(base);
  const root = join(base, 'candidate');
  const caseFile = ownership === 'nested' ? file : 'unowned.spec.ts';
  mkdirSync(root);
  git(root, ['init']);
  git(root, ['config', 'user.name', 'Browser Fixture']);
  git(root, ['config', 'user.email', 'browser@example.invalid']);
  writeFileSync(join(root, '.gitignore'), 'tmp/\n');
  writeFileSync(join(root, config), 'export default {}\n');
  mkdirSync(join(root, 'apps/alpha/nested'), { recursive: true });
  if (source === 'regular')
    writeFileSync(join(root, caseFile), 'test("example runs", () => {});\n');
  if (source === 'symlink') symlinkSync(config, join(root, caseFile));
  const metadata = (moduleId: string, memberships: unknown[]) => ({
    schemaVersion: 1,
    moduleId,
    memberships,
    relationshipSelectors: [],
    applicableChecks: [],
    inapplicableSections: [
      { section: 'relationships', reason: 'No relationships in fixture.' },
      { section: 'invariants', reason: 'No cross-file invariant.' },
      { section: 'checks', reason: 'Index checker validates fixture.' },
    ],
    externalConsumers: { kind: 'none-known', knowledgeLimit: 'Fixture only.' },
  });
  const index = (name: string, record: object, link: string) =>
    `# ${name}\n\n<!-- module-index ${JSON.stringify(record)} -->\n\n- [Child](${link})\n`;
  writeFileSync(
    join(root, 'apps/alpha/README.md'),
    index(
      'Outer',
      metadata('module.outer', [{ kind: 'path', path: 'nested/README.md' }]),
      'nested/README.md',
    ),
  );
  if (ownership === 'unowned') writeFileSync(join(root, file), 'nested fixture source\n');
  writeFileSync(
    join(root, 'apps/alpha/nested/README.md'),
    index(
      'Nested',
      metadata('module.nested', [{ kind: 'path', path: 'case.spec.ts' }]),
      'case.spec.ts',
    ),
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
        file: caseFile,
        title: caseFile,
        specs: [
          {
            file: caseFile,
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
    `<testsuites tests="1" failures="0" errors="0" skipped="0"><testsuite name="${basename(caseFile)}" hostname="chromium"><testcase name="${title}" classname="${basename(caseFile)}"/></testsuite></testsuites>`,
  );
  const report = Buffer.from(
    `<testsuite name="browser.ordinary" tests="1" failures="0" errors="0" skipped="0"><testcase classname="chromium" name="${title}" file="${caseFile}"/></testsuite>`,
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
    cases: [{ config, project: 'chromium', file: caseFile, titlePath: [title], status: 'passed' }],
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
  return { root, policyPath, revision, bundle, manifest, caseFile };
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
      'inspect-test-sources',
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

function observation(setup: ReturnType<typeof fixture>): Record<string, unknown> {
  const call = inspect(setup);
  expect(call.exitCode, call.stderr).toBe(0);
  return JSON.parse(call.stdout) as Record<string, unknown>;
}

function commitCandidate(setup: ReturnType<typeof fixture>): void {
  git(setup.root, ['add', '-A']);
  git(setup.root, ['commit', '-m', 'updated candidate']);
  setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
  const selected = readCandidate(setup.root, { kind: 'committed', revision: setup.revision });
  setup.manifest['revision'] = setup.revision;
  setup.manifest['candidate'] = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
}

function inspectFault(
  setup: ReturnType<typeof fixture>,
  modulePath: string,
  replacement: string,
): { exitCode: number; stdout: string; stderr: string } {
  const preload = join(setup.root, 'fault-preload.ts');
  writeFileSync(
    preload,
    `import { mock } from 'bun:test';\nconst actual = await import(${JSON.stringify(`${modulePath}?real-fault`)});\nmock.module(${JSON.stringify(modulePath)}, () => ({ ...actual, ${replacement} }));\n`,
  );
  const call = Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '..', 'cli.ts'),
      'inspect-test-sources',
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

function addIndexDebt(setup: ReturnType<typeof fixture>, indexPath: string): void {
  const path = join(setup.root, indexPath);
  const source = readFileSync(path, 'utf8');
  const match = /<!-- module-index (.+) -->/.exec(source);
  const metadataText = match?.[1];
  if (match === null || metadataText === undefined)
    throw new Error('fixture index metadata absent');
  const metadata = JSON.parse(metadataText) as { memberships: { kind: 'path'; path: string }[] };
  for (let position = 0; position < 40; position += 1) {
    const name = `extra-${String(position)}.ts`;
    writeFileSync(join(path, '..', name), `export const number = ${String(position)};\n`);
    metadata.memberships.push({ kind: 'path', path: name });
  }
  writeFileSync(
    path,
    source.replace(match[0], `<!-- module-index ${JSON.stringify(metadata)} -->`),
  );
}

test('[TEST-AXES-048] production CLI binds exact nested owner and source', () => {
  const setup = fixture();
  const report = observation(setup);
  const bindings = report['bindings'] as {
    caseId: string;
    file: string;
    status: string;
    source: { mode: string; contentDigest: string };
    owner: { moduleId: string; indexPath: string; indexIdentity: string };
    level: unknown;
  }[];
  expect(bindings).toHaveLength(1);
  expect(bindings[0]?.caseId).toBe(hashCanonical([config, 'chromium', file, [title]]));
  expect(bindings[0]?.file).toBe(file);
  expect(bindings[0]?.status).toBe('passed');
  expect(bindings[0]?.source).toEqual({
    mode: '100644',
    contentDigest: digestEvidenceBytes('test("example runs", () => {});\n'),
  });
  expect(bindings[0]?.owner.moduleId).toBe('module.nested');
  expect(bindings[0]?.owner.indexPath).toBe('apps/alpha/nested/README.md');
  expect(bindings[0]?.owner.indexIdentity).toMatch(/^[0-9a-f]{64}$/);
  expect(bindings[0]?.level).toEqual({
    kind: 'unresolved',
    reason: 'complete-level-membership-unavailable',
  });
  expect(report['revision']).toBe(setup.revision);
  expect(report['candidate']).toBe(setup.manifest['candidate']);
  const checked = checkIndexes(
    setup.root,
    readCandidate(setup.root, { kind: 'committed', revision: setup.revision }),
  );
  expect(report['indexIdentity']).toBe(checked.identity);
  const nested = checked.indexes.find(({ moduleId }) => moduleId === 'module.nested');
  if (nested === undefined) throw new Error('fixture nested index absent');
  expect(bindings[0]?.owner.indexIdentity).toBe(nested.identity);
  const reportCall = Bun.spawnSync(
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
  expect(reportCall.exitCode, reportCall.stderr.toString()).toBe(0);
  expect(report['reportObservationDigest']).toBe(
    (JSON.parse(reportCall.stdout.toString()) as { observationDigest: string }).observationDigest,
  );
  expect(report['authentication']).toEqual({ kind: 'absent' });
  expect(report['certifies']).toBe(false);
  const { observationDigest, ...payload } = report;
  expect(observationDigest).toBe(hashCanonical(payload));
});

test('[TEST-AXES-049] a committed reported source outside every index refuses without JSON', () => {
  const setup = fixture('regular', 'unowned');
  const call = inspect(setup);
  expect(call.exitCode).not.toBe(0);
  expect(call.stderr).toContain(
    `test source has no unique validated index owner: ${setup.caseFile}`,
  );
  expect(call.stdout).toBe('');
});

test('[TEST-AXES-049] duplicate committed module identity retains the index checker refusal', () => {
  const setup = fixture();
  const path = join(setup.root, 'apps/alpha/nested/README.md');
  writeFileSync(path, readFileSync(path, 'utf8').replace('module.nested', 'module.outer'));
  commitCandidate(setup);
  const call = inspect(setup);
  expect(call.exitCode).not.toBe(0);
  expect(call.stderr).toContain('duplicate index module identity: module.outer');
  expect(call.stdout).toBe('');
});

test('[TEST-AXES-049] a faulted checker with two owners refuses ambiguous ownership', () => {
  const setup = fixture();
  const call = inspectFault(
    setup,
    join(import.meta.dir, '..', 'indexes/check-indexes.ts'),
    `checkIndexes: (...args) => { const checked = actual.checkIndexes(...args); return { ...checked, indexes: [...checked.indexes, { ...checked.indexes.at(-1), moduleId: 'module.fault' }] }; },`,
  );
  expect(call.exitCode).not.toBe(0);
  expect(call.stderr).toContain(`test source has no unique validated index owner: ${file}`);
  expect(call.stdout).toBe('');
});

for (const field of ['revision', 'candidate'] as const) {
  test(`[TEST-AXES-050] a faulted report ${field} cannot join selected ownership`, () => {
    const setup = fixture();
    const call = inspectFault(
      setup,
      join(import.meta.dir, 'test-reports.ts'),
      `inspectTestReports: (...args) => ({ ...actual.inspectTestReports(...args), ${field}: '0'.repeat(${String(field === 'revision' ? 40 : 64)}) }),`,
    );
    expect(call.exitCode).not.toBe(0);
    expect(call.stderr).toContain(`test source report ${field} differs from selected candidate`);
    expect(call.stdout).toBe('');
  });
}

test('[TEST-AXES-050] faulted candidate reader cannot provide staged ownership', () => {
  const setup = fixture();
  const call = inspectFault(
    setup,
    join(import.meta.dir, '..', 'inventory/read-candidate.ts'),
    `readCandidate: (...args) => ({ ...actual.readCandidate(...args), selection: { kind: 'staged', base: '0'.repeat(40), indexTree: '0'.repeat(40) } }),`,
  );
  expect(call.exitCode).not.toBe(0);
  expect(call.stderr).toContain('test source selection is not committed');
  expect(call.stdout).toBe('');
});

test('[TEST-AXES-051] working index replacement cannot repair missing committed ownership', () => {
  const setup = fixture('regular', 'unowned');
  const metadata = {
    schemaVersion: 1,
    moduleId: 'module.root',
    memberships: [
      { kind: 'path', path: '.gitignore' },
      { kind: 'path', path: 'playwright.config.ts' },
      { kind: 'path', path: 'unowned.spec.ts' },
      { kind: 'path', path: 'apps/alpha/README.md' },
    ],
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
    join(setup.root, 'README.md'),
    `# Working replacement\n\n<!-- module-index ${JSON.stringify(metadata)} -->\n\n- [Outer](apps/alpha/README.md)\n`,
  );
  git(setup.root, ['add', 'README.md']);
  expect(
    checkIndexes(
      setup.root,
      readCandidate(setup.root, { kind: 'working', base: setup.revision }),
    ).indexes.some(({ moduleId }) => moduleId === 'module.root'),
  ).toBe(true);
  const call = inspect(setup);
  expect(call.exitCode).not.toBe(0);
  expect(call.stderr).toContain('test source has no unique validated index owner');
  expect(call.stdout).toBe('');
});

test('[TEST-AXES-051] only committed index bytes affect a valid ownership observation', () => {
  const setup = fixture();
  const first = observation(setup);
  writeFileSync(join(setup.root, 'apps/alpha/nested/README.md'), '# Dirty replacement\n');
  const second = observation(setup);
  expect(second).toEqual(first);
});

test('[TEST-AXES-051] missing source and invalid external policy retain upstream refusals', () => {
  const missing = fixture('missing');
  const missingCall = inspect(missing);
  expect(missingCall.exitCode).not.toBe(0);
  expect(missingCall.stderr).toContain('test report case source is not a regular committed blob');
  expect(missingCall.stdout).toBe('');
  const policy = fixture();
  writeFileSync(policy.policyPath, '{');
  const policyCall = inspect(policy);
  expect(policyCall.exitCode).not.toBe(0);
  expect(policyCall.stderr).toContain('JSON');
  expect(policyCall.stdout).toBe('');
});

test('[TEST-AXES-051] malformed committed index metadata and broken links retain checker refusals', () => {
  const malformed = fixture();
  const path = join(malformed.root, 'apps/alpha/nested/README.md');
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replace('"moduleId":"module.nested"', '"moduleId":3'),
  );
  commitCandidate(malformed);
  const malformedCall = inspect(malformed);
  expect(malformedCall.exitCode).not.toBe(0);
  expect(malformedCall.stderr).toContain('index metadata malformed');
  expect(malformedCall.stdout).toBe('');
  const broken = fixture();
  const brokenPath = join(broken.root, 'apps/alpha/nested/README.md');
  writeFileSync(
    brokenPath,
    readFileSync(brokenPath, 'utf8').replace('(case.spec.ts)', '(absent.ts)'),
  );
  commitCandidate(broken);
  const brokenCall = inspect(broken);
  expect(brokenCall.exitCode).not.toBe(0);
  expect(brokenCall.stderr).toContain('Markdown path absent in apps/alpha/nested/README.md');
  expect(brokenCall.stdout).toBe('');
});

test('[TEST-AXES-051] absent, malformed UTF-8 and unreadable committed indexes retain distinct refusals', () => {
  const absent = fixture();
  rmSync(join(absent.root, 'apps/alpha/README.md'));
  rmSync(join(absent.root, 'apps/alpha/nested/README.md'));
  commitCandidate(absent);
  const absentCall = inspect(absent);
  expect(absentCall.exitCode).not.toBe(0);
  expect(absentCall.stderr).toContain('selected candidate contains no module indexes');
  expect(absentCall.stdout).toBe('');
  const malformed = fixture();
  writeFileSync(join(malformed.root, 'apps/alpha/nested/README.md'), Buffer.from([0xff]));
  commitCandidate(malformed);
  const malformedCall = inspect(malformed);
  expect(malformedCall.exitCode).not.toBe(0);
  expect(malformedCall.stderr).toContain('selected Markdown is not UTF-8');
  expect(malformedCall.stdout).toBe('');
  const unreadable = fixture();
  const blob = git(unreadable.root, ['rev-parse', 'HEAD:apps/alpha/nested/README.md']);
  rmSync(join(unreadable.root, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  const unreadableCall = inspect(unreadable);
  expect(unreadableCall.exitCode).not.toBe(0);
  expect(unreadableCall.stderr).toContain('cannot read selected index apps/alpha/nested/README.md');
  expect(unreadableCall.stdout).toBe('');
});

test('[TEST-AXES-051] corrupted Browser report publication retains the report refusal', () => {
  const setup = fixture();
  writeFileSync(join(setup.bundle, 'report.xml'), '<invalid/>');
  const call = inspect(setup);
  expect(call.exitCode).not.toBe(0);
  expect(call.stderr).toContain('digest');
  expect(call.stdout).toBe('');
});

test('[TEST-AXES-051] omitted, extra and unsupported modes refuse usage without JSON', () => {
  const setup = fixture();
  const base = [
    process.execPath,
    'run',
    join(import.meta.dir, '..', 'cli.ts'),
    'inspect-test-sources',
    setup.root,
    setup.revision,
    setup.policyPath,
  ];
  for (const args of [
    base,
    [...base, mode, 'extra'],
    [...base, 'performance'],
    [...base, 'manual'],
  ]) {
    const call = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' });
    expect(call.exitCode).not.toBe(0);
    expect(call.stderr.toString()).toContain('usage: twilight-burokrat inspect-test-sources');
    expect(call.stdout.toString()).toBe('');
  }
});

test('[TEST-AXES-051] symbolic revision refuses source selection before publication', () => {
  const setup = fixture();
  setup.revision = 'HEAD';
  const call = inspect(setup);
  expect(call.exitCode).not.toBe(0);
  expect(call.stderr).toContain('test source selection requires a full committed SHA');
  expect(call.stdout).toBe('');
});

test('[TEST-AXES-053] failed and skipped observations retain outcomes with unresolved level', () => {
  const setup = fixture();
  publishCases(setup, [
    { title: 'failed case', status: 'failed' },
    { title: 'skipped case', status: 'skipped' },
  ]);
  const report = observation(setup);
  const bindings = report['bindings'] as { status: string; level: unknown }[];
  expect(bindings.map(({ status }) => status).sort()).toEqual(['failed', 'skipped']);
  expect(bindings.map(({ level }) => level)).toEqual([
    { kind: 'unresolved', reason: 'complete-level-membership-unavailable' },
    { kind: 'unresolved', reason: 'complete-level-membership-unavailable' },
  ]);
  expect(report['authentication']).toEqual({ kind: 'absent' });
  expect(report['certifies']).toBe(false);
  for (const claim of [
    'testedModule',
    'serviceKind',
    'scenarioCoverage',
    'structuralCoverage',
    'admission',
  ])
    expect(Object.hasOwn(report, claim)).toBe(false);
});

test('[TEST-AXES-053] index review debt survives a successful ownership inspection', () => {
  const setup = fixture();
  addIndexDebt(setup, 'apps/alpha/nested/README.md');
  commitCandidate(setup);
  const report = observation(setup);
  expect(report['indexReviewDebt']).toEqual([
    { indexPath: 'apps/alpha/nested/README.md', directEntries: 41, limit: 40 },
  ]);
  const { observationDigest, ...payload } = report;
  expect(observationDigest).toBe(hashCanonical(payload));
});

test('[TEST-AXES-052] reordered real report cases and index debt have stable normalized identity', () => {
  const setup = fixture();
  publishCases(setup, [
    { title: 'first', status: 'passed' },
    { title: 'second', status: 'skipped' },
  ]);
  addIndexDebt(setup, 'apps/alpha/README.md');
  addIndexDebt(setup, 'apps/alpha/nested/README.md');
  commitCandidate(setup);
  const canonical = observation(setup);
  const reportFault = inspectFault(
    setup,
    join(import.meta.dir, 'test-reports.ts'),
    `inspectTestReports: (...args) => { const reports = actual.inspectTestReports(...args); return { ...reports, cases: [...reports.cases].reverse() }; },`,
  );
  expect(reportFault.exitCode, reportFault.stderr).toBe(0);
  expect(JSON.parse(reportFault.stdout)).toEqual(canonical);
  const debtFault = inspectFault(
    setup,
    join(import.meta.dir, '..', 'indexes/check-indexes.ts'),
    `checkIndexes: (...args) => { const checked = actual.checkIndexes(...args); return { ...checked, reviewDebt: [...checked.reviewDebt].reverse() }; },`,
  );
  expect(debtFault.exitCode, debtFault.stderr).toBe(0);
  expect(JSON.parse(debtFault.stdout)).toEqual(canonical);
});

test('[TEST-AXES-052] source, outcome, report and ownership changes alter complete observation identity', () => {
  const baseline = fixture();
  const original = observation(baseline);
  const source = fixture();
  writeFileSync(join(source.root, file), 'test("changed source", () => {});\n');
  commitCandidate(source);
  const sourceReport = observation(source);
  expect(sourceReport['observationDigest']).not.toBe(original['observationDigest']);
  const outcome = fixture();
  publishCases(outcome, [{ title, status: 'failed' }]);
  expect(observation(outcome)['observationDigest']).not.toBe(original['observationDigest']);
  const owner = fixture();
  const indexPath = join(owner.root, 'apps/alpha/nested/README.md');
  writeFileSync(
    indexPath,
    readFileSync(indexPath, 'utf8').replace('module.nested', 'module.renamed'),
  );
  commitCandidate(owner);
  const ownerReport = observation(owner);
  expect(ownerReport['observationDigest']).not.toBe(original['observationDigest']);
  for (const report of [original, sourceReport, ownerReport]) {
    const { observationDigest, ...payload } = report;
    expect(observationDigest).toBe(hashCanonical(payload));
  }
});

test('[TEST-AXES-052] isolated upstream provenance and membership identity faults change the digest', () => {
  const setup = fixture();
  const baseline = observation(setup);
  const faults = [
    [
      join(import.meta.dir, 'test-reports.ts'),
      `inspectTestReports: (...args) => ({ ...actual.inspectTestReports(...args), observationDigest: '0'.repeat(64) }),`,
      'reportObservationDigest',
    ],
    [
      join(import.meta.dir, '..', 'indexes/check-indexes.ts'),
      `checkIndexes: (...args) => ({ ...actual.checkIndexes(...args), identity: '0'.repeat(64) }),`,
      'indexIdentity',
    ],
    [
      join(import.meta.dir, '..', 'indexes/check-indexes.ts'),
      `checkIndexes: (...args) => { const checked = actual.checkIndexes(...args); return { ...checked, indexes: checked.indexes.map((index) => index.moduleId === 'module.nested' ? { ...index, identity: '0'.repeat(64) } : index) }; },`,
      'bindings',
    ],
    [
      join(import.meta.dir, 'test-reports.ts'),
      `inspectTestReports: (...args) => { const reports = actual.inspectTestReports(...args); return { ...reports, cases: reports.cases.map((case_) => ({ ...case_, source: { ...case_.source, contentDigest: '0'.repeat(64) } })) }; },`,
      'bindings',
    ],
  ] as const;
  for (const [modulePath, replacement, field] of faults) {
    const call = inspectFault(setup, modulePath, replacement);
    expect(call.exitCode, call.stderr).toBe(0);
    const changed = JSON.parse(call.stdout) as Record<string, unknown>;
    expect(changed[field]).not.toEqual(baseline[field]);
    expect(changed['observationDigest']).not.toBe(baseline['observationDigest']);
    const { observationDigest, ...payload } = changed;
    expect(observationDigest).toBe(hashCanonical(payload));
  }
});
