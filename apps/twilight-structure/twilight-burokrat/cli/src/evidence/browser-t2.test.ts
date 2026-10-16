import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { invokeCli } from '../invoke-cli';
import { buildPackage } from '../packaging/build';
import { proposeScenarioAllocation } from '../rules/scenarios';
import type { inspectBrowserScenarioLedger } from './browser-scenario-ledger';
import {
  type BrowserLedgerFixture,
  createBrowserLedgerFixture,
  createBrowserLedgerManualFixture,
  publishBrowserLedgerCases,
  repinBrowserLedger,
} from './browser-scenario-ledger.fixture';
import type { inspectBrowserT2 } from './browser-t2';
import { hashCanonical } from './content-manifest';
import { removePerformanceFixtures } from './performance-scenarios.fixture';

afterEach(removePerformanceFixtures);
const now = '2026-10-15T00:00:00.000Z';
const operands = (setup: BrowserLedgerFixture) => [
  'inspect-browser-t2',
  setup.root,
  setup.revision,
  setup.policyPath,
  'example',
  setup.ledgerPath,
  '--now',
  now,
];
async function facts(setup: BrowserLedgerFixture) {
  const call = await invokeCli(operands(setup));
  expect(call.exitCode, call.stderr).toBe(0);
  expect(call.stderr).toBe('');
  return JSON.parse(call.stdout) as ReturnType<typeof inspectBrowserT2>;
}
function omitObligations(setup: BrowserLedgerFixture) {
  const authority = JSON.parse(readFileSync(setup.ledgerPath, 'utf8')) as {
    obligations: unknown[];
  };
  authority.obligations = [];
  writeFileSync(setup.ledgerPath, JSON.stringify(authority));
}

test('[TEST-AXES-140] Browser T2 retains the complete citation partition and diagnostic identity', async () => {
  const setup = createBrowserLedgerFixture();
  publishBrowserLedgerCases(
    setup,
    [
      { title: '[EXAMPLE-001] cited passing', status: 'passed' },
      { title: '[EXAMPLE-002] cited failed', status: 'failed' },
      { title: 'missing terminal', status: 'skipped' },
      { title: '[EXAMPLE-1] malformed', status: 'passed' },
      { title: '[EXAMPLE-999] inactive', status: 'failed' },
    ],
    undefined,
    '[EXAMPLE-002] ignored parent',
  );
  repinBrowserLedger(setup);
  const ledgerCall = await invokeCli([
    'inspect-browser-scenario-ledger',
    ...operands(setup).slice(1),
  ]);
  expect(ledgerCall.exitCode).toBe(1);
  const ledger = JSON.parse(ledgerCall.stdout) as ReturnType<typeof inspectBrowserScenarioLedger>;
  const observed = await facts(setup);
  expect(observed.kind).toBe('browser-t2');
  expect(observed.schemaVersion).toBe(1);
  expect(observed.revision).toBe(setup.revision);
  expect(observed.candidate).toBe(ledger.candidate);
  expect(observed.capability).toBe('example');
  expect(observed.evaluatedAt).toBe(now);
  expect(observed.scope).toEqual(ledger.browser.scope);
  expect(observed.policyId).toBe('performance-fixture');
  expect(observed.policyDigest).toBe(ledger.browser.policyDigest);
  expect(observed.ledger).toEqual(ledger);
  expect(observed.ledgerObservationDigest).toBe(ledger.observationDigest);
  expect(observed.citationFindings).toEqual(ledger.browser.citationFindings);
  const reportCases = [...ledger.browser.report.cases].sort((left, right) =>
    left.caseId < right.caseId ? -1 : left.caseId > right.caseId ? 1 : 0,
  );
  expect(observed.cases.map((row) => row.case)).toEqual(reportCases);
  expect(observed.cases).toHaveLength(5);
  const verdicts = new Map(observed.cases.map((row) => [row.case.titlePath.at(-1), row.citation]));
  expect(verdicts.get('[EXAMPLE-001] cited passing')).toEqual({
    kind: 'cited',
    scenarioId: 'EXAMPLE-001',
  });
  expect(verdicts.get('[EXAMPLE-002] cited failed')).toEqual({
    kind: 'cited',
    scenarioId: 'EXAMPLE-002',
  });
  expect(verdicts.get('missing terminal')).toEqual({ kind: 'missing' });
  expect(verdicts.get('[EXAMPLE-1] malformed')).toEqual({ kind: 'malformed' });
  expect(verdicts.get('[EXAMPLE-999] inactive')).toEqual({ kind: 'inactive' });
  expect(observed.authentication).toEqual({ kind: 'absent' });
  expect(observed.certifies).toBe(false);
  expect(observed).not.toHaveProperty('allowed');
  expect(observed).not.toHaveProperty('covered');
  expect(observed).not.toHaveProperty('passed');
  const { observationDigest, ...payload } = observed;
  expect(observationDigest).toBe(hashCanonical(payload));
});

test('[TEST-AXES-140] Browser T2 retains active citations in another capability', async () => {
  const example = proposeScenarioAllocation(
    { schemaVersion: 1, events: [] },
    'openspec/specs/example/spec.md',
    '# Example\n\n## Requirements\n\n### Requirement: Rendering\n\n#### Scenario: renders cells\n- **WHEN** rendered\n- **THEN** bounded\n\n#### Scenario: second adopted case\n- **WHEN** rendered\n- **THEN** bounded\n',
  );
  const other = proposeScenarioAllocation(
    example.journal,
    'openspec/specs/other/spec.md',
    '# Other\n\n## Requirements\n\n### Requirement: Other\n\n#### Scenario: other scenario\n- **WHEN** read\n- **THEN** observed\n',
  );
  const setup = createBrowserLedgerFixture({
    'openspec/specs/other/spec.md': other.specMarkdown,
    'openspec/scenario-allocations.json': JSON.stringify(other.journal),
  });
  publishBrowserLedgerCases(setup, [
    { title: '[OTHER-001] other capability', status: 'skipped' },
    { title: '[EXAMPLE-001] passing companion', status: 'passed' },
  ]);
  repinBrowserLedger(setup);
  const observed = await facts(setup);
  expect(
    observed.cases.find((row) => row.case.titlePath.at(-1) === '[OTHER-001] other capability')
      ?.citation,
  ).toEqual({ kind: 'cited', scenarioId: 'OTHER-001' });
  expect(observed.citationFindings).toEqual([]);
  expect(observed.ledger.scenarios.map((scenario) => scenario.id)).toEqual([
    'EXAMPLE-001',
    'EXAMPLE-002',
  ]);
});

for (const status of ['passed', 'failed', 'skipped'] as const)
  test(`[TEST-AXES-141] Browser T2 preserves ${status} outcomes and unassigned debt with exit zero`, async () => {
    const setup = createBrowserLedgerFixture({
      'openspec/specs/debt/spec.md':
        '# Debt\n\n## Requirements\n\n### Requirement: Debt\n\n#### Scenario: unidentified\n- **WHEN** read\n- **THEN** unresolved\n',
    });
    publishBrowserLedgerCases(setup, [
      { title: '[EXAMPLE-001] outcome', status },
      { title: '[EXAMPLE-001] passing companion', status: 'passed' },
    ]);
    repinBrowserLedger(setup);
    omitObligations(setup);
    const observed = await facts(setup);
    const outcome = observed.cases.find(
      (row) => row.case.titlePath.at(-1) === '[EXAMPLE-001] outcome',
    );
    expect(outcome?.case.status).toBe(status);
    expect(outcome?.citation).toEqual({ kind: 'cited', scenarioId: 'EXAMPLE-001' });
    expect(observed.ledger.debt).toEqual([
      { kind: 'scenario', scenarioId: 'EXAMPLE-001', verdict: 'unassigned' },
      { kind: 'scenario', scenarioId: 'EXAMPLE-002', verdict: 'unassigned' },
      { kind: 'unidentified', path: 'openspec/specs/debt/spec.md', title: 'unidentified' },
    ]);
  });

test('[TEST-AXES-141] Browser T2 retains complete real Manual observations and freshness debt', async () => {
  const setup = createBrowserLedgerManualFixture('skipped', true);
  const observed = await facts(setup);
  expect(observed.ledger.scenarios[0].verdict).toEqual({
    kind: 'manual',
    observation: setup.observation,
  });
  expect(observed.ledger.debt).toContainEqual({
    kind: 'scenario',
    scenarioId: 'EXAMPLE-001',
    verdict: 'overdue',
  });
});

for (const member of [
  'ledger',
  'policy',
  'review',
  'conformance',
  'architecture',
  'performance',
] as const)
  for (const fault of ['missing', 'unreadable', 'malformed'] as const)
    test(`[TEST-AXES-143] Browser T2 refuses ${fault} ${member} authority without JSON`, async () => {
      const setup = createBrowserLedgerFixture();
      const path =
        member === 'ledger'
          ? setup.ledgerPath
          : member === 'policy'
            ? setup.policyPath
            : setup.paths[member];
      if (fault === 'missing') rmSync(path);
      if (fault === 'unreadable') chmodSync(path, 0);
      if (fault === 'malformed') writeFileSync(path, '{bad');
      const call = await invokeCli(operands(setup));
      expect(call.exitCode).toBe(1);
      expect(call.stdout).toBe('');
      expect(call.stderr.length).toBeGreaterThan(0);
    });

for (const fault of ['extra', 'flag', 'instant', 'symbolic'] as const)
  test(`[TEST-AXES-143] Browser T2 refuses ${fault} CLI input`, async () => {
    const setup = createBrowserLedgerFixture();
    const argv = operands(setup);
    if (fault === 'extra') argv.push('extra');
    if (fault === 'flag') argv[6] = '--when';
    if (fault === 'instant') argv[7] = '2026-10-15';
    if (fault === 'symbolic') argv[2] = 'HEAD';
    const call = await invokeCli(argv);
    expect(call.exitCode).toBe(1);
    expect(call.stdout).toBe('');
    expect(call.stderr).toContain(
      fault === 'symbolic' ? 'full committed SHA' : fault === 'instant' ? 'instant' : 'usage:',
    );
  });

function inject(setup: BrowserLedgerFixture, mutation: string, fault: string) {
  const modulePath = join(import.meta.dir, 'browser-scenario-ledger.ts');
  const preload = join(dirname(setup.policyPath), 't2-fault-preload.ts');
  writeFileSync(
    preload,
    `import {mock} from 'bun:test';
const actual=await import(${JSON.stringify(modulePath + '?t2-real')});
const {hashCanonical}=await import(${JSON.stringify(join(import.meta.dir, 'content-manifest.ts'))});
const seal=(value)=>{const {observationDigest,...payload}=value;return {...payload,observationDigest:hashCanonical(payload)}};
let observed=actual.inspectBrowserScenarioLedger(...${JSON.stringify([setup.root, setup.revision, setup.policyPath, 'example', setup.ledgerPath])},new Date(${JSON.stringify(now)}));
${mutation};
if (${JSON.stringify(fault)} !== 'report digest') observed.browser.report=seal(observed.browser.report);
if (${JSON.stringify(fault)} !== 'levels digest' && ${JSON.stringify(fault)} !== 'nested report')
  observed.browser.levels=seal({...observed.browser.levels,review:{...observed.browser.levels.review,report:observed.browser.report}});
if (${JSON.stringify(fault)} !== 'levels pin') observed.browser.levelsObservationDigest=observed.browser.levels.observationDigest;
if (${JSON.stringify(fault)} !== 'report pin') observed.browser.reportObservationDigest=observed.browser.report.observationDigest;
if (${JSON.stringify(fault)} !== 'browser digest') observed.browser=seal(observed.browser);
if (${JSON.stringify(fault)} !== 'ledger browser pin') observed.authority.browser.observationDigest=observed.browser.observationDigest;
if (${JSON.stringify(fault)} !== 'ledger digest') observed=seal({...observed,authorityDigest:hashCanonical(observed.authority)});
mock.module(${JSON.stringify(modulePath)},()=>({...actual,inspectBrowserScenarioLedger:()=>observed}));`,
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

const ledgerFaults: readonly (readonly [string, string])[] = [
  ['ledger digest', "observed={...observed,observationDigest:'0'.repeat(64)}"],
  ['ledger revision', "observed=seal({...observed,revision:'0'.repeat(40)})"],
  ['ledger capability', "observed=seal({...observed,capability:'foreign'})"],
  ['ledger null certification', 'observed=seal({...observed,certifies:null})'],
  ['ledger zero certification', 'observed=seal({...observed,certifies:0})'],
  ['ledger empty certification', "observed=seal({...observed,certifies:''})"],
  ['ledger instant', "observed=seal({...observed,evaluatedAt:'2026-10-16T00:00:00.000Z'})"],
  ...['ledger', 'browser', 'report', 'levels'].flatMap(
    (member) =>
      [
        [
          `${member} authentication`,
          member === 'ledger'
            ? "observed=seal({...observed,authentication:{kind:'present'}})"
            : `observed=seal({...observed,browser:seal({...observed.browser,${member === 'browser' ? "authentication:{kind:'present'}" : `${member}:seal({...observed.browser.${member},authentication:{kind:'present'}})`}})})`,
        ],
        [
          `${member} certification`,
          member === 'ledger'
            ? 'observed=seal({...observed,certifies:true})'
            : `observed=seal({...observed,browser:seal({...observed.browser,${member === 'browser' ? 'certifies:true' : `${member}:seal({...observed.browser.${member},certifies:true})`}})})`,
        ],
      ] as const,
  ),
  ...['browser', 'report', 'levels'].flatMap((member) =>
    ['revision', 'candidate', 'mode'].map(
      (field) =>
        [
          `${member} ${field}`,
          `observed=seal({...observed,browser:seal({...observed.browser,${member === 'browser' ? `${field}:'foreign'` : `${member}:seal({...observed.browser.${member},${field}:'foreign'})`}})})`,
        ] as const,
    ),
  ),
  [
    'coherent browser mode',
    "observed.browser.mode='portable';observed.browser.scope.mode='portable';observed.browser.report=seal({...observed.browser.report,mode:'portable'});observed.browser.levels=seal({...observed.browser.levels,mode:'portable'});observed=seal({...observed,browser:seal(observed.browser)})",
  ],
  [
    'browser digest',
    "observed=seal({...observed,browser:{...observed.browser,observationDigest:'0'.repeat(64)}})",
  ],
  [
    'report digest',
    "observed=seal({...observed,browser:seal({...observed.browser,report:{...observed.browser.report,observationDigest:'0'.repeat(64)}})})",
  ],
  [
    'levels digest',
    "observed=seal({...observed,browser:seal({...observed.browser,levels:{...observed.browser.levels,observationDigest:'0'.repeat(64)}})})",
  ],
  [
    'browser capability',
    "observed=seal({...observed,browser:seal({...observed.browser,capability:'foreign'})})",
  ],
  [
    'report policy',
    "observed=seal({...observed,browser:seal({...observed.browser,report:seal({...observed.browser.report,policyDigest:'0'.repeat(64)})})})",
  ],
  [
    'scope mode',
    "observed=seal({...observed,browser:seal({...observed.browser,scope:{...observed.browser.scope,mode:'portable'}})})",
  ],
  [
    'scope invocation',
    "observed=seal({...observed,browser:seal({...observed.browser,scope:{...observed.browser.scope,invocationId:'foreign'}})})",
  ],
  [
    'levels pin',
    "observed=seal({...observed,browser:seal({...observed.browser,levelsObservationDigest:'0'.repeat(64)})})",
  ],
  [
    'report pin',
    "observed=seal({...observed,browser:seal({...observed.browser,reportObservationDigest:'0'.repeat(64)})})",
  ],
  [
    'nested report',
    "observed=seal({...observed,browser:seal({...observed.browser,levels:seal({...observed.browser.levels,review:{...observed.browser.levels.review,report:seal({...observed.browser.report,invocationId:'foreign'})}})})})",
  ],
  [
    'ledger browser pin',
    "observed=seal({...observed,authority:{...observed.authority,browser:{...observed.authority.browser,observationDigest:'0'.repeat(64)}}})",
  ],
  [
    'empty citation group',
    "observed.browser.citations.push({id:'EXAMPLE-002',cases:[]}); observed=seal({...observed,browser:seal(observed.browser)})",
  ],
  [
    'inactive cited scenario',
    "observed.browser.citations[0].id='EXAMPLE-999'; observed=seal({...observed,browser:seal(observed.browser)})",
  ],
  [
    'mismatched cited scenario',
    "observed.browser.citations[0].id='EXAMPLE-002'; observed=seal({...observed,browser:seal(observed.browser)})",
  ],
  [
    'omitted case',
    'observed.browser.citations=[]; observed=seal({...observed,browser:seal(observed.browser)})',
  ],
  [
    'duplicate cited case',
    'observed.browser.citations[0].cases.push(observed.browser.citations[0].cases[0]); observed=seal({...observed,browser:seal(observed.browser)})',
  ],
  [
    'foreign cited case',
    "observed.browser.citations[0].cases[0]={...observed.browser.citations[0].cases[0],caseId:'foreign'}; observed=seal({...observed,browser:seal(observed.browser)})",
  ],
  [
    'altered cited case',
    "observed.browser.citations[0].cases[0]={...observed.browser.citations[0].cases[0],status:'failed'}; observed=seal({...observed,browser:seal(observed.browser)})",
  ],
  [
    'conflicting finding',
    "observed.browser.citationFindings=[{caseId:observed.browser.report.cases[0].caseId,kind:'missing',title:observed.browser.report.cases[0].titlePath.at(-1),status:'passed'}]; observed=seal({...observed,browser:seal(observed.browser)})",
  ],
];
for (const [name, mutation] of ledgerFaults)
  test(`[TEST-AXES-142] Browser T2 refuses ${name} dependency fault`, () => {
    const setup = createBrowserLedgerFixture();
    const call = inject(setup, mutation, name);
    expect(call.exitCode, call.stderr.toString()).toBe(1);
    expect(call.stdout.toString()).toBe('');
    expect(call.stderr.toString()).toContain('Browser T2');
  });

for (const [name, mutation] of [
  ['duplicate report case', 'observed.browser.report.cases.push(observed.browser.report.cases[0])'],
  ['missing terminal', 'observed.browser.report.cases[0].titlePath=[]'],
  [
    'duplicate finding',
    'observed.browser.citationFindings.push(observed.browser.citationFindings[0])',
  ],
  ['foreign finding', "observed.browser.citationFindings[0].caseId='foreign'"],
  ['wrong finding kind', "observed.browser.citationFindings[0].kind='inactive'"],
  ['wrong finding title', "observed.browser.citationFindings[0].title='foreign'"],
  ['wrong finding status', "observed.browser.citationFindings[0].status='failed'"],
] as const)
  test(`[TEST-AXES-142] Browser T2 refuses ${name} in a coherently resealed report`, () => {
    const setup = createBrowserLedgerFixture();
    publishBrowserLedgerCases(setup, [{ title: 'missing citation', status: 'passed' }]);
    repinBrowserLedger(setup);
    const call = inject(setup, mutation, name);
    expect(call.exitCode, call.stderr.toString()).toBe(1);
    expect(call.stdout.toString()).toBe('');
    expect(call.stderr.toString()).toContain('Browser T2');
  });

test('[TEST-AXES-143] Browser T2 source and installed diagnostic match with debt and refusals', async () => {
  const setup = createBrowserLedgerFixture();
  publishBrowserLedgerCases(setup, [{ title: 'missing citation', status: 'failed' }]);
  repinBrowserLedger(setup);
  omitObligations(setup);
  const packageRoot = join(dirname(setup.policyPath), 't2-package');
  await buildPackage(packageRoot);
  const run = () =>
    Bun.spawnSync([process.execPath, join(packageRoot, 'dist/bin.mjs'), ...operands(setup)], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  const source = await invokeCli(operands(setup));
  const installed = run();
  expect(source.exitCode, source.stderr).toBe(0);
  expect(installed.exitCode, installed.stderr.toString()).toBe(0);
  expect(installed.stdout.toString()).toBe(source.stdout);
  expect(installed.stderr.toString()).toBe('');
  rmSync(setup.ledgerPath);
  const refused = run();
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout.toString()).toBe('');
  expect(refused.stderr.toString().length).toBeGreaterThan(0);
}, 120000);

for (const fault of ['duplicate disjoint groups', 'inactive moved case'] as const)
  test(`[TEST-AXES-142] Browser T2 refuses ${fault} in a complete partition`, () => {
    const setup = createBrowserLedgerFixture();
    publishBrowserLedgerCases(
      setup,
      fault === 'duplicate disjoint groups'
        ? [
            { title: '[EXAMPLE-001] one', status: 'passed' },
            { title: '[EXAMPLE-001] two', status: 'passed' },
          ]
        : [{ title: '[EXAMPLE-999] inactive', status: 'passed' }],
    );
    repinBrowserLedger(setup);
    const mutation =
      fault === 'duplicate disjoint groups'
        ? 'const group=observed.browser.citations[0];observed.browser.citations=[{id:group.id,cases:group.cases.slice(0,1)},{id:group.id,cases:group.cases.slice(1)}]'
        : "observed.browser.citations=[{id:'EXAMPLE-999',cases:observed.browser.report.cases}];observed.browser.citationFindings=[]";
    const call = inject(setup, mutation, fault);
    expect(call.exitCode, call.stderr.toString()).toBe(1);
    expect(call.stdout.toString()).toBe('');
    expect(call.stderr.toString()).toContain('Browser T2');
  });

test('[TEST-AXES-141] Browser T2 retains unsupported and unobserved obligation debt', async () => {
  const setup = createBrowserLedgerFixture();
  const authority = JSON.parse(readFileSync(setup.ledgerPath, 'utf8')) as {
    obligations: unknown[];
  };
  authority.obligations = [
    {
      scenarioId: 'EXAMPLE-001',
      disposition: { kind: 'automated', lowestSufficientLevel: 'performance' },
    },
    {
      scenarioId: 'EXAMPLE-002',
      disposition: { kind: 'automated', lowestSufficientLevel: 'browser' },
    },
  ];
  writeFileSync(setup.ledgerPath, JSON.stringify(authority));
  const observed = await facts(setup);
  expect(observed.ledger.debt).toEqual([
    { kind: 'scenario', scenarioId: 'EXAMPLE-001', verdict: 'unsupported-level' },
    { kind: 'scenario', scenarioId: 'EXAMPLE-002', verdict: 'unobserved-in-selection' },
  ]);
  expect(observed.cases[0].citation).toEqual({ kind: 'cited', scenarioId: 'EXAMPLE-001' });
});
