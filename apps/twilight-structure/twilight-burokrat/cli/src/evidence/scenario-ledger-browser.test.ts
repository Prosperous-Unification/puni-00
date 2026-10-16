import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { readCandidate } from '../inventory/read-candidate';
import { invokeCli } from '../invoke-cli';
import { buildPackage } from '../packaging/build';
import { hashBytes, hashCanonical } from './content-manifest';
import { removePerformanceFixtures } from './performance-scenarios.fixture';
import type { inspectScenarioLedger } from './scenario-ledger';
import {
  createLedgerBrowserFixture,
  type LedgerBrowserFixture,
  publishLedgerBrowserCases,
  repinLedgerBrowser,
} from './scenario-ledger-browser.fixture';
afterEach(removePerformanceFixtures);
const now = '2026-10-15T00:00:00.000Z';
const operands = (setup: LedgerBrowserFixture) => [
  'inspect-scenario-ledger',
  setup.root,
  setup.revision,
  setup.policyPath,
  setup.authorityPath,
  'example',
  setup.ledgerPath,
  '--now',
  now,
];
const inspect = (setup: LedgerBrowserFixture) => invokeCli(operands(setup));
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
    disposition: { kind: string; lowestSufficientLevel?: string };
  }[];
  [key: string]: unknown;
}
function rewrite(setup: LedgerBrowserFixture, change: (authority: MutableAuthority) => void) {
  const authority = JSON.parse(readFileSync(setup.ledgerPath, 'utf8')) as MutableAuthority;
  change(authority);
  writeFileSync(setup.ledgerPath, JSON.stringify(authority));
}
async function facts(setup: LedgerBrowserFixture, exitCode = 0) {
  const call = await inspect(setup);
  expect(call.exitCode, call.stderr).toBe(exitCode);
  expect(call.stderr).toBe('');
  return JSON.parse(call.stdout) as ReturnType<typeof inspectScenarioLedger>;
}
async function refuse(setup: LedgerBrowserFixture, diagnostic = '') {
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stdout).toBe('');
  expect(call.stderr).toContain(diagnostic);
}

test('[TEST-AXES-132] v2 preserves full observations and canonical identity while v1 stays exact', async () => {
  const setup = createLedgerBrowserFixture();
  const upstream = repinLedgerBrowser(setup);
  const observed = await facts(setup);
  expect(observed.schemaVersion).toBe(2);
  expect(observed.browser).toEqual(upstream.browser);
  expect(observed.performance).toEqual(upstream.performance);
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
  rewrite(setup, (a) => {
    a.schemaVersion = 1;
    Reflect.deleteProperty(a, 'browser');
    a.obligations.find(
      (entry) => entry.scenarioId === 'EXAMPLE-001',
    )!.disposition.lowestSufficientLevel = 'performance';
  });
  const legacy = await facts(setup);
  expect(legacy.schemaVersion).toBe(1);
  expect(legacy).not.toHaveProperty('browser');
  expect(legacy.scenarios[0].verdict).toEqual({ kind: 'passing-in-selection', caseIds: ['cells'] });
  expect(legacy.debt).toEqual([]);
  const { observationDigest: legacyDigest, ...legacyPayload } = legacy;
  expect(legacyDigest).toBe(hashCanonical(legacyPayload));
  rewrite(setup, (a) => {
    a['extra'] = true;
  });
  const refusal = await inspect(setup);
  expect(refusal.exitCode).toBe(1);
  expect(refusal.stdout).toBe('');
  expect(refusal.stderr).toBe('Validation failed: extra must be removed\n');
});
for (const [name, change] of [
  ['missing Browser', (a: MutableAuthority) => Reflect.deleteProperty(a, 'browser')],
  ['extra Browser', (a: MutableAuthority) => (a.browser['observation'] = {})],
  ['unknown mode', (a: MutableAuthority) => (a.browser.mode = 'unknown')],
  ['wrong pin', (a: MutableAuthority) => (a.browser.observationDigest = '0'.repeat(64))],
  ['extra authority', (a: MutableAuthority) => (a['extra'] = true)],
  ['unsupported version', (a: MutableAuthority) => (a.schemaVersion = 3)],
] as const)
  test(`[TEST-AXES-133] closed v2 authority refuses ${name}`, async () => {
    const setup = createLedgerBrowserFixture();
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
  test(`[TEST-AXES-133] closed v2 authority requires Browser ${member}`, async () => {
    const setup = createLedgerBrowserFixture();
    rewrite(setup, (a) => {
      Reflect.deleteProperty(a.browser, member);
    });
    await refuse(setup, 'Validation failed:');
  });
test('[TEST-AXES-133] real Browser inspector runs without Browser obligations and Performance stays mandatory', async () => {
  const setup = createLedgerBrowserFixture();
  rewrite(setup, (a) => {
    a.obligations = [];
  });
  const review = JSON.parse(readFileSync(setup.paths.review, 'utf8')) as {
    memberships: { level: string; kind: string }[];
  };
  review.memberships.find((row) => row.level === 'manual')!.kind = 'unknown';
  writeFileSync(setup.paths.review, JSON.stringify(review));
  await refuse(setup, 'Browser levels requires Manual reviewed-empty');
  rmSync(setup.authorityPath);
  await refuse(setup);
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
    test(`[TEST-AXES-133] Browser ${member} authority path refuses ${fault} without Browser obligations`, async () => {
      const setup = createLedgerBrowserFixture();
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
  test(`[TEST-AXES-134] Browser outcomes ${statuses.join('/')} map to ${kind}`, async () => {
    const setup = createLedgerBrowserFixture();
    publishLedgerBrowserCases(
      setup,
      statuses.map((status, index) => ({ title: `[EXAMPLE-001] case ${String(index)}`, status })),
    );
    const { browser } = repinLedgerBrowser(setup);
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
test('[TEST-AXES-134] absence remains unobserved and Browser never satisfies another lowest level', async () => {
  const setup = createLedgerBrowserFixture();
  publishLedgerBrowserCases(setup, [{ title: '[EXAMPLE-002] second', status: 'passed' }]);
  repinLedgerBrowser(setup);
  expect((await facts(setup, 1)).scenarios[0].verdict).toEqual({ kind: 'unobserved-in-selection' });
  rewrite(setup, (a) => (a.obligations[0].disposition.lowestSufficientLevel = 'performance'));
  expect((await facts(setup)).scenarios[0].verdict).toEqual({
    kind: 'passing-in-selection',
    caseIds: ['cells'],
  });
  rewrite(setup, (a) => (a.obligations[0].disposition.lowestSufficientLevel = 'unit'));
  expect((await facts(setup, 1)).scenarios[0].verdict).toEqual({
    kind: 'unsupported-level',
    level: 'unit',
  });
});
test('[TEST-AXES-134] source-labelled citation debt and shared unidentified B3 debt remain once', async () => {
  const setup = createLedgerBrowserFixture(
    {
      'openspec/specs/debt/spec.md':
        '## Requirements\n### Requirement: Debt\n#### Scenario: unidentified\n- **WHEN** read\n- **THEN** debt\n',
    },
    'missing Performance citation',
  );
  publishLedgerBrowserCases(setup, [{ title: 'missing Browser citation', status: 'failed' }]);
  const { browser } = repinLedgerBrowser(setup);
  const observed = await facts(setup, 1);
  expect(observed.debt).toEqual([
    { kind: 'scenario', scenarioId: 'EXAMPLE-001', verdict: 'unobserved-in-selection' },
    { kind: 'citation', source: 'performance', caseId: 'cells', finding: 'missing' },
    {
      kind: 'citation',
      source: 'browser',
      caseId: browser.report.cases[0].caseId,
      finding: 'missing',
    },
    { kind: 'unidentified', path: 'openspec/specs/debt/spec.md', title: 'unidentified' },
  ]);
});
function inject(setup: LedgerBrowserFixture, mutation: string, name: string) {
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
  test(`[TEST-AXES-133] WATCH_${name} repinned real Browser dependency fault refuses`, () => {
    const setup = createLedgerBrowserFixture();
    const call = inject(setup, mutation, name);
    expect(call.exitCode).toBe(1);
    expect(call.stdout.toString()).toBe('');
    expect(call.stderr.toString()).toContain('scenario ledger Browser');
  });

test('[TEST-AXES-135] unrelated full-tree competing overlays refuse before filtering', async () => {
  const setup = createLedgerBrowserFixture();
  const content =
    '## ADDED Requirements\n### Requirement: Debt\n#### Scenario: debt\n- **WHEN** read\n- **THEN** debt\n';
  for (const name of ['one', 'two']) {
    const folder = join(setup.root, 'openspec/changes', name, 'specs/debt');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'spec.md'), content);
  }
  const git = (args: string[]) => {
    const call = Bun.spawnSync(['git', '-C', setup.root, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (call.exitCode !== 0) throw new Error(call.stderr.toString());
    return call.stdout.toString().trim();
  };
  git(['add', 'openspec']);
  git(['commit', '-m', 'conflict']);
  setup.revision = git(['rev-parse', 'HEAD']);
  const selected = readCandidate(setup.root, { kind: 'committed', revision: setup.revision });
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  setup.factsAuthority.revision = setup.revision;
  setup.factsAuthority.candidate = candidate;
  writeFileSync(setup.authorityPath, JSON.stringify(setup.factsAuthority));
  setup.evidence.candidate = candidate;
  const evidence = JSON.stringify(setup.evidence);
  writeFileSync(join(setup.bundle, 'evidence.json'), evidence);
  setup.manifest['candidate'] = candidate;
  setup.manifest['revision'] = setup.revision;
  setup.manifest['evidence'] = { path: 'evidence.json', digest: hashBytes(Buffer.from(evidence)) };
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  await refuse(setup, 'competing overlay operation: debt');
});
test('[TEST-AXES-135] installed dispatch matches v2 JSON and debt exits', async () => {
  const setup = createLedgerBrowserFixture();
  const packageRoot = join(dirname(setup.policyPath), 'package');
  await buildPackage(packageRoot);
  const run = () =>
    Bun.spawnSync([process.execPath, join(packageRoot, 'dist/bin.mjs'), ...operands(setup)], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  for (const status of ['passed', 'skipped'] as const) {
    publishLedgerBrowserCases(setup, [
      { title: '[EXAMPLE-001] outcome', status },
      { title: '[EXAMPLE-002] companion', status: 'passed' },
    ]);
    repinLedgerBrowser(setup);
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
