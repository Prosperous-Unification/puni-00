import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { invokeCli } from '../invoke-cli';
import { buildPackage } from '../packaging/build';
import { hashCanonical } from './content-manifest';
import { inspectPerformanceScenarios } from './performance-scenarios';
import {
  createPerformanceFixture,
  removePerformanceFixtures,
} from './performance-scenarios.fixture';
afterEach(removePerformanceFixtures);
import type { inspectScenarioLedger } from './scenario-ledger';
type Ledger = ReturnType<typeof inspectScenarioLedger>;
const now = '2026-10-15T00:00:00.000Z';
function fixture(
  terminal = '[EXAMPLE-001] renders cells',
  extraFiles: Record<string, string> = {},
) {
  const setup = createPerformanceFixture('none', false, false, terminal, '', extraFiles);
  const performance = inspectPerformanceScenarios(
    setup.root,
    setup.revision,
    setup.policyPath,
    setup.authorityPath,
    'example',
  );
  const ledgerPath = join(dirname(setup.policyPath), 'ledger.json');
  const authority = {
    schemaVersion: 1,
    revision: setup.revision,
    candidate: performance.candidate,
    capability: 'example',
    performanceObservationDigest: performance.observationDigest,
    obligations: [
      {
        scenarioId: 'EXAMPLE-001',
        disposition: { kind: 'automated', lowestSufficientLevel: 'performance' },
      },
      {
        scenarioId: 'EXAMPLE-002',
        disposition: { kind: 'inapplicable', reason: 'No second physical control.' },
      },
    ],
  };
  writeFileSync(ledgerPath, JSON.stringify(authority));
  return { ...setup, ledgerPath, authority, performance };
}
function operands(setup: ReturnType<typeof fixture>) {
  return [
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
}
async function inspect(setup: ReturnType<typeof fixture>) {
  return invokeCli(operands(setup));
}
function rewrite(
  setup: ReturnType<typeof fixture>,
  change: (authority: Record<string, unknown>) => void,
) {
  const authority = JSON.parse(readFileSync(setup.ledgerPath, 'utf8')) as Record<string, unknown>;
  change(authority);
  writeFileSync(setup.ledgerPath, JSON.stringify(authority));
}
test('[TEST-AXES-104] ledger enumerates adopted rows and omitted obligations remain named debt', async () => {
  const setup = fixture();
  setup.authority.obligations.pop();
  writeFileSync(setup.ledgerPath, JSON.stringify(setup.authority));
  const invocation = await inspect(setup);
  expect(invocation.stderr).toBe('');
  expect(invocation.exitCode).toBe(1);
  const observation = JSON.parse(invocation.stdout) as Ledger;
  expect(observation.scenarios.map((row: { id: string }) => row.id)).toEqual([
    'EXAMPLE-001',
    'EXAMPLE-002',
  ]);
  expect(observation.scenarios[0].verdict).toEqual({
    kind: 'passing-in-selection',
    caseIds: ['cells'],
  });
  expect(observation.scenarios[1].verdict).toEqual({ kind: 'unassigned' });
  expect(observation.debt).toEqual([
    { kind: 'scenario', scenarioId: 'EXAMPLE-002', verdict: 'unassigned' },
  ]);
});
test('[TEST-AXES-106] complete report diagnostic flags and canonical digest survive reorder', async () => {
  const setup = fixture();
  const invocation = await inspect(setup);
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  const observation = JSON.parse(invocation.stdout) as Ledger;
  expect(observation.performance).toEqual(setup.performance);
  expect(observation.authentication).toEqual({ kind: 'absent' });
  expect(observation.certifies).toBe(false);
  expect(observation.evaluatedAt).toBe(now);
  const { observationDigest, ...payload } = observation;
  expect(observationDigest).toBe(hashCanonical(payload));
  setup.authority.obligations.reverse();
  writeFileSync(setup.ledgerPath, JSON.stringify(setup.authority));
  expect(JSON.parse((await inspect(setup)).stdout)).toEqual(observation);
  setup.authority.obligations[0].disposition.reason = 'Another reason';
  writeFileSync(setup.ledgerPath, JSON.stringify(setup.authority));
  expect((JSON.parse((await inspect(setup)).stdout) as Ledger).observationDigest).not.toBe(
    observationDigest,
  );
});
for (const [field, value] of [
  ['revision', '0'.repeat(40)],
  ['candidate', '0'.repeat(64)],
  ['capability', 'foreign'],
  ['performanceObservationDigest', '0'.repeat(64)],
  ['schemaVersion', 99],
  ['extra', true],
] as const)
  test(`[TEST-AXES-105] refuses authority ${field} substitution`, async () => {
    const setup = fixture();
    rewrite(setup, (authority) => {
      authority[field] = value;
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
  test(`[TEST-AXES-105] refuses ${name}`, async () => {
    const setup = fixture();
    rewrite(setup, (authority) => {
      authority['obligations'] = obligations;
    });
    const invocation = await inspect(setup);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr.length).toBeGreaterThan(0);
  });
test('[TEST-AXES-104] mismatched lowest sufficient level remains unsupported debt', async () => {
  const setup = fixture();
  setup.authority.obligations[0].disposition.lowestSufficientLevel = 'unit';
  writeFileSync(setup.ledgerPath, JSON.stringify(setup.authority));
  const invocation = await inspect(setup);
  expect(invocation.exitCode).toBe(1);
  expect((JSON.parse(invocation.stdout) as Ledger).scenarios[0].verdict).toEqual({
    kind: 'unsupported-level',
    level: 'unit',
  });
});
test('[TEST-AXES-106] lost citation and unrelated unidentified B3 debt remain visible', async () => {
  const setup = fixture('renders cells', {
    'openspec/specs/unrelated/spec.md':
      '## Requirements\n### Requirement: Other\n#### Scenario: unidentified\n- **WHEN** read\n- **THEN** debt\n',
  });
  const invocation = await inspect(setup);
  expect(invocation.exitCode).toBe(1);
  const observation = JSON.parse(invocation.stdout) as Ledger;
  expect(observation.performance).toEqual(setup.performance);
  expect(observation.scenarios[0].verdict).toEqual({ kind: 'unobserved-in-selection' });
  expect(observation.debt).toContainEqual({
    kind: 'citation',
    caseId: 'cells',
    finding: 'missing',
  });
  expect(observation.debt).toContainEqual({
    kind: 'unidentified',
    path: 'openspec/specs/unrelated/spec.md',
    title: 'unidentified',
  });
});
for (const fault of [
  'missing',
  'unreadable',
  'directory',
  'symlink',
  'invalid UTF8',
  'invalid JSON',
])
  test(`[TEST-AXES-105] refuses ${fault} ledger authority`, async () => {
    const setup = fixture();
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
test('[TEST-AXES-106] installed dispatch retains debt exit and identical JSON', async () => {
  const setup = fixture();
  setup.authority.obligations.pop();
  writeFileSync(setup.ledgerPath, JSON.stringify(setup.authority));
  const packageDirectory = join(setup.root, 'package');
  await buildPackage(packageDirectory);
  const invocation = Bun.spawnSync(
    [process.execPath, join(packageDirectory, 'dist/bin.mjs'), ...operands(setup)],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(1);
  expect(invocation.stderr.toString()).toBe('Twilight Burokrat validator exited 1\n');
  expect(JSON.parse(invocation.stdout.toString())).toEqual(
    JSON.parse((await inspect(setup)).stdout),
  );
}, 120_000);

for (const [outcome, overdue, state] of [
  ['passed', false, 'current'],
  ['failed', false, 'failed'],
  ['skipped', false, 'failed'],
  ['passed', true, 'overdue'],
  ['passed', false, 'stale'],
] as const) {
  test(`[TEST-AXES-107] joins real Manual ${outcome} ${state}`, async () => {
    const { createLedgerManualFixture } = await import('./scenario-ledger-manual.fixture');
    const setup = createLedgerManualFixture(outcome, overdue, state === 'stale');
    const invocation = await invokeCli([
      'inspect-scenario-ledger',
      setup.root,
      setup.revision,
      setup.policyPath,
      setup.authorityPath,
      'example',
      setup.ledgerPath,
      '--now',
      setup.now,
    ]);
    expect(invocation.stderr).toBe('');
    expect(invocation.exitCode).toBe(state === 'current' ? 0 : 1);
    const observation = JSON.parse(invocation.stdout) as Ledger;
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

test('[TEST-AXES-105] unrelated competing B3 operation refuses before ledger rows', async () => {
  const content =
    '## ADDED Requirements\n### Requirement: Other\n#### Scenario: debt\n- **WHEN** read\n- **THEN** unresolved\n';
  const setup = createPerformanceFixture('none', false, false, '[EXAMPLE-001] renders cells', '', {
    'openspec/changes/first/specs/unrelated/spec.md': content,
    'openspec/changes/second/specs/unrelated/spec.md': content,
  });
  const invocation = await invokeCli([
    'inspect-scenario-ledger',
    setup.root,
    setup.revision,
    setup.policyPath,
    setup.authorityPath,
    'example',
    join(dirname(setup.policyPath), 'absent.json'),
    '--now',
    now,
  ]);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('competing overlay operation');
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
  test(`[TEST-AXES-107] refuses substituted Manual ${name} despite repinned outer digest`, async () => {
    const { createLedgerManualFixture } = await import('./scenario-ledger-manual.fixture');
    const setup = createLedgerManualFixture();
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
    setup.authority.obligations[0].disposition.observationDigest =
      name === 'digest' ? '0'.repeat(64) : hashCanonical(payload);
    writeFileSync(setup.ledgerPath, JSON.stringify(setup.authority));
    const invocation = Bun.spawnSync(
      [
        process.execPath,
        'run',
        `--preload=${preload}`,
        join(import.meta.dir, '../cli.ts'),
        'inspect-scenario-ledger',
        setup.root,
        setup.revision,
        setup.policyPath,
        setup.authorityPath,
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

test('[TEST-AXES-107] missing Manual report and foreign observation pin refuse without fallback', async () => {
  const { createLedgerManualFixture } = await import('./scenario-ledger-manual.fixture');
  for (const fault of ['missing', 'pin']) {
    const setup = createLedgerManualFixture();
    if (fault === 'missing') rmSync(setup.reportPath);
    else {
      setup.authority.obligations[0].disposition.observationDigest = '0'.repeat(64);
      writeFileSync(setup.ledgerPath, JSON.stringify(setup.authority));
    }
    const invocation = await invokeCli([
      'inspect-scenario-ledger',
      setup.root,
      setup.revision,
      setup.policyPath,
      setup.authorityPath,
      'example',
      setup.ledgerPath,
      '--now',
      now,
    ]);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr.length).toBeGreaterThan(0);
  }
});

for (const extra of [[], ['--now', '2026-02-30T00:00:00.000Z'], ['--now', now, 'extra']])
  test(`[TEST-AXES-105] refuses unsupported operands ${JSON.stringify(extra)}`, async () => {
    const setup = fixture();
    const invocation = await invokeCli([...operands(setup).slice(0, 7), ...extra]);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr.length).toBeGreaterThan(0);
  });

for (const fault of ['unreadable', 'directory', 'symlink', 'invalid UTF8', 'invalid JSON'])
  test(`[TEST-AXES-107] refuses ${fault} Manual report without fallback`, async () => {
    const { createLedgerManualFixture } = await import('./scenario-ledger-manual.fixture');
    const setup = createLedgerManualFixture();
    if (fault === 'unreadable') chmodSync(setup.reportPath, 0);
    else if (fault === 'directory') {
      rmSync(setup.reportPath);
      mkdirSync(setup.reportPath);
    } else if (fault === 'symlink') {
      const target = setup.reportPath + '.target';
      writeFileSync(target, readFileSync(setup.reportPath));
      rmSync(setup.reportPath);
      symlinkSync(target, setup.reportPath);
    } else
      writeFileSync(setup.reportPath, fault === 'invalid UTF8' ? Buffer.from([0xff]) : '{broken');
    try {
      const invocation = await invokeCli([
        'inspect-scenario-ledger',
        setup.root,
        setup.revision,
        setup.policyPath,
        setup.authorityPath,
        'example',
        setup.ledgerPath,
        '--now',
        now,
      ]);
      expect(invocation.exitCode).toBe(1);
      expect(invocation.stdout).toBe('');
      expect(invocation.stderr.length).toBeGreaterThan(0);
    } finally {
      if (fault === 'unreadable') chmodSync(setup.reportPath, 0o600);
    }
  });
for (const [name, replacement] of [
  ['revision', "revision:'0'.repeat(40)"],
  ['capability', "capability:'foreign'"],
  ['authentication', "authentication:{kind:'present'}"],
  ['certifies', 'certifies:true'],
  ['digest', "observationDigest:'0'.repeat(64)"],
] as const)
  test(`[TEST-AXES-105] refuses substituted Performance ${name}`, () => {
    const setup = fixture();
    const modulePath = join(import.meta.dir, 'performance-scenarios.ts');
    const preload = join(dirname(setup.policyPath), 'performance-substitute.ts');
    writeFileSync(
      preload,
      `import {mock} from 'bun:test';import {hashCanonical} from ${JSON.stringify(join(import.meta.dir, 'content-manifest.ts'))};const actual=await import(${JSON.stringify(modulePath + '?actual')});mock.module(${JSON.stringify(modulePath)},()=>({...actual,inspectPerformanceScenarios:(...args)=>{const observation=actual.inspectPerformanceScenarios(...args);const substituted={...observation,${replacement}};const {observationDigest,...payload}=substituted;return {...payload,observationDigest:${name === 'digest' ? "'0'.repeat(64)" : 'hashCanonical(payload)'}};}}));`,
    );
    const payload: Record<string, unknown> = { ...setup.performance };
    delete payload['observationDigest'];
    switch (name) {
      case 'revision':
        payload['revision'] = '0'.repeat(40);
        break;
      case 'capability':
        payload['capability'] = 'foreign';
        break;
      case 'authentication':
        payload['authentication'] = { kind: 'present' };
        break;
      case 'certifies':
        payload['certifies'] = true;
        break;
      case 'digest':
        break;
    }
    setup.authority.performanceObservationDigest =
      name === 'digest' ? '0'.repeat(64) : hashCanonical(payload);
    writeFileSync(setup.ledgerPath, JSON.stringify(setup.authority));
    const invocation = Bun.spawnSync(
      [
        process.execPath,
        'run',
        `--preload=${preload}`,
        join(import.meta.dir, '../cli.ts'),
        ...operands(setup),
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout.toString()).toBe('');
    expect(invocation.stderr.toString()).toContain(
      name === 'digest'
        ? 'Performance observationDigest differs'
        : 'Performance scope or diagnostic boundary differs',
    );
  });

test('[TEST-AXES-105] refuses noncanonical ledger authority path', async () => {
  const setup = fixture();
  const args = operands(setup);
  args[6] =
    dirname(setup.ledgerPath) +
    '/../' +
    dirname(setup.ledgerPath).split('/').slice(-1).join('') +
    '/ledger.json';
  const invocation = await invokeCli(args);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('canonical absolute');
});
test('[TEST-AXES-105] retired obligation cannot assign a row', async () => {
  const setup = createPerformanceFixture(
    'none',
    false,
    false,
    '[EXAMPLE-001] renders cells',
    '',
    {},
    true,
  );
  const performance = inspectPerformanceScenarios(
    setup.root,
    setup.revision,
    setup.policyPath,
    setup.authorityPath,
    'example',
  );
  const ledgerPath = join(dirname(setup.policyPath), 'ledger.json');
  writeFileSync(
    ledgerPath,
    JSON.stringify({
      schemaVersion: 1,
      revision: setup.revision,
      candidate: performance.candidate,
      capability: 'example',
      performanceObservationDigest: performance.observationDigest,
      obligations: [
        { scenarioId: 'EXAMPLE-002', disposition: { kind: 'inapplicable', reason: 'Retired' } },
      ],
    }),
  );
  const invocation = await invokeCli([
    'inspect-scenario-ledger',
    setup.root,
    setup.revision,
    setup.policyPath,
    setup.authorityPath,
    'example',
    ledgerPath,
    '--now',
    now,
  ]);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('foreign or retired scenario: EXAMPLE-002');
});

test('[TEST-AXES-105] malformed scenario ID refuses at closed schema boundary', async () => {
  const setup = fixture();
  rewrite(setup, (authority) => {
    authority['obligations'] = [
      { scenarioId: 'EXAMPLE-1', disposition: { kind: 'inapplicable', reason: 'reason' } },
    ];
  });
  const invocation = await inspect(setup);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('scenarioId');
});
test('[TEST-AXES-105] unknown disposition refuses at closed variant boundary', async () => {
  const setup = fixture();
  rewrite(setup, (authority) => {
    authority['obligations'] = [
      { scenarioId: 'EXAMPLE-001', disposition: { kind: 'guess', reason: 'reason' } },
    ];
  });
  const invocation = await inspect(setup);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('disposition');
});
