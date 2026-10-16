import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { invokeCli } from '../invoke-cli';
import { buildPackage } from '../packaging/build';
import type { inspectBrowserScenarioLedger } from './browser-scenario-ledger';
import {
  type BrowserLedgerFixture,
  createBrowserLedgerFixture,
  createBrowserLedgerManualFixture,
  publishBrowserLedgerCases,
  repinBrowserLedger,
} from './browser-scenario-ledger.fixture';
import { hashCanonical } from './content-manifest';
import { removePerformanceFixtures } from './performance-scenarios.fixture';
afterEach(removePerformanceFixtures);
const now = '2026-10-15T00:00:00.000Z';
const operands = (setup: BrowserLedgerFixture) => [
  'inspect-browser-scenario-ledger',
  setup.root,
  setup.revision,
  setup.policyPath,
  'example',
  setup.ledgerPath,
  '--now',
  now,
];
const inspect = (setup: BrowserLedgerFixture) => invokeCli(operands(setup));
interface MutableAuthority {
  schemaVersion: number;
  browser: {
    mode: string;
    observationDigest: string;
    reviewAuthorityPath: string;
    [key: string]: unknown;
  };
  obligations: {
    scenarioId: string;
    disposition: { kind: string; lowestSufficientLevel?: string; [key: string]: unknown };
  }[];
  [key: string]: unknown;
}
function rewrite(setup: BrowserLedgerFixture, change: (authority: MutableAuthority) => void) {
  const authority = JSON.parse(readFileSync(setup.ledgerPath, 'utf8')) as MutableAuthority;
  change(authority);
  writeFileSync(setup.ledgerPath, JSON.stringify(authority));
}
async function facts(setup: BrowserLedgerFixture, exitCode = 0) {
  const call = await inspect(setup);
  expect(call.exitCode, call.stderr).toBe(exitCode);
  expect(call.stderr).toBe('');
  return JSON.parse(call.stdout) as ReturnType<typeof inspectBrowserScenarioLedger>;
}
async function refuse(setup: BrowserLedgerFixture, diagnostic = '') {
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stdout).toBe('');
  expect(call.stderr).toContain(diagnostic);
}

test('[TEST-AXES-136] Browser-only ledger preserves full observations without Performance execution', async () => {
  const setup = createBrowserLedgerFixture();
  const upstream = repinBrowserLedger(setup);
  const observed = await facts(setup);
  expect(observed.schemaVersion).toBe(1);
  expect(observed.browser).toEqual(upstream.browser);
  expect(observed).not.toHaveProperty('performance');
  expect(existsSync(join(setup.root, 'tmp/junit/performance'))).toBe(false);
  expect(existsSync(setup.authorityPath)).toBe(false);
  expect(existsSync(join(setup.root, 'tmp/junit/wbs-fe-01.performance.current.json'))).toBe(false);
  for (const path of Object.values(setup.paths)) expect(existsSync(path)).toBe(true);
  expect(observed.scenarios[0].verdict).toEqual({
    kind: 'passing-in-selection',
    cases: upstream.browser.report.cases,
  });
  expect(observed.debt).toEqual([]);
  expect(observed.authentication).toEqual({ kind: 'absent' });
  expect(observed.certifies).toBe(false);
  const { observationDigest, ...payload } = observed;
  expect(observationDigest).toBe(hashCanonical(payload));
  rewrite(setup, (a) => a.obligations.reverse());
  expect(await facts(setup)).toEqual(observed);
});
for (const [name, change] of [
  ['missing Browser', (a: MutableAuthority) => Reflect.deleteProperty(a, 'browser')],
  ['extra Browser', (a: MutableAuthority) => (a.browser['observation'] = {})],
  ['unknown mode', (a: MutableAuthority) => (a.browser.mode = 'unknown')],
  ['wrong pin', (a: MutableAuthority) => (a.browser.observationDigest = '0'.repeat(64))],
  ['extra authority', (a: MutableAuthority) => (a['extra'] = true)],
  ['unsupported version', (a: MutableAuthority) => (a.schemaVersion = 3)],
] as const)
  test(`[TEST-AXES-137] closed Browser-only authority refuses ${name}`, async () => {
    const setup = createBrowserLedgerFixture();
    rewrite(setup, change);
    await refuse(setup, name === 'wrong pin' ? 'scenario ledger Browser' : 'Validation failed:');
  });

for (const member of [
  'mode',
  'reviewAuthorityPath',
  'conformanceAuthorityPath',
  'architectureAuthorityPath',
  'performanceAuthorityPath',
  'observationDigest',
] as const)
  test(`[TEST-AXES-137] closed Browser-only authority requires Browser ${member}`, async () => {
    const setup = createBrowserLedgerFixture();
    rewrite(setup, (a) => {
      Reflect.deleteProperty(a.browser, member);
    });
    await refuse(setup, 'Validation failed:');
  });
test('[TEST-AXES-137] real Browser inspector runs without Browser obligations', async () => {
  const setup = createBrowserLedgerFixture();
  rewrite(setup, (a) => {
    a.obligations = [];
  });
  const review = JSON.parse(readFileSync(setup.paths.review, 'utf8')) as {
    memberships: { level: string; kind: string }[];
  };
  review.memberships.find((row) => row.level === 'manual')!.kind = 'unknown';
  writeFileSync(setup.paths.review, JSON.stringify(review));
  await refuse(setup, 'Browser levels requires Manual reviewed-empty');
});
for (const member of ['review', 'conformance', 'architecture', 'performance'] as const)
  for (const fault of [
    'relative',
    'noncanonical',
    'internal',
    'symlink',
    'missing',
    'unreadable',
    'directory',
    'malformed',
    'invalid UTF8',
  ] as const)
    test(`[TEST-AXES-137] Browser ${member} authority path refuses ${fault} without Browser obligations`, async () => {
      const setup = createBrowserLedgerFixture();
      const authorityPath = setup.paths[member];
      const replace = (path: string) => {
        rewrite(setup, (a) => {
          a.obligations = [];
          a.browser[`${member}AuthorityPath`] = path;
        });
      };
      replace(authorityPath);
      if (fault === 'relative') replace(basename(authorityPath));
      if (fault === 'noncanonical')
        replace(
          dirname(authorityPath) +
            '/../' +
            basename(dirname(authorityPath)) +
            '/' +
            basename(authorityPath),
        );
      if (fault === 'internal') {
        const path = join(setup.root, 'authority.json');
        writeFileSync(path, readFileSync(authorityPath));
        replace(path);
      }
      if (fault === 'symlink') {
        const path = join(dirname(authorityPath), 'link.json');
        symlinkSync(authorityPath, path);
        replace(path);
      }
      if (fault === 'missing') rmSync(authorityPath);
      if (fault === 'unreadable') chmodSync(authorityPath, 0);
      if (fault === 'directory') {
        rmSync(authorityPath);
        mkdirSync(authorityPath);
      }
      if (fault === 'malformed') writeFileSync(authorityPath, '{bad');
      if (fault === 'invalid UTF8') writeFileSync(authorityPath, Buffer.from([0xff]));
      await refuse(setup);
    });

for (const [statuses, kind, exitCode] of [
  [['passed', 'passed'], 'passing-in-selection', 0],
  [['passed', 'skipped'], 'skipped-in-selection', 1],
  [['skipped', 'failed', 'passed'], 'failed-in-selection', 1],
] as const)
  test(`[TEST-AXES-138] Browser outcomes ${statuses.join('/')} map to ${kind}`, async () => {
    const setup = createBrowserLedgerFixture();
    publishBrowserLedgerCases(
      setup,
      statuses.map((status, index) => ({ title: `[EXAMPLE-001] case ${String(index)}`, status })),
    );
    const { browser } = repinBrowserLedger(setup);
    const observed = await facts(setup, exitCode);
    expect(observed.scenarios[0].verdict).toEqual({
      kind,
      cases:
        browser.scenarios[0].observation.kind === 'observed'
          ? browser.scenarios[0].observation.cases
          : [],
    });
    expect(observed.debt).toEqual(
      exitCode === 0 ? [] : [{ kind: 'scenario', scenarioId: 'EXAMPLE-001', verdict: kind }],
    );
  });
test('[TEST-AXES-138] absence remains unobserved and Browser never satisfies another lowest level', async () => {
  const setup = createBrowserLedgerFixture();
  publishBrowserLedgerCases(setup, [{ title: '[EXAMPLE-002] second', status: 'passed' }]);
  repinBrowserLedger(setup);
  expect((await facts(setup, 1)).scenarios[0].verdict).toEqual({ kind: 'unobserved-in-selection' });
  rewrite(setup, (a) => (a.obligations[0].disposition.lowestSufficientLevel = 'performance'));
  expect((await facts(setup, 1)).scenarios[0].verdict).toEqual({
    kind: 'unsupported-level',
    level: 'performance',
  });
  rewrite(setup, (a) => (a.obligations[0].disposition.lowestSufficientLevel = 'unit'));
  expect((await facts(setup, 1)).scenarios[0].verdict).toEqual({
    kind: 'unsupported-level',
    level: 'unit',
  });
});
test('[TEST-AXES-138] source-labelled citation debt and shared unidentified B3 debt remain once', async () => {
  const setup = createBrowserLedgerFixture({
    'openspec/specs/debt/spec.md':
      '## Requirements\n### Requirement: Debt\n#### Scenario: unidentified\n- **WHEN** read\n- **THEN** debt\n',
  });
  publishBrowserLedgerCases(setup, [{ title: 'missing Browser citation', status: 'failed' }]);
  const { browser } = repinBrowserLedger(setup);
  const observed = await facts(setup, 1);
  expect(observed.debt).toEqual([
    { kind: 'scenario', scenarioId: 'EXAMPLE-001', verdict: 'unobserved-in-selection' },
    {
      kind: 'citation',
      source: 'browser',
      caseId: browser.report.cases[0].caseId,
      finding: 'missing',
    },
    { kind: 'unidentified', path: 'openspec/specs/debt/spec.md', title: 'unidentified' },
  ]);
});
function inject(setup: BrowserLedgerFixture, mutation: string, name: string) {
  const modulePath = join(import.meta.dir, 'browser-scenarios.ts');
  const preload = join(dirname(setup.policyPath), 'fault-preload.ts');
  writeFileSync(
    preload,
    `import {mock} from 'bun:test';import {readFileSync,writeFileSync} from 'node:fs';const actual=await import(${JSON.stringify(modulePath + '?real-fault')});const {hashCanonical}=await import(${JSON.stringify(join(import.meta.dir, 'content-manifest.ts'))});const seal=(value)=>{const {observationDigest,...payload}=value;return {...payload,observationDigest:hashCanonical(payload)}};let observed=actual.inspectBrowserScenarios(...${JSON.stringify([setup.root, setup.revision, setup.policyPath, 'ordinary', setup.paths.review, setup.paths.conformance, setup.paths.architecture, setup.paths.performance, 'example'])});${mutation};
if (${JSON.stringify(name)} !== 'nested report identity' && !${JSON.stringify(name)}.startsWith('levels')) observed={...observed,levels:seal({...observed.levels,review:{...observed.levels.review,report:observed.report}})};
if (${JSON.stringify(name)} !== 'levels pin') observed={...observed,levelsObservationDigest:observed.levels.observationDigest};
if (${JSON.stringify(name)} !== 'report pin') observed={...observed,reportObservationDigest:observed.report.observationDigest};
if (${JSON.stringify(name)} !== 'outer digest') observed=seal(observed);
const authority=JSON.parse(readFileSync(${JSON.stringify(setup.ledgerPath)},'utf8'));authority.browser.observationDigest=observed.observationDigest;writeFileSync(${JSON.stringify(setup.ledgerPath)},JSON.stringify(authority));mock.module(${JSON.stringify(modulePath)},()=>({...actual,inspectBrowserScenarios:()=>observed}));`,
  );
  return Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '../cli.ts'),
      ...operands(setup),
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
}
for (const [name, mutation] of [
  ['outer revision', "observed=seal({...observed,revision:'0'.repeat(40)})"],
  ['outer candidate', "observed=seal({...observed,candidate:'0'.repeat(64)})"],
  ['capability', "observed=seal({...observed,capability:'foreign'})"],
  ['mode', "observed=seal({...observed,mode:'portable'})"],
  ['policy', "observed=seal({...observed,policyDigest:'0'.repeat(64)})"],
  ['policy id', "observed=seal({...observed,policyId:'foreign'})"],
  ['outer digest', "observed={...observed,observationDigest:'0'.repeat(64)}"],
  ['authentication', "observed=seal({...observed,authentication:{kind:'present'}})"],
  ['certification', 'observed=seal({...observed,certifies:true})'],
  [
    'B3 report',
    "observed=seal({...observed,specifications:{...observed.specifications,unidentified:[] ,candidate:'foreign'}})",
  ],
  ['scenario inventory', 'observed=seal({...observed,scenarios:observed.scenarios.slice(1)})'],
  [
    'scenario title',
    "observed=seal({...observed,scenarios:observed.scenarios.map(entry=>({...entry,title:'foreign'}))})",
  ],
  ...['levels', 'report'].flatMap((member) => [
    [
      `${member} revision`,
      `observed=seal({...observed,${member}:seal({...observed.${member},revision:'0'.repeat(40)})})`,
    ],
    [
      `${member} candidate`,
      `observed=seal({...observed,${member}:seal({...observed.${member},candidate:'0'.repeat(64)})})`,
    ],
    [
      `${member} mode`,
      `observed=seal({...observed,${member}:seal({...observed.${member},mode:'portable'})})`,
    ],
    [
      `${member} digest`,
      `observed=seal({...observed,${member}:{...observed.${member},observationDigest:'0'.repeat(64)}})`,
    ],
    [
      `${member} authentication`,
      `observed=seal({...observed,${member}:seal({...observed.${member},authentication:{kind:'present'}})})`,
    ],
    [
      `${member} certification`,
      `observed=seal({...observed,${member}:seal({...observed.${member},certifies:true})})`,
    ],
  ]),
  ['scope mode', "observed=seal({...observed,scope:{...observed.scope,mode:'portable'}})"],
  [
    'scope invocation',
    "observed=seal({...observed,scope:{...observed.scope,invocationId:'foreign'}})",
  ],
  [
    'isolation',
    "observed=seal({...observed,levels:seal({...observed.levels,isolation:{kind:'wrong-level',level:'browser',files:[]}})})",
  ],
  ['levels pin', "observed=seal({...observed,levelsObservationDigest:'0'.repeat(64)})"],
  ['report pin', "observed=seal({...observed,reportObservationDigest:'0'.repeat(64)})"],
  [
    'nested report identity',
    "observed=seal({...observed,levels:seal({...observed.levels,review:{...observed.levels.review,report:seal({...observed.report,invocationId:'foreign'})}})})",
  ],
  [
    'report policy',
    "observed=seal({...observed,report:seal({...observed.report,policyDigest:'0'.repeat(64)})})",
  ],
] as const)
  test(`[TEST-AXES-137] WATCH_${name} repinned real Browser dependency fault refuses`, () => {
    const setup = createBrowserLedgerFixture();
    const call = inject(setup, mutation, name);
    expect(call.exitCode).toBe(1);
    expect(call.stdout.toString()).toBe('');
    expect(call.stderr.toString()).toContain('scenario ledger Browser');
  });

test('[TEST-AXES-139] unrelated full-tree competing overlays refuse before filtering', async () => {
  const setup = createBrowserLedgerFixture();
  const content =
    '## ADDED Requirements\n### Requirement: Debt\n#### Scenario: debt\n- **WHEN** read\n- **THEN** debt\n';
  for (const name of ['one', 'two']) {
    const folder = join(setup.root, 'openspec/changes', name, 'specs/debt');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'spec.md'), content);
  }
  for (const args of [
    ['add', 'openspec'],
    ['commit', '-m', 'conflict'],
  ]) {
    const call = Bun.spawnSync(['git', '-C', setup.root, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (call.exitCode !== 0) throw new Error(call.stderr.toString());
  }
  const head = Bun.spawnSync(['git', '-C', setup.root, 'rev-parse', 'HEAD'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (head.exitCode !== 0) throw new Error(head.stderr.toString());
  setup.revision = head.stdout.toString().trim();
  await refuse(setup, 'competing overlay operation: debt');
});
test('[TEST-AXES-139] installed dispatch matches Browser-only JSON and debt exits', async () => {
  const setup = createBrowserLedgerFixture();
  const packageRoot = join(dirname(setup.policyPath), 'package');
  await buildPackage(packageRoot);
  const run = () =>
    Bun.spawnSync([process.execPath, join(packageRoot, 'dist/bin.mjs'), ...operands(setup)], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  for (const status of ['passed', 'skipped'] as const) {
    publishBrowserLedgerCases(setup, [
      { title: '[EXAMPLE-001] outcome', status },
      { title: '[EXAMPLE-002] companion', status: 'passed' },
    ]);
    repinBrowserLedger(setup);
    const source = await inspect(setup);
    const installed = run();
    expect(installed.exitCode).toBe(source.exitCode);
    expect(installed.stdout.toString()).toBe(source.stdout);
    expect(source.stderr).toBe('');
    if (status === 'passed') expect(installed.stderr.toString()).toBe('');
    else expect(installed.stderr.toString()).toContain('Twilight Burokrat validator exited 1');
  }
  rewrite(setup, (a) => (a.browser['extra'] = true));
  const refused = run();
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout.toString()).toBe('');
  expect(refused.stderr.toString().length).toBeGreaterThan(0);
}, 120000);
for (const [field, value] of [
  ['revision', '0'.repeat(40)],
  ['candidate', '0'.repeat(64)],
  ['capability', 'foreign'],
  ['schemaVersion', 99],
  ['extra', true],
] as const)
  test(`[TEST-AXES-137] refuses authority ${field} substitution`, async () => {
    const setup = createBrowserLedgerFixture();
    rewrite(setup, (authority) => {
      Reflect.set(authority, field, value);
    });
    const invocation = await inspect(setup);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(field);
  });
for (const [name, obligations] of [
  [
    'duplicate',
    [
      { scenarioId: 'EXAMPLE-001', disposition: { kind: 'inapplicable', reason: 'reason' } },
      {
        scenarioId: 'EXAMPLE-001',
        disposition: { kind: 'automated', lowestSufficientLevel: 'performance' },
      },
    ],
  ],
  [
    'foreign',
    [{ scenarioId: 'EXAMPLE-999', disposition: { kind: 'inapplicable', reason: 'reason' } }],
  ],
  [
    'blank reason',
    [{ scenarioId: 'EXAMPLE-001', disposition: { kind: 'inapplicable', reason: '  ' } }],
  ],
  ['unknown disposition', [{ scenarioId: 'EXAMPLE-001', disposition: { kind: 'guess' } }]],
  [
    'unknown level',
    [
      {
        scenarioId: 'EXAMPLE-001',
        disposition: { kind: 'automated', lowestSufficientLevel: 'guess' },
      },
    ],
  ],
  [
    'nested unknown',
    [
      {
        scenarioId: 'EXAMPLE-001',
        disposition: { kind: 'automated', lowestSufficientLevel: 'performance', extra: true },
      },
    ],
  ],
] as const)
  test(`[TEST-AXES-137] refuses ${name}`, async () => {
    const setup = createBrowserLedgerFixture();
    rewrite(setup, (authority) => {
      authority.obligations = [...obligations];
    });
    const invocation = await inspect(setup);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr.length).toBeGreaterThan(0);
    if (name.startsWith('unknown') || name === 'nested unknown')
      expect(invocation.stderr).toContain('Validation failed:');
  });
for (const fault of [
  'missing',
  'unreadable',
  'directory',
  'symlink',
  'invalid UTF8',
  'invalid JSON',
])
  test(`[TEST-AXES-137] refuses ${fault} ledger authority`, async () => {
    const setup = createBrowserLedgerFixture();
    if (fault === 'missing') rmSync(setup.ledgerPath);
    else if (fault === 'unreadable') chmodSync(setup.ledgerPath, 0);
    else if (fault === 'directory') {
      rmSync(setup.ledgerPath);
      mkdirSync(setup.ledgerPath);
    } else if (fault === 'symlink') {
      const target = setup.ledgerPath + '.target';
      writeFileSync(target, readFileSync(setup.ledgerPath));
      rmSync(setup.ledgerPath);
      symlinkSync(target, setup.ledgerPath);
    } else if (fault === 'invalid UTF8') {
      const bytes = readFileSync(setup.ledgerPath);
      const offset = bytes.indexOf('No second');
      bytes[offset] = 0xff;
      writeFileSync(setup.ledgerPath, bytes);
    } else writeFileSync(setup.ledgerPath, '{broken');
    try {
      const invocation = await inspect(setup);
      expect(invocation.exitCode).toBe(1);
      expect(invocation.stdout).toBe('');
      expect(invocation.stderr.length).toBeGreaterThan(0);
      if (fault === 'directory') expect(invocation.stderr).toContain('not a regular file');
      if (fault === 'symlink') expect(invocation.stderr).toContain('contains a symlink');
    } finally {
      if (fault === 'unreadable') chmodSync(setup.ledgerPath, 0o600);
    }
  });
for (const [outcome, overdue, state] of [
  ['passed', false, 'current'],
  ['failed', false, 'failed'],
  ['skipped', false, 'failed'],
  ['passed', true, 'overdue'],
  ['passed', false, 'stale'],
] as const) {
  test(`[TEST-AXES-138] joins real Manual ${outcome} ${state}`, async () => {
    const setup = createBrowserLedgerManualFixture(outcome, overdue, state === 'stale');
    const invocation = await invokeCli([
      'inspect-browser-scenario-ledger',
      setup.root,
      setup.revision,
      setup.policyPath,
      'example',
      setup.ledgerPath,
      '--now',
      now,
    ]);
    expect(invocation.stderr).toBe('');
    expect(invocation.exitCode).toBe(state === 'current' ? 0 : 1);
    const observation = JSON.parse(invocation.stdout) as ReturnType<
      typeof inspectBrowserScenarioLedger
    >;
    expect(observation.scenarios[0].verdict).toEqual({
      kind: 'manual',
      observation: setup.observation,
    });
    expect(setup.observation.manual.state).toBe(state);
    expect(observation.debt).toEqual(
      state === 'current' ? [] : [{ kind: 'scenario', scenarioId: 'EXAMPLE-001', verdict: state }],
    );
  });
}

for (const level of ['manual', 'conformance', 'architecture', 'performance', 'api', 'unit'])
  test(`[TEST-AXES-138] Browser never credits automated ${level}`, async () => {
    const setup = createBrowserLedgerFixture();
    rewrite(setup, (a) => {
      a.obligations[0].disposition.lowestSufficientLevel = level;
    });
    const observed = await facts(setup, 1);
    expect(observed.scenarios[0].verdict).toEqual({ kind: 'unsupported-level', level });
    expect(observed.debt).toEqual([
      { kind: 'scenario', scenarioId: 'EXAMPLE-001', verdict: 'unsupported-level' },
    ]);
  });
test('[TEST-AXES-138] omitted obligations remain unassigned and inapplicable reason stays explicit', async () => {
  const setup = createBrowserLedgerFixture();
  rewrite(setup, (a) => {
    a.obligations = a.obligations.slice(1);
  });
  const observed = await facts(setup, 1);
  expect(observed.scenarios.map((row) => row.verdict)).toEqual([
    { kind: 'unassigned' },
    { kind: 'inapplicable', reason: 'No second control.' },
  ]);
  expect(observed.debt).toEqual([
    { kind: 'scenario', scenarioId: 'EXAMPLE-001', verdict: 'unassigned' },
  ]);
});
for (const fault of ['missing', 'unreadable', 'malformed', 'invalid UTF8'])
  test(`[TEST-AXES-137] real Manual report refuses ${fault}`, async () => {
    const setup = createBrowserLedgerManualFixture();
    if (fault === 'missing') rmSync(setup.reportPath);
    if (fault === 'unreadable') chmodSync(setup.reportPath, 0);
    if (fault === 'malformed') writeFileSync(setup.reportPath, '{bad');
    if (fault === 'invalid UTF8') writeFileSync(setup.reportPath, Buffer.from([0xff]));
    try {
      await refuse(setup);
    } finally {
      if (fault === 'unreadable') chmodSync(setup.reportPath, 0o600);
    }
  });
for (const fault of ['extra', 'missing', 'flag', 'instant'])
  test(`[TEST-AXES-139] CLI refuses ${fault} operand`, async () => {
    const setup = createBrowserLedgerFixture();
    const args = operands(setup);
    if (fault === 'extra') args.push('extra');
    if (fault === 'missing') args.pop();
    if (fault === 'flag') args[6] = '--date';
    if (fault === 'instant') args[7] = 'yesterday';
    const call = await invokeCli(args);
    expect(call.exitCode).toBe(1);
    expect(call.stdout).toBe('');
    expect(call.stderr.length).toBeGreaterThan(0);
  });
for (const revision of ['HEAD', 'a'.repeat(39)])
  test(`[TEST-AXES-137] refuses non-full committed revision ${revision}`, async () => {
    const setup = createBrowserLedgerFixture();
    setup.revision = revision;
    await refuse(setup, 'full committed SHA');
  });
test('[TEST-AXES-137] annotated tag object never becomes the selected commit', async () => {
  const setup = createBrowserLedgerFixture();
  const git = (args: string[]) => {
    const call = Bun.spawnSync(['git', '-C', setup.root, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (call.exitCode !== 0) throw new Error(call.stderr.toString());
    return call.stdout.toString().trim();
  };
  git(['tag', '-a', 'selected', '-m', 'selected']);
  setup.revision = git(['rev-parse', 'selected']);
  await refuse(setup, 'exact committed selection');
});
for (const fault of ['missing scenarios', 'absent capability', 'requested unidentified'])
  test(`[TEST-AXES-137] selection refuses ${fault}`, async () => {
    const setup = createBrowserLedgerFixture();
    if (fault === 'requested unidentified') {
      writeFileSync(
        join(setup.root, 'openspec/specs/example/spec.md'),
        readFileSync(join(setup.root, 'openspec/specs/example/spec.md'), 'utf8') +
          '\n#### Scenario: unidentified\n- **WHEN** read\n- **THEN** debt\n',
      );
      for (const args of [
        ['add', 'openspec'],
        ['commit', '-m', 'unidentified'],
      ]) {
        const call = Bun.spawnSync(['git', '-C', setup.root, ...args], {
          stdout: 'pipe',
          stderr: 'pipe',
        });
        if (call.exitCode !== 0) throw new Error(call.stderr.toString());
      }
      const head = Bun.spawnSync(['git', '-C', setup.root, 'rev-parse', 'HEAD'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (head.exitCode !== 0) throw new Error(head.stderr.toString());
      setup.revision = head.stdout.toString().trim();
    }
    if (fault === 'missing scenarios') {
      const policy = JSON.parse(readFileSync(setup.policyPath, 'utf8')) as Record<string, unknown>;
      Reflect.deleteProperty(policy, 'scenarios');
      writeFileSync(setup.policyPath, JSON.stringify(policy));
    }
    const args = operands(setup);
    if (fault === 'absent capability') args[4] = 'absent';
    const call = await invokeCli(args);
    expect(call.exitCode).toBe(1);
    expect(call.stdout).toBe('');
    expect(call.stderr).toContain(
      fault === 'missing scenarios'
        ? 'policy.scenarios'
        : fault === 'absent capability'
          ? 'capability is absent'
          : 'unidentified',
    );
  });
for (const [name, replacement] of [
  ['revision', "revision:'0'.repeat(40)"],
  ['candidate', "candidate:'0'.repeat(64)"],
  ['evaluation', "evaluatedAt:'2026-10-14T00:00:00.000Z'"],
  ['nested revision', "manual:{...observation.manual, revision:'0'.repeat(40)}"],
  ['policy', "manual:{...observation.manual, policyDigest:'0'.repeat(64)}"],
  ['scenario', "manual:{...observation.manual, scenarioId:'EXAMPLE-002'}"],
  [
    'nested scenario',
    "manual:{...observation.manual, selectedScenario:{...observation.manual.selectedScenario,id:'EXAMPLE-002'}}",
  ],
  [
    'title',
    "manual:{...observation.manual, selectedScenario:{...observation.manual.selectedScenario,title:'foreign'}}",
  ],
  ['authentication', "authentication:{kind:'present'}"],
  ['certifies', 'certifies:true'],
  ['nested certifies', 'manual:{...observation.manual,certifies:true}'],
  ['digest', "observationDigest:'0'.repeat(64)"],
] as const) {
  test(`[TEST-AXES-137] refuses substituted Manual ${name} despite repinned outer digest`, () => {
    const setup = createBrowserLedgerManualFixture();
    const modulePath = join(import.meta.dir, 'manual-observation.ts');
    const preload = join(dirname(setup.policyPath), 'substitute.ts');
    writeFileSync(
      preload,
      `import {mock} from 'bun:test';\nimport {hashCanonical} from ${JSON.stringify(join(import.meta.dir, 'content-manifest.ts'))};\nconst actual=await import(${JSON.stringify(modulePath + '?actual')});\nmock.module(${JSON.stringify(modulePath)},()=>({...actual,inspectManualObservation:(...args)=>{const observation=actual.inspectManualObservation(...args);const substituted={...observation,${replacement}};const {observationDigest,...payload}=substituted;return {...payload,observationDigest:${name === 'digest' ? "'0'.repeat(64)" : 'hashCanonical(payload)'}};}}));\n`,
    );
    // Repin the injected observation so exact-field joins, independently of the digest pin, are exercised.
    const payload: Record<string, unknown> = { ...setup.observation };
    delete payload['observationDigest'];
    const manual = setup.observation.manual;
    switch (name) {
      case 'revision':
        payload['revision'] = '0'.repeat(40);
        break;
      case 'candidate':
        payload['candidate'] = '0'.repeat(64);
        break;
      case 'evaluation':
        payload['evaluatedAt'] = '2026-10-14T00:00:00.000Z';
        break;
      case 'nested revision':
        payload['manual'] = { ...manual, revision: '0'.repeat(40) };
        break;
      case 'policy':
        payload['manual'] = { ...manual, policyDigest: '0'.repeat(64) };
        break;
      case 'scenario':
        payload['manual'] = { ...manual, scenarioId: 'EXAMPLE-002' };
        break;
      case 'nested scenario':
        payload['manual'] = {
          ...manual,
          selectedScenario: { ...manual.selectedScenario, id: 'EXAMPLE-002' },
        };
        break;
      case 'title':
        payload['manual'] = {
          ...manual,
          selectedScenario: { ...manual.selectedScenario, title: 'foreign' },
        };
        break;
      case 'authentication':
        payload['authentication'] = { kind: 'present' };
        break;
      case 'certifies':
        payload['certifies'] = true;
        break;
      case 'nested certifies':
        payload['manual'] = { ...manual, certifies: true };
        break;
      case 'digest':
        break;
    }
    rewrite(setup, (a) => {
      a.obligations[0].disposition['observationDigest'] =
        name === 'digest' ? '0'.repeat(64) : hashCanonical(payload);
    });
    const invocation = Bun.spawnSync(
      [
        process.execPath,
        'run',
        `--preload=${preload}`,
        join(import.meta.dir, '../cli.ts'),
        'inspect-browser-scenario-ledger',
        setup.root,
        setup.revision,
        setup.policyPath,
        'example',
        setup.ledgerPath,
        '--now',
        now,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout.toString()).toBe('');
    expect(invocation.stderr.toString()).toContain(
      name === 'digest' ? 'Manual observationDigest differs' : 'Manual observation join differs',
    );
  });
}

for (const field of [
  'schemaVersion',
  'revision',
  'candidate',
  'capability',
  'browser',
  'obligations',
])
  test(`[TEST-AXES-137] closed authority requires ${field}`, async () => {
    const setup = createBrowserLedgerFixture();
    rewrite(setup, (a) => {
      Reflect.deleteProperty(a, field);
    });
    await refuse(setup, 'Validation failed:');
  });
for (const [field, value] of [
  ['revision', 'HEAD'],
  ['candidate', 'bad'],
  ['capability', ''],
] as const)
  test(`[TEST-AXES-137] authority rejects malformed ${field}`, async () => {
    const setup = createBrowserLedgerFixture();
    rewrite(setup, (a) => {
      Reflect.set(a, field, value);
    });
    await refuse(setup, 'Validation failed:');
  });
for (const fault of ['relative', 'noncanonical', 'internal', 'ancestor symlink'])
  test(`[TEST-AXES-137] ledger authority refuses ${fault} path`, async () => {
    const setup = createBrowserLedgerFixture();
    const args = operands(setup);
    if (fault === 'relative') args[5] = basename(setup.ledgerPath);
    if (fault === 'noncanonical')
      args[5] =
        dirname(setup.ledgerPath) +
        '/../' +
        basename(dirname(setup.ledgerPath)) +
        '/' +
        basename(setup.ledgerPath);
    if (fault === 'internal') {
      args[5] = join(setup.root, 'ledger.json');
      writeFileSync(args[5], readFileSync(setup.ledgerPath));
    }
    if (fault === 'ancestor symlink') {
      const path = join(dirname(setup.policyPath), 'linked');
      symlinkSync(dirname(setup.ledgerPath), path);
      args[5] = join(path, basename(setup.ledgerPath));
    }
    const call = await invokeCli(args);
    expect(call.exitCode).toBe(1);
    expect(call.stdout).toBe('');
    expect(call.stderr).toContain(
      fault === 'internal'
        ? 'inside selected candidate'
        : fault === 'ancestor symlink'
          ? 'contains a symlink'
          : 'canonical absolute',
    );
  });
test('[TEST-AXES-137] Manual foreign pin refuses despite current real report', async () => {
  const setup = createBrowserLedgerManualFixture();
  rewrite(setup, (a) => {
    a.obligations[0].disposition['observationDigest'] = '0'.repeat(64);
  });
  await refuse(setup, 'Manual observation join differs');
});
for (const fault of ['kind', 'revision'])
  test(`[TEST-AXES-137] WATCH_selection ${fault} broken committed reader refuses`, () => {
    const setup = createBrowserLedgerFixture();
    const modulePath = join(import.meta.dir, '../inventory/read-candidate.ts');
    const preload = join(dirname(setup.policyPath), 'selection-fault.ts');
    writeFileSync(
      preload,
      `import {mock} from 'bun:test';const actual=await import(${JSON.stringify(modulePath + '?actual')});mock.module(${JSON.stringify(modulePath)},()=>({...actual,readCandidate:(...args)=>{const selected=actual.readCandidate(...args);return {...selected,selection:{...selected.selection,${fault === 'kind' ? "kind:'staged'" : "revision:'0'.repeat(40)"}}}}}));`,
    );
    const call = Bun.spawnSync(
      [
        process.execPath,
        'run',
        `--preload=${preload}`,
        join(import.meta.dir, '../cli.ts'),
        ...operands(setup),
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(call.exitCode).toBe(1);
    expect(call.stdout.toString()).toBe('');
    expect(call.stderr.toString()).toContain('exact committed selection differs');
  });

test('[TEST-AXES-137] authority refuses malformed scenarioId', async () => {
  const setup = createBrowserLedgerFixture();
  rewrite(setup, (a) => {
    a.obligations[0].scenarioId = 'bad';
  });
  await refuse(setup, 'Validation failed:');
});
