import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { invokeCli } from '../invoke-cli';
import { buildPackage } from '../packaging/build';
import { proposeScenarioAllocation } from '../rules/scenarios';
import {
  createBrowserLedgerFixture,
  publishBrowserLedgerCases,
  repinBrowserLedger,
} from './browser-scenario-ledger.fixture';
import { inspectBrowserT2 } from './browser-t2';
import type { inspectBrowserT2Policy } from './browser-t2-policy';
import { hashBytes, hashCanonical } from './content-manifest';
import { removePerformanceFixtures } from './performance-scenarios.fixture';

type Preview = ReturnType<typeof inspectBrowserT2Policy>;
interface ProposalInput {
  schemaVersion: unknown;
  kind: unknown;
  binding: Record<string, unknown>;
  disposition: Record<string, unknown>;
  [key: string]: unknown;
}

afterEach(removePerformanceFixtures);
const now = '2026-10-15T00:00:00.000Z';
function fixture(
  mode: 'observe' | 'enforce' | 'ratchet' = 'observe',
  prefixes: string[] = [],
  extraFiles: Record<string, string> = {},
  extraCases: { title: string; status: 'passed' | 'failed' | 'skipped' }[] = [],
) {
  const setup = createBrowserLedgerFixture(extraFiles);
  publishBrowserLedgerCases(setup, [
    { title: 'missing passed', status: 'passed' },
    { title: 'missing failed', status: 'failed' },
    { title: 'missing skipped', status: 'skipped' },
    { title: '[EXAMPLE-1] malformed', status: 'passed' },
    { title: '[EXAMPLE-999] inactive', status: 'failed' },
    { title: '[EXAMPLE-001] cited failed', status: 'failed' },
    ...extraCases,
  ]);
  repinBrowserLedger(setup);
  const browserT2 = inspectBrowserT2(
    setup.root,
    setup.revision,
    setup.policyPath,
    'example',
    setup.ledgerPath,
    new Date(now),
  );
  const proposal: Preview['proposedPolicy'] = {
    schemaVersion: 1,
    kind: 'proposed-browser-citation-policy',
    binding: {
      revision: browserT2.revision,
      candidate: browserT2.candidate,
      capability: browserT2.capability,
      evaluatedAt: now,
      rulePolicyDigest: browserT2.policyDigest,
      browserT2ObservationDigest: browserT2.observationDigest,
    },
    disposition: mode === 'ratchet' ? { mode, adoptedPrefixes: prefixes } : { mode },
  };
  const proposalPath = join(dirname(setup.policyPath), 'proposal.json');
  writeFileSync(proposalPath, JSON.stringify(proposal));
  const argv = [
    'inspect-browser-t2-policy',
    setup.root,
    setup.revision,
    setup.policyPath,
    'example',
    setup.ledgerPath,
    proposalPath,
    '--now',
    now,
  ];
  return { ...setup, browserT2, proposal, proposalPath, argv };
}
async function refuse(argv: string[], message?: string) {
  const call = await invokeCli(argv);
  expect(call.exitCode, call.stderr).toBe(1);
  expect(call.stdout).toBe('');
  expect(call.stderr.length).toBeGreaterThan(0);
  if (message !== undefined) expect(call.stderr).toContain(message);
}

test('[BROWSER-T2-POLICY-PREVIEW-012] previews an exact captured proposed citation policy', async () => {
  const setup = fixture();
  const call = await invokeCli(setup.argv);
  expect(call.exitCode, call.stderr).toBe(0);
  expect(call.stderr).toBe('');
  const observed = JSON.parse(call.stdout) as Preview;
  expect(observed.kind).toBe('browser-t2-policy-preview');
  expect(observed.schemaVersion).toBe(1);
  for (const field of [
    'revision',
    'candidate',
    'capability',
    'evaluatedAt',
    'scope',
    'policyId',
    'policyDigest',
  ] as const)
    expect(observed[field]).toEqual(setup.browserT2[field]);
  expect(observed.browserT2).toEqual(setup.browserT2);
  expect(observed.proposedPolicy).toEqual(setup.proposal);
  expect(observed.proposedPolicyDigest).toBe(hashBytes(readFileSync(setup.proposalPath)));
  expect(observed.browserT2ObservationDigest).toBe(setup.browserT2.observationDigest);
  expect(observed.proposedDisposition).toEqual({ kind: 'no-citation-refusals' });
  expect(observed.authentication).toEqual({ kind: 'absent' });
  expect(observed.certifies).toBe(false);
  for (const key of ['allowed', 'accepted', 'covered', 'passed', 'receipt'])
    expect(observed).not.toHaveProperty(key);
  const { observationDigest, ...payload } = observed;
  expect(observationDigest).toBe(hashCanonical(payload));
  expect((await invokeCli(setup.argv)).stdout).toBe(call.stdout);
  writeFileSync(setup.proposalPath, JSON.stringify(setup.proposal, null, 2));
  const changed = JSON.parse((await invokeCli(setup.argv)).stdout) as Preview;
  expect(changed.findings).toEqual(observed.findings);
  expect(changed.observationDigest).not.toBe(observed.observationDigest);
});

for (const fault of [
  'missing',
  'unreadable',
  'internal',
  'symlink',
  'ancestor symlink',
  'directory',
  'relative',
  'noncanonical',
  'utf8',
  'json',
] as const)
  test(`[BROWSER-T2-POLICY-PREVIEW-003] refuses ${fault} proposed policy`, async () => {
    const setup = fixture();
    if (fault === 'missing') rmSync(setup.proposalPath);
    if (fault === 'unreadable') chmodSync(setup.proposalPath, 0);
    if (fault === 'internal') {
      setup.argv[6] = join(setup.root, 'proposal.json');
      writeFileSync(setup.argv[6], JSON.stringify(setup.proposal));
    }
    if (fault === 'symlink') {
      const target = setup.proposalPath + '.link';
      symlinkSync(setup.proposalPath, target);
      setup.argv[6] = target;
    }
    if (fault === 'ancestor symlink') {
      const target = join(dirname(setup.policyPath), 'linked');
      symlinkSync(dirname(setup.policyPath), target);
      setup.argv[6] = join(target, 'proposal.json');
    }
    if (fault === 'directory') {
      rmSync(setup.proposalPath);
      mkdirSync(setup.proposalPath);
    }
    if (fault === 'relative') setup.argv[6] = 'proposal.json';
    if (fault === 'noncanonical') setup.argv[6] = dirname(setup.proposalPath) + '/./proposal.json';
    if (fault === 'utf8') {
      const bytes = Buffer.from(
        JSON.stringify({
          ...setup.proposal,
          disposition: { mode: 'ratchet', adoptedPrefixes: ['invalid-byte'] },
        }),
      );
      bytes[bytes.indexOf('invalid-byte')] = 0xff;
      writeFileSync(setup.proposalPath, bytes);
    }
    if (fault === 'json') writeFileSync(setup.proposalPath, '{bad');
    await refuse(
      setup.argv,
      fault === 'directory'
        ? 'not a regular file'
        : fault === 'relative' || fault === 'noncanonical'
          ? 'canonical absolute'
          : fault === 'symlink' || fault === 'ancestor symlink'
            ? 'symlink'
            : undefined,
    );
  });
for (const [name, mutate] of [
  [
    'version',
    (proposal: ProposalInput) => {
      proposal.schemaVersion = 2;
    },
  ],
  [
    'kind',
    (proposal: ProposalInput) => {
      proposal.kind = 'trusted';
    },
  ],
  [
    'root key',
    (proposal: ProposalInput) => {
      proposal['extra'] = true;
    },
  ],
  [
    'binding key',
    (proposal: ProposalInput) => {
      proposal.binding['extra'] = true;
    },
  ],
  [
    'disposition key',
    (proposal: ProposalInput) => {
      proposal.disposition['extra'] = true;
    },
  ],
  [
    'missing binding',
    (proposal: ProposalInput) => {
      Reflect.deleteProperty(proposal, 'binding');
    },
  ],
  [
    'digest syntax',
    (proposal: ProposalInput) => {
      proposal.binding['candidate'] = 'x';
    },
  ],
  [
    'blank capability',
    (proposal: ProposalInput) => {
      proposal.binding['capability'] = ' ';
    },
  ],
  [
    'noncanonical time',
    (proposal: ProposalInput) => {
      proposal.binding['evaluatedAt'] = '2026-10-15T00:00:00Z';
    },
  ],
  [
    'mode',
    (proposal: ProposalInput) => {
      proposal.disposition['mode'] = 'unknown';
    },
  ],
  [
    'observe prefixes',
    (proposal: ProposalInput) => {
      proposal.disposition['adoptedPrefixes'] = [];
    },
  ],
  [
    'enforce prefixes',
    (proposal: ProposalInput) => {
      proposal.disposition = { mode: 'enforce', adoptedPrefixes: [] };
    },
  ],
  [
    'omitted prefixes',
    (proposal: ProposalInput) => {
      proposal.disposition = { mode: 'ratchet' };
    },
  ],
  [
    'duplicate prefixes',
    (proposal: ProposalInput) => {
      proposal.disposition = { mode: 'ratchet', adoptedPrefixes: ['src/foo', 'src/foo'] };
    },
  ],
  ...[
    '.',
    '..',
    'src/../foo',
    'src/./foo',
    '/src',
    'src/',
    'src//foo',
    'src/*',
    'src\\foo',
    'src\0foo',
  ].map(
    (path) =>
      [
        path,
        (proposal: ProposalInput) => {
          proposal.disposition = { mode: 'ratchet', adoptedPrefixes: [path] };
        },
      ] as const,
  ),
] as const)
  test(`[BROWSER-T2-POLICY-PREVIEW-005] refuses proposal schema ${name}`, async () => {
    const setup = fixture();
    mutate(setup.proposal);
    writeFileSync(setup.proposalPath, JSON.stringify(setup.proposal));
    await refuse(
      setup.argv,
      name === 'noncanonical time'
        ? 'canonical UTC'
        : name === 'duplicate prefixes'
          ? 'repeats an adopted prefix'
          : 'Validation failed',
    );
  });
for (const field of [
  'revision',
  'candidate',
  'capability',
  'evaluatedAt',
  'rulePolicyDigest',
  'browserT2ObservationDigest',
] as const)
  test(`[BROWSER-T2-POLICY-PREVIEW-004] proposal binds actual ${field}`, async () => {
    const setup = fixture();
    setup.proposal.binding[field] =
      field === 'revision'
        ? '0'.repeat(40)
        : field === 'capability'
          ? 'foreign'
          : field === 'evaluatedAt'
            ? '2026-10-16T00:00:00.000Z'
            : '0'.repeat(64);
    writeFileSync(setup.proposalPath, JSON.stringify(setup.proposal));
    await refuse(setup.argv, 'binding');
  });
for (const fault of ['extra', 'missing', 'flag', 'instant', 'symbolic'] as const)
  test(`[BROWSER-T2-POLICY-PREVIEW-002] refuses ${fault} operands`, async () => {
    const setup = fixture();
    if (fault === 'extra') setup.argv.push('extra');
    if (fault === 'missing') setup.argv.pop();
    if (fault === 'flag') setup.argv[7] = '--when';
    if (fault === 'instant') setup.argv[8] = '2026-10-15';
    if (fault === 'symbolic') setup.argv[2] = 'HEAD';
    await refuse(setup.argv);
  });

for (const [mode, prefixes, effect] of [
  ['observe', [], 'debt'],
  ['enforce', [], 'refusal'],
  ['ratchet', [], 'debt'],
  ['ratchet', ['apps/example/src'], 'refusal'],
  ['ratchet', ['apps/example/src/browser.test.ts'], 'refusal'],
  ['ratchet', ['apps/example/sr'], 'debt'],
  ['ratchet', ['apps/example/src/browser'], 'debt'],
  ['ratchet', ['apps/example', 'apps/example/src', 'future/path'], 'refusal'],
] as const)
  test(`[BROWSER-T2-POLICY-PREVIEW-006] same citation produces ${effect} under ${mode} ${prefixes.join(',')}`, async () => {
    const setup = fixture(mode, [...prefixes]);
    const call = await invokeCli(setup.argv);
    expect(call.exitCode, call.stderr).toBe(effect === 'refusal' ? 1 : 0);
    expect(call.stderr).toBe('');
    const observed = JSON.parse(call.stdout) as Preview;
    const expected = setup.browserT2.cases.flatMap((row) =>
      row.citation.kind === 'cited'
        ? []
        : [
            {
              caseId: row.case.caseId,
              path: row.case.file,
              kind: row.citation.kind,
              effect,
            },
          ],
    );
    expect(observed.findings).toEqual(expected);
    expect(observed.browserT2).toEqual(setup.browserT2);
    expect(observed.proposedDisposition.kind).toBe(
      effect === 'refusal' ? 'citation-refusals' : 'no-citation-refusals',
    );
  });

for (const member of ['ledger', 'policy', 'publication'] as const)
  test(`[BROWSER-T2-POLICY-PREVIEW-001] real upstream remains required after proposal capture: ${member}`, async () => {
    const setup = fixture();
    rmSync(
      member === 'ledger'
        ? setup.ledgerPath
        : member === 'policy'
          ? setup.policyPath
          : join(setup.browserBundle, 'report.xml'),
    );
    await refuse(setup.argv);
  });

function inject(
  setup: ReturnType<typeof fixture>,
  mutation: string,
  reseal: boolean,
  repin: boolean,
  afterCapture = '',
) {
  const modulePath = join(import.meta.dir, 'browser-t2.ts');
  const preload = join(dirname(setup.policyPath), 'policy-fault.ts');
  writeFileSync(
    preload,
    `import {mock} from 'bun:test';
import {readFileSync,writeFileSync} from 'node:fs';
const actual=await import(${JSON.stringify(modulePath + '?policy-real')});
const {hashCanonical}=await import(${JSON.stringify(join(import.meta.dir, 'content-manifest.ts'))});
let observed=JSON.parse(JSON.stringify(actual.inspectBrowserT2(...${JSON.stringify([setup.root, setup.revision, setup.policyPath, 'example', setup.ledgerPath])},new Date(${JSON.stringify(now)}))));
${mutation};
if (${String(reseal)}) {const {observationDigest,...payload}=observed; observed={...payload,observationDigest:hashCanonical(payload)};}
if (${String(repin)}) {const proposal=JSON.parse(readFileSync(${JSON.stringify(setup.proposalPath)},'utf8')); proposal.binding.browserT2ObservationDigest=observed.observationDigest; writeFileSync(${JSON.stringify(setup.proposalPath)},JSON.stringify(proposal));}
mock.module(${JSON.stringify(modulePath)},()=>({...actual,inspectBrowserT2:()=>{${afterCapture};return observed}}));`,
  );
  return Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '../cli.ts'),
      ...setup.argv,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
}
const upstreamFaults = [
  ['digest', "observed.observationDigest='0'.repeat(64)", false, false],
  ['revision', "observed.revision='0'.repeat(40)", true, true],
  ['candidate', "observed.candidate='0'.repeat(64)", true, true],
  ['policy', "observed.policyDigest='0'.repeat(64)", true, true],
  ['invocation', "observed.scope.invocationId='foreign'", true, false],
  ['capability', "observed.capability='foreign'", true, true],
  ['instant', "observed.evaluatedAt='2026-10-16T00:00:00.000Z'", true, true],
  ['authentication', "observed.authentication={kind:'present'}", true, true],
  ...[true, null, 0, ''].map(
    (marker) =>
      [
        `certification ${JSON.stringify(marker)}`,
        `observed.certifies=${JSON.stringify(marker)}`,
        true,
        true,
      ] as const,
  ),
  ['duplicate case', 'observed.cases.push(observed.cases[0])', true, true],
  ['omitted case', 'observed.cases.pop()', true, true],
  ['foreign case', "observed.cases[0].case.caseId='foreign'", true, true],
  ['altered case', "observed.cases[0].case.status='skipped'", true, true],
  [
    'duplicate original',
    'observed.ledger.browser.report.cases.push(observed.ledger.browser.report.cases[0])',
    true,
    true,
  ],
  [
    'duplicate finding',
    'observed.citationFindings.push(observed.citationFindings[0]); observed.ledger.browser.citationFindings=observed.citationFindings',
    true,
    true,
  ],
  [
    'omitted finding',
    'observed.citationFindings.pop(); observed.ledger.browser.citationFindings=observed.citationFindings',
    true,
    true,
  ],
  [
    'foreign finding',
    "observed.citationFindings[0].caseId='foreign'; observed.ledger.browser.citationFindings=observed.citationFindings",
    true,
    true,
  ],
  [
    'conflicting cited finding',
    "const row=observed.cases.find(row=>row.citation.kind==='cited'); observed.citationFindings.push({caseId:row.case.caseId,kind:'missing',title:row.case.titlePath.at(-1),status:row.case.status}); observed.ledger.browser.citationFindings=observed.citationFindings",
    true,
    true,
  ],
  [
    'finding kind',
    "observed.citationFindings[0].kind='inactive'; observed.ledger.browser.citationFindings=observed.citationFindings",
    true,
    true,
  ],
  [
    'finding title',
    "observed.citationFindings[0].title='foreign'; observed.ledger.browser.citationFindings=observed.citationFindings",
    true,
    true,
  ],
  [
    'finding status',
    "observed.citationFindings[0].status='skipped'; observed.ledger.browser.citationFindings=observed.citationFindings",
    true,
    true,
  ],
  ['original findings', 'observed.ledger.browser.citationFindings=[]', true, true],
  [
    'cited scenario',
    "observed.cases.find(row=>row.citation.kind==='cited').citation.scenarioId='EXAMPLE-002'",
    true,
    true,
  ],
  [
    'missing cited scenario',
    "delete observed.cases.find(row=>row.citation.kind==='cited').citation.scenarioId",
    true,
    true,
  ],
  [
    'invalid cited scenario',
    "observed.cases.find(row=>row.citation.kind==='cited').citation.scenarioId=1",
    true,
    true,
  ],
  ['impossible citation', "observed.cases[0].citation={kind:'unknown'}", true, true],
] as const;
for (const [name, mutation, reseal, repin] of upstreamFaults)
  test(`[BROWSER-T2-POLICY-PREVIEW-009] refuses resealed upstream ${name}`, () => {
    const setup = fixture();
    const call = inject(setup, mutation, reseal, repin);
    expect(call.exitCode, call.stderr.toString()).toBe(1);
    expect(call.stdout.toString()).toBe('');
    const boundary: Record<string, string> = {
      digest: 'upstream digest differs',
      revision: 'upstream selection or instant differs',
      capability: 'upstream selection or instant differs',
      instant: 'upstream selection or instant differs',
      'duplicate case': 'duplicate case',
      'foreign case': 'case differs from original report',
      'altered case': 'case differs from original report',
      'conflicting cited finding': 'cited case has a finding',
      'impossible citation': 'impossible citation variant',
    };
    expect(call.stderr.toString()).toContain(boundary[name] ?? 'Browser T2');
  });

test('[BROWSER-T2-POLICY-PREVIEW-012] source and installed previews retain identity and only citation refusals exit one', async () => {
  const setup = fixture();
  const packageRoot = join(dirname(setup.policyPath), 'policy-package');
  await buildPackage(packageRoot);
  const run = () =>
    Bun.spawnSync([process.execPath, join(packageRoot, 'dist/bin.mjs'), ...setup.argv], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  for (const mode of ['observe', 'enforce'] as const) {
    setup.proposal.disposition = { mode };
    writeFileSync(setup.proposalPath, JSON.stringify(setup.proposal));
    const source = await invokeCli(setup.argv);
    const installed = run();
    expect(source.exitCode, source.stderr).toBe(mode === 'observe' ? 0 : 1);
    expect(installed.exitCode, installed.stderr.toString()).toBe(source.exitCode);
    expect(installed.stdout.toString()).toBe(source.stdout);
    expect(installed.stderr.toString()).toBe('');
  }
  writeFileSync(setup.proposalPath, '{bad');
  const refused = run();
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout.toString()).toBe('');
  expect(refused.stderr.toString().length).toBeGreaterThan(0);
}, 120000);

test('[BROWSER-T2-POLICY-PREVIEW-013] existing diagnostic and rule-policy contracts are unchanged', async () => {
  const { registeredRules } = await import('../rules/registry');
  expect(registeredRules().some((rule) => rule.id === 'T2')).toBe(false);
  const setup = fixture();
  const source = await invokeCli(['inspect-browser-t2', ...setup.argv.slice(1, 6), '--now', now]);
  expect(source.exitCode, source.stderr).toBe(0);
  expect(JSON.parse(source.stdout)).toEqual(setup.browserT2);
  const ledger = await invokeCli([
    'inspect-browser-scenario-ledger',
    ...setup.argv.slice(1, 6),
    '--now',
    now,
  ]);
  expect(ledger.exitCode, ledger.stderr).toBe(1);
  expect(JSON.parse(ledger.stdout)).toEqual(setup.browserT2.ledger);
});

test('[BROWSER-T2-POLICY-PREVIEW-008] active foreign-capability citations and nested debt remain independent', async () => {
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
  const setup = fixture(
    'observe',
    [],
    {
      'openspec/specs/other/spec.md': other.specMarkdown,
      'openspec/scenario-allocations.json': JSON.stringify(other.journal),
    },
    [{ title: '[OTHER-001] foreign cited', status: 'skipped' }],
  );
  const call = await invokeCli(setup.argv);
  expect(call.exitCode, call.stderr).toBe(0);
  const observed = JSON.parse(call.stdout) as Preview;
  const foreign = observed.browserT2.cases.find(
    (row) => row.case.titlePath.at(-1) === '[OTHER-001] foreign cited',
  );
  expect(foreign?.citation).toEqual({ kind: 'cited', scenarioId: 'OTHER-001' });
  expect(observed.findings).toHaveLength(5);
  expect(observed.findings.some((finding) => finding.caseId === foreign?.case.caseId)).toBe(false);
  expect(observed.browserT2.ledger.debt).toEqual(setup.browserT2.ledger.debt);
  expect(observed.browserT2.ledger.debt.length).toBeGreaterThan(0);
});

test('[BROWSER-T2-POLICY-PREVIEW-012] captured proposal bytes survive later path edits', () => {
  const setup = fixture();
  const digest = hashBytes(readFileSync(setup.proposalPath));
  const call = inject(
    setup,
    '',
    false,
    false,
    `writeFileSync(${JSON.stringify(setup.proposalPath)},'{broken')`,
  );
  expect(call.exitCode, call.stderr.toString()).toBe(0);
  const observed = JSON.parse(call.stdout.toString()) as Preview;
  expect(observed.proposedPolicy).toEqual(setup.proposal);
  expect(observed.proposedPolicyDigest).toBe(digest);
  expect(readFileSync(setup.proposalPath, 'utf8')).toBe('{broken');
});
