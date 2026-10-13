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

import {
  digestEvidenceBytes,
  digestPerformanceDeclaration,
  type PerformanceCases,
} from '@shared/test-evidence';
import { afterEach, expect, test } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { invokeCli } from '../invoke-cli';
import { registeredRules } from '../rules/registry';
import { hashCanonical } from './content-manifest';
import { digestPerformanceCase } from './performance';
import { inspectPerformanceBundle } from './performance-bundle';

const scratch: string[] = [];
const invocationId = '11111111-1111-4111-8111-111111111111';
const config = 'playwright.performance.config.ts';
const declarationPath = 'playwright.performance.cases.json';
const fixturePath = 'case.perf.spec.ts';
const pointerPath = 'tmp/junit/wbs-fe-01.performance.current.json';
const declaration: PerformanceCases = {
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
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'burokrat-performance-'));
  scratch.push(base);
  const root = join(base, 'candidate');
  mkdirSync(root);
  git(root, ['init']);
  git(root, ['config', 'user.name', 'Performance Fixture']);
  git(root, ['config', 'user.email', 'performance@example.invalid']);
  writeFileSync(join(root, config), 'export default {}\n');
  writeFileSync(join(root, declarationPath), JSON.stringify(declaration));
  writeFileSync(join(root, fixturePath), 'test("renders cells", () => {});\n');
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
  const policy = {
    schemaVersion: 1,
    policyId: 'performance-fixture',
    ruleModes: registeredRules().map((rule) => ({ ruleId: rule.id, mode: 'observe' })),
    performance: {
      acceptedDeclarationSchema: 1,
      declarationPath,
      config,
      configDigest: digestEvidenceBytes('export default {}\n'),
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
    cases: [
      {
        caseId: 'cells',
        status: 'passed',
        observations: [{ measurement: 'mounted-cells', unit: 'count', value: 10 }],
      },
    ],
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
    suites: [
      {
        file: fixturePath,
        title: fixturePath,
        specs: [
          {
            file: fixturePath,
            title: 'renders cells',
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
                                  caseId: 'cells',
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
      },
    ],
  });
  const report =
    '<testsuite name="wbs-fe-01.performance" tests="1" failures="0" errors="0" skipped="0"><testcase classname="case.perf.spec.ts" file="case.perf.spec.ts" name="renders cells"/></testsuite>';
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
    collected: [{ caseId: 'cells', fixture: fixturePath, titlePath: ['renders cells'] }],
  };
  for (const [field, source] of Object.entries(artifacts)) {
    const path = field === 'report' ? 'report.xml' : `${field === 'run' ? 'run' : field}.json`;
    writeFileSync(join(bundle, path), source);
    manifest[field] = { path, digest: digestEvidenceBytes(source) };
  }
  writeFileSync(join(bundle, 'manifest.json'), JSON.stringify(manifest));
  return { root, revision, policyPath, bundle, manifest, policy, evidence };
}
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});
function inspect(setup: ReturnType<typeof fixture>, hooks?: { afterBundleRead?: () => void }) {
  return inspectPerformanceBundle(setup.root, setup.revision, setup.policyPath, hooks);
}
function saveManifest(setup: ReturnType<typeof fixture>) {
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
}
function rewrite(
  setup: ReturnType<typeof fixture>,
  field: 'discovery' | 'run' | 'evidence' | 'report',
  transform: (source: string) => string,
) {
  const path = field === 'report' ? 'report.xml' : `${field}.json`;
  const source = transform(readFileSync(join(setup.bundle, path), 'utf8'));
  writeFileSync(join(setup.bundle, path), source);
  setup.manifest[field] = { path, digest: digestEvidenceBytes(source) };
  saveManifest(setup);
}

test('[TEST-AXES-057] stable publication binds committed sources and withholds certification', async () => {
  const setup = fixture();
  const observation = inspect(setup);
  expect(observation.certifies).toBe(false);
  expect(observation.authentication).toEqual({ kind: 'absent' });
  expect(observation.observedCases).toMatchObject([
    { caseId: 'cells', observed: 10, threshold: 20, passed: true },
  ]);
  expect(observation.observationDigest).toMatch(/^[0-9a-f]{64}$/);
  writeFileSync(join(setup.root, config), 'staged config');
  git(setup.root, ['add', config]);
  expect(inspect(setup)).toEqual(observation);
  const invocation = await invokeCli([
    'inspect-performance',
    setup.root,
    setup.revision,
    setup.policyPath,
  ]);
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  expect(JSON.parse(invocation.stdout)).toEqual(observation);
});

for (const field of [
  'revision',
  'candidate',
  'policyDigest',
  'declarationDigest',
  'configDigest',
  'invocationId',
  'schemaVersion',
  'certifies',
] as const) {
  test(`[TEST-AXES-058] refuses foreign manifest ${field}`, () => {
    const setup = fixture();
    setup.manifest[field] = field === 'certifies' ? true : 'foreign';
    saveManifest(setup);
    expect(() => inspect(setup)).toThrow('manifest identity');
  });
}
for (const field of ['discovery', 'run', 'evidence', 'report'] as const) {
  test(`[TEST-AXES-058] recomputes ${field} artifact digest`, () => {
    const setup = fixture();
    const path = field === 'report' ? 'report.xml' : `${field}.json`;
    writeFileSync(join(setup.bundle, path), 'altered');
    expect(() => inspect(setup)).toThrow(`${field} digest or path`);
  });
  test(`[TEST-AXES-058] refuses ${field} path escape`, () => {
    const setup = fixture();
    setup.manifest[field] = { path: '../outside', digest: '0'.repeat(64) };
    saveManifest(setup);
    expect(() => inspect(setup)).toThrow(`${field} digest or path`);
  });
}
for (const path of ['manifest.json', 'discovery.json', 'run.json', 'evidence.json', 'report.xml']) {
  test(`[TEST-AXES-058] refuses absent ${path}`, () => {
    const setup = fixture();
    rmSync(join(setup.bundle, path));
    expect(() => inspect(setup)).toThrow('ENOENT');
  });
  test(`[TEST-AXES-058] refuses unreadable ${path}`, () => {
    const setup = fixture();
    chmodSync(join(setup.bundle, path), 0);
    expect(() => inspect(setup)).toThrow('EACCES');
  });
  test(`[TEST-AXES-058] refuses symlink ${path}`, () => {
    const setup = fixture();
    const file = join(setup.bundle, path);
    const outside = join(setup.root, 'outside');
    writeFileSync(outside, readFileSync(file));
    rmSync(file);
    symlinkSync(outside, file);
    expect(() => inspect(setup)).toThrow('symlink');
  });
  test(`[TEST-AXES-058] refuses nonregular ${path}`, () => {
    const setup = fixture();
    const file = join(setup.bundle, path);
    rmSync(file);
    mkdirSync(file);
    expect(() => inspect(setup)).toThrow('regular file');
  });
}
for (const field of ['discovery', 'run', 'evidence'] as const) {
  test(`[TEST-AXES-058] refuses malformed ${field} JSON with updated digest`, () => {
    const setup = fixture();
    rewrite(setup, field, () => '{');
    expect(() => inspect(setup)).toThrow('JSON');
  });
  test(`[TEST-AXES-058] refuses malformed ${field} UTF-8 with updated digest`, () => {
    const setup = fixture();
    const bytes = Buffer.from([255]);
    writeFileSync(join(setup.bundle, `${field}.json`), bytes);
    setup.manifest[field] = { path: `${field}.json`, digest: digestEvidenceBytes(bytes) };
    saveManifest(setup);
    expect(() => inspect(setup)).toThrow('UTF-8');
  });
}
interface RawReport {
  config: { configFile: string; rootDir: string; version: string; projects: { name: string }[] };
  suites: {
    file: string;
    specs: {
      title: string;
      tests: { results: { status: string; attachments: { body: string }[] }[] }[];
    }[];
  }[];
}
const rawFaults: [string, (report: RawReport) => void, string][] = [
  [
    'foreign config',
    (report) => {
      report.config.configFile = '/outside/config.ts';
    },
    'raw config',
  ],
  [
    'foreign project',
    (report) => {
      report.config.projects[0].name = 'firefox';
    },
    'project',
  ],
  [
    'foreign runner version',
    (report) => {
      report.config.version = '2.0.0';
    },
    'discovery and execution',
  ],
  [
    'traversing fixture',
    (report) => {
      report.suites[0].file = '../outside';
    },
    'normalized workspace path',
  ],
  [
    'outside fixture root',
    (report) => {
      report.config.rootDir = '/outside';
    },
    'normalized workspace path',
  ],
  [
    'missing case',
    (report) => {
      report.suites = [];
    },
    'collection differs',
  ],
  [
    'duplicate case',
    (report) => {
      report.suites.push(report.suites[0]);
    },
    'collection differs',
  ],
  [
    'extra case',
    (report) => {
      report.suites[0].specs.push({ ...report.suites[0].specs[0], title: 'other' });
    },
    'undeclared',
  ],
  [
    'failed status',
    (report) => {
      report.suites[0].specs[0].tests[0].results[0].status = 'failed';
    },
    'evidence differs',
  ],
  [
    'skipped status',
    (report) => {
      report.suites[0].specs[0].tests[0].results[0].status = 'skipped';
    },
    'evidence differs',
  ],
  [
    'missing observation',
    (report) => {
      report.suites[0].specs[0].tests[0].results[0].attachments = [];
    },
    'one fresh observation',
  ],
  [
    'wrong measurement',
    (report) => {
      report.suites[0].specs[0].tests[0].results[0].attachments[0].body = Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          caseId: 'other',
          measurement: 'mounted-cells',
          unit: 'count',
          value: 10,
        }),
      ).toString('base64');
    },
    'identity mismatch',
  ],
  [
    'conflicting measurement',
    (report) => {
      report.suites[0].specs[0].tests[0].results[0].attachments[0].body = Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          caseId: 'cells',
          measurement: 'mounted-cells',
          unit: 'count',
          value: 12,
        }),
      ).toString('base64');
    },
    'evidence differs',
  ],
];
for (const [name, fault, message] of rawFaults)
  test(`[TEST-AXES-059] refuses raw ${name} despite updated digest`, () => {
    const setup = fixture();
    rewrite(setup, 'run', (source) => {
      const report = JSON.parse(source) as RawReport;
      fault(report);
      return JSON.stringify(report);
    });
    expect(() => inspect(setup)).toThrow(message);
  });
test('[TEST-AXES-059] refuses collected case mismatch', () => {
  const setup = fixture();
  setup.manifest['collected'] = [];
  saveManifest(setup);
  expect(() => inspect(setup)).toThrow('collected cases');
});
test('[TEST-AXES-059] refuses conflicting selection', () => {
  const setup = fixture();
  setup.manifest['selection'] = {};
  saveManifest(setup);
  expect(() => inspect(setup)).toThrow('selection differs');
});
for (const field of ['candidate', 'policyDigest', 'declarationDigest'] as const)
  test(`[TEST-AXES-059] refuses evidence ${field} conflict`, () => {
    const setup = fixture();
    rewrite(setup, 'evidence', (source) =>
      JSON.stringify({
        ...(JSON.parse(source) as Record<string, unknown>),
        [field]: '0'.repeat(64),
      }),
    );
    expect(() => inspect(setup)).toThrow('evidence identity');
  });
for (const [name, transform, message] of [
  ['counts', (source: string) => source.replace('tests="1"', 'tests="2"'), 'counts'],
  ['case identity', (source: string) => source.replace('renders cells', 'foreign'), 'cases'],
  [
    'outcome',
    (source: string) => source.replace('/></testsuite>', '><failure/></testcase></testsuite>'),
    'cases',
  ],
  [
    'structure',
    (source: string) => source.replace('</testsuite>', '<extra/></testsuite>'),
    'structure',
  ],
  ['malformed XML', (source: string) => source.replace('</testsuite>', ''), 'unclosed'],
] as const)
  test(`[TEST-AXES-059] refuses JUnit ${name} despite updated digest`, () => {
    const setup = fixture();
    rewrite(setup, 'report', transform);
    expect(() => inspect(setup)).toThrow(message);
  });
test('[TEST-AXES-060] refuses current pointer race', () => {
  const setup = fixture();
  expect(() =>
    inspect(setup, {
      afterBundleRead: () => {
        writeFileSync(join(setup.root, pointerPath), '{}');
      },
    }),
  ).toThrow('pointer changed');
});
test('[TEST-AXES-058] requires a full committed SHA', () => {
  const setup = fixture();
  expect(() => inspectPerformanceBundle(setup.root, 'HEAD', setup.policyPath)).toThrow(
    'full committed SHA',
  );
});
test('[TEST-AXES-058] CLI refuses additional operands', async () => {
  const setup = fixture();
  const invocation = await invokeCli([
    'inspect-performance',
    setup.root,
    setup.revision,
    setup.policyPath,
    'run',
  ]);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stderr).toContain('usage:');
});

test('[TEST-AXES-057] complete payload digest binds all identities and noncertification', () => {
  const observation = inspect(fixture());
  const { observationDigest, ...payload } = observation;
  expect(observationDigest).toBe(hashCanonical(payload));
  for (const key of Object.keys(payload))
    expect(hashCanonical({ ...payload, [key]: null }), key).not.toBe(observationDigest);
});
for (const status of ['failed', 'skipped', 'breached'] as const)
  test(`[TEST-AXES-059] success pointer refuses coherent ${status} execution`, async () => {
    const setup = fixture();
    const value = status === 'breached' ? 21 : 10;
    rewrite(setup, 'run', (source) => {
      const report = JSON.parse(source) as RawReport;
      const outcome = report.suites[0].specs[0].tests[0].results[0];
      if (status !== 'breached') outcome.status = status;
      outcome.attachments[0].body = Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          caseId: 'cells',
          measurement: 'mounted-cells',
          unit: 'count',
          value,
        }),
      ).toString('base64');
      return JSON.stringify(report);
    });
    rewrite(setup, 'evidence', (source) => {
      const evidence = JSON.parse(source) as ReturnType<typeof fixture>['evidence'];
      if (status !== 'breached') evidence.run.cases[0].status = status;
      evidence.run.cases[0].observations[0].value = value;
      return JSON.stringify(evidence);
    });
    const invocation = await invokeCli([
      'inspect-performance',
      setup.root,
      setup.revision,
      setup.policyPath,
    ]);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('unsuccessful cases');
  });
for (const field of ['config', 'declaration', 'fixture'] as const)
  test(`[TEST-AXES-058] refuses absent committed ${field} even with working replacement`, () => {
    const setup = fixture();
    const path =
      field === 'config' ? config : field === 'declaration' ? declarationPath : fixturePath;
    git(setup.root, ['rm', path]);
    git(setup.root, ['commit', '-m', 'remove selected source']);
    setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
    writeFileSync(join(setup.root, path), 'working replacement');
    expect(() => inspect(setup)).toThrow('not a regular blob');
  });
test('[TEST-AXES-058] refuses pointer path escape and symlinked bundle', () => {
  const setup = fixture();
  const pointer = JSON.parse(readFileSync(join(setup.root, pointerPath), 'utf8')) as Record<
    string,
    unknown
  >;
  writeFileSync(
    join(setup.root, pointerPath),
    JSON.stringify({ ...pointer, bundle: '../foreign' }),
  );
  expect(() => inspect(setup)).toThrow('pointer identity');
  writeFileSync(join(setup.root, pointerPath), JSON.stringify(pointer));
  const target = join(setup.root, 'foreign-bundle');
  Bun.spawnSync(['mv', setup.bundle, target]);
  symlinkSync(target, setup.bundle);
  expect(() => inspect(setup)).toThrow('symlink');
});
test('[TEST-AXES-059] refuses changed committed threshold despite matching publication identities', () => {
  const setup = fixture();
  const changed = structuredClone(declaration);
  changed.cases[0].threshold = 19;
  writeFileSync(join(setup.root, declarationPath), JSON.stringify(changed));
  git(setup.root, ['add', declarationPath]);
  git(setup.root, ['commit', '-m', 'change threshold']);
  setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
  const selected = readCandidate(setup.root, { kind: 'committed', revision: setup.revision });
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const declarationDigest = digestPerformanceDeclaration(changed);
  Object.assign(setup.manifest, { revision: setup.revision, candidate, declarationDigest });
  saveManifest(setup);
  rewrite(setup, 'evidence', (source) =>
    JSON.stringify({
      ...(JSON.parse(source) as Record<string, unknown>),
      candidate,
      declarationDigest,
    }),
  );
  expect(() => inspect(setup)).toThrow('reviewed digest mismatch');
});

for (const [path, label] of [
  [pointerPath, 'pointer'],
  [`tmp/junit/performance/${invocationId}/manifest.json`, 'manifest'],
] as const) {
  test(`[TEST-AXES-058] refuses malformed ${label} UTF-8`, () => {
    const setup = fixture();
    writeFileSync(join(setup.root, path), Buffer.from([255]));
    expect(() => inspect(setup)).toThrow(`${label} is not UTF-8`);
  });
  test(`[TEST-AXES-058] refuses malformed ${label} JSON`, () => {
    const setup = fixture();
    writeFileSync(join(setup.root, path), '{');
    expect(() => inspect(setup)).toThrow(`${label} JSON is malformed`);
  });
  test(`[TEST-AXES-058] refuses nonrecord ${label}`, () => {
    const setup = fixture();
    writeFileSync(join(setup.root, path), '[]');
    expect(() => inspect(setup)).toThrow(`${label} is malformed`);
  });
}
for (const fault of ['absent', 'unreadable', 'symlink', 'nonregular'] as const)
  test(`[TEST-AXES-058] refuses ${fault} current pointer`, () => {
    const setup = fixture();
    const path = join(setup.root, pointerPath);
    if (fault === 'absent') rmSync(path);
    if (fault === 'unreadable') chmodSync(path, 0);
    if (fault === 'symlink') {
      const target = join(setup.root, 'outside-pointer');
      writeFileSync(target, readFileSync(path));
      rmSync(path);
      symlinkSync(target, path);
    }
    if (fault === 'nonregular') {
      rmSync(path);
      mkdirSync(path);
    }
    expect(() => inspect(setup)).toThrow(
      { absent: 'ENOENT', unreadable: 'EACCES', symlink: 'symlink', nonregular: 'regular file' }[
        fault
      ],
    );
  });
test('[TEST-AXES-058] refuses unknown manifest fields', () => {
  const setup = fixture();
  setup.manifest['unexpected'] = true;
  saveManifest(setup);
  expect(() => inspect(setup)).toThrow('manifest identity');
});
test('[TEST-AXES-058] refuses absent external Performance authority', () => {
  const setup = fixture();
  const { performance: _performance, ...policy } = setup.policy;
  writeFileSync(setup.policyPath, JSON.stringify(policy));
  expect(() => inspect(setup)).toThrow('needs policy.performance');
});
for (const checkout of [
  'relative',
  '/historical/../candidate',
  '/historical//candidate',
  '/historical\\candidate',
])
  test(`[TEST-AXES-058] refuses malformed historical checkout ${checkout}`, () => {
    const setup = fixture();
    rewrite(setup, 'discovery', (source) => {
      const report = JSON.parse(source) as RawReport;
      report.config.configFile = `${checkout}/${config}`;
      return JSON.stringify(report);
    });
    expect(() => inspect(setup)).toThrow('raw checkout is malformed');
  });
for (const [name, transform, message] of [
  ['doctype', (source: string) => '<!DOCTYPE testsuite>' + source, 'doctype'],
  [
    'foreign root',
    (source: string) => source.replace('wbs-fe-01.performance', 'foreign'),
    'structure',
  ],
  [
    'unexpected text',
    (source: string) => source.replace('</testsuite>', 'foreign</testsuite>'),
    'unexpected text',
  ],
  [
    'foreign classname',
    (source: string) => source.replace('classname="case.perf.spec.ts"', 'classname="foreign"'),
    'cases are malformed',
  ],
  [
    'duplicate outcome',
    (source: string) =>
      source.replace('/></testsuite>', '><failure/><skipped/></testcase></testsuite>'),
    'structure',
  ],
  [
    'malformed counts',
    (source: string) => source.replace('tests="1"', 'tests="1.5"'),
    'counts are malformed',
  ],
] as const)
  test(`[TEST-AXES-059] refuses JUnit ${name}`, () => {
    const setup = fixture();
    rewrite(setup, 'report', transform);
    expect(() => inspect(setup)).toThrow(message);
  });
test('[TEST-AXES-058] refuses malformed report UTF-8 despite matching digest', () => {
  const setup = fixture();
  const bytes = Buffer.from([255]);
  writeFileSync(join(setup.bundle, 'report.xml'), bytes);
  setup.manifest['report'] = { path: 'report.xml', digest: digestEvidenceBytes(bytes) };
  saveManifest(setup);
  expect(() => inspect(setup)).toThrow('report is not UTF-8');
});

test('[TEST-AXES-058] refuses foreign discovery config', () => {
  const setup = fixture();
  rewrite(setup, 'discovery', (source) => {
    const report = JSON.parse(source) as RawReport;
    report.config.configFile = '/outside/config.ts';
    return JSON.stringify(report);
  });
  expect(() => inspect(setup)).toThrow('raw config differs');
});
test('[TEST-AXES-059] refuses nonarray collected cases', () => {
  const setup = fixture();
  setup.manifest['collected'] = {};
  saveManifest(setup);
  expect(() => inspect(setup)).toThrow('collected cases are malformed');
});
test('[TEST-AXES-059] refuses selection jointly forged in policy and evidence against committed config', () => {
  const setup = fixture();
  const digest = '0'.repeat(64);
  setup.policy.performance.configDigest = digest;
  writeFileSync(setup.policyPath, JSON.stringify(setup.policy));
  const policyDigest = digestEvidenceBytes(readFileSync(setup.policyPath));
  setup.manifest['policyDigest'] = policyDigest;
  setup.evidence.policyDigest = policyDigest;
  setup.evidence.selection.configDigest = digest;
  setup.manifest['selection'] = setup.evidence.selection;
  saveManifest(setup);
  rewrite(setup, 'evidence', () => JSON.stringify(setup.evidence));
  expect(() => inspect(setup)).toThrow('committed selection differs');
});

test('[TEST-AXES-058] refuses committed symlink fixture source', () => {
  const setup = fixture();
  rmSync(join(setup.root, fixturePath));
  symlinkSync(config, join(setup.root, fixturePath));
  git(setup.root, ['add', fixturePath]);
  git(setup.root, ['commit', '-m', 'symlink fixture']);
  setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
  expect(() => inspect(setup)).toThrow('not a regular blob');
});
test('[TEST-AXES-059] shared parser refuses noncanonical base64 attachment', () => {
  const setup = fixture();
  rewrite(setup, 'run', (source) => {
    const report = JSON.parse(source) as RawReport;
    report.suites[0].specs[0].tests[0].results[0].attachments[0].body += '\n';
    return JSON.stringify(report);
  });
  expect(() => inspect(setup)).toThrow('base64 is malformed');
});

test('[TEST-AXES-059] current-success pointer refuses retained failure diagnostics', () => {
  const setup = fixture();
  writeFileSync(join(setup.bundle, 'failure.json'), JSON.stringify({ message: 'cleanup failed' }));
  expect(() => inspect(setup)).toThrow('failure diagnostic');
});

test('[TEST-AXES-059] refuses distant historical fixture root at containment boundary', () => {
  const setup = fixture();
  rewrite(setup, 'run', (source) => {
    const report = JSON.parse(source) as RawReport;
    report.config.rootDir = '/outside/foreign/path/longer/than/the/historical/checkout';
    return JSON.stringify(report);
  });
  expect(() => inspect(setup)).toThrow('normalized workspace path');
});
for (const fault of ['duplicate', 'missing', 'extra'] as const)
  test(`[TEST-AXES-059] refuses ${fault} evidence cases despite updated digest`, () => {
    const setup = fixture();
    rewrite(setup, 'evidence', (source) => {
      const evidence = JSON.parse(source) as ReturnType<typeof fixture>['evidence'];
      if (fault === 'duplicate') evidence.run.cases.push(structuredClone(evidence.run.cases[0]));
      if (fault === 'missing') evidence.run.cases = [];
      if (fault === 'extra')
        evidence.run.cases.push({ ...structuredClone(evidence.run.cases[0]), caseId: 'other' });
      return JSON.stringify(evidence);
    });
    expect(() => inspect(setup)).toThrow(
      fault === 'duplicate' ? 'duplicate Performance execution' : 'evidence differs',
    );
  });

test('[TEST-AXES-058] failure diagnostic absence refuses unreadable state through production CLI', async () => {
  const setup = fixture();
  chmodSync(setup.bundle, 0);
  try {
    const invocation = await invokeCli([
      'inspect-performance',
      setup.root,
      setup.revision,
      setup.policyPath,
    ]);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('cannot inspect failure diagnostic absence');
  } finally {
    chmodSync(setup.bundle, 0o700);
  }
});

for (const field of ['schemaVersion', 'certifies', 'invocationId', 'bundle'] as const)
  test(`[TEST-AXES-058] refuses foreign pointer ${field}`, () => {
    const setup = fixture();
    const path = join(setup.root, pointerPath);
    const pointer = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    pointer[field] = field === 'certifies' ? true : 'foreign';
    writeFileSync(path, JSON.stringify(pointer));
    expect(() => inspect(setup)).toThrow('pointer identity');
  });
test('[TEST-AXES-059] refuses overflowing JUnit count', () => {
  const setup = fixture();
  rewrite(setup, 'report', (source) => source.replace('tests="1"', 'tests="9007199254740992"'));
  expect(() => inspect(setup)).toThrow('counts are malformed');
});

test('[TEST-AXES-059] refuses non-UTF-8 JUnit declaration', () => {
  const setup = fixture();
  rewrite(setup, 'report', (source) => '<?xml version="1.0" encoding="ISO-8859-1"?>' + source);
  expect(() => inspect(setup)).toThrow('encoding');
});

test('[TEST-AXES-059] production CLI refuses foreign JUnit CDATA despite matching report digest', async () => {
  const setup = fixture();
  rewrite(setup, 'report', (source) =>
    source.replace('</testsuite>', '<![CDATA[foreign]]></testsuite>'),
  );
  const invocation = await invokeCli([
    'inspect-performance',
    setup.root,
    setup.revision,
    setup.policyPath,
  ]);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('unexpected text');
});
