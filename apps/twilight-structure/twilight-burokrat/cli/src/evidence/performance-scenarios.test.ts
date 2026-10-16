import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { digestEvidenceBytes } from '@shared/test-evidence';
import { afterEach, expect, test } from 'bun:test';

import { invokeCli } from '../invoke-cli';
import { buildPackage } from '../packaging/build';
import { hashCanonical } from './content-manifest';
import type { inspectPerformanceScenarios } from './performance-scenarios';
import {
  createPerformanceFixture as fixture,
  removePerformanceFixtures,
} from './performance-scenarios.fixture';
afterEach(removePerformanceFixtures);
function git(root: string, args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', root, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}
const fixturePath = 'apps/example/src/architecture/f7.architecture.test.ts';
function inspect(setup: ReturnType<typeof fixture>, capability = 'example', extra: string[] = []) {
  return invokeCli([
    'inspect-performance-scenarios',
    setup.root,
    setup.revision,
    setup.policyPath,
    setup.authorityPath,
    capability,
    ...extra,
  ]);
}
test('[TEST-AXES-096] joins selected passing Performance cases to every adopted requested scenario', async () => {
  const setup = fixture();
  const invocation = await inspect(setup);
  expect(invocation.stderr).toBe('');
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<
    typeof inspectPerformanceScenarios
  >;
  expect(observation.scenarios).toEqual([
    {
      id: 'EXAMPLE-001',
      title: 'renders cells',
      observation: { kind: 'passing', caseIds: ['cells'] },
    },
    {
      id: 'EXAMPLE-002',
      title: 'second adopted case',
      observation: { kind: 'unobserved-in-selection' },
    },
  ]);
  expect(observation.revision).toBe(setup.revision);
  expect(observation.candidate).toBe(setup.factsAuthority.candidate);
  expect(observation.policyId).toBe('performance-fixture');
  expect(observation.policyDigest).toBe(digestEvidenceBytes(readFileSync(setup.policyPath)));
  expect(observation.declarationDigest).toBe(setup.evidence.declarationDigest);
  expect(observation.scope).toEqual({
    kind: 'selected-performance-publication',
    selection: setup.evidence.selection,
  });
  expect(observation.specifications.baseRevision).toBe(
    setup.policy.scenarios?.baseRevision ?? 'missing policy authority',
  );
  expect(observation.citationFindings).toEqual([]);
  expect(observation.authentication).toEqual({ kind: 'absent' });
  expect(observation.certifies).toBe(false);
  const { observationDigest, ...payload } = observation;
  expect(observationDigest).toBe(hashCanonical(payload));
});
for (const [terminal, kind] of [
  ['renders cells', 'missing'],
  ['[EXAMPLE-1] cells', 'malformed'],
  ['[EXAMPLE-999] cells', 'inactive'],
] as const) {
  test(`[TEST-AXES-097] diagnoses ${kind} terminal citation`, async () => {
    const invocation = await inspect(fixture('none', false, false, terminal));
    expect(invocation.exitCode).toBe(1);
    const observation = JSON.parse(invocation.stdout) as ReturnType<
      typeof inspectPerformanceScenarios
    >;
    expect(observation.citationFindings).toEqual([{ caseId: 'cells', kind, title: terminal }]);
    expect(
      observation.scenarios.every(
        (scenario) => scenario.observation.kind === 'unobserved-in-selection',
      ),
    ).toBe(true);
  });
}
test('[TEST-AXES-099] refuses absent capability, wrong level and unsupported operands without JSON', async () => {
  for (const [setup, capability, extra, finding] of [
    [fixture(), 'absent', [], 'capability is absent'],
    [fixture('architecture'), 'example', [], 'requires isolated Performance'],
    [fixture(), 'example', ['extra'], 'usage: twilight-burokrat inspect-performance-scenarios'],
  ] as const) {
    const invocation = await inspect(setup, capability, [...extra]);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(finding);
  }
});
test('[TEST-AXES-098] refuses unidentified requested scenario', async () => {
  const invocation = await inspect(
    fixture(
      'none',
      false,
      false,
      '[EXAMPLE-001] renders cells',
      '\n#### Scenario: unidentified debt\n- **WHEN** read\n- **THEN** unresolved\n',
    ),
  );
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('requested capability has unidentified scenarios');
});

test('[TEST-AXES-098] preserves unrelated unidentified B3 debt without promoting it to requested rows', async () => {
  const invocation = await inspect(
    fixture('none', false, false, '[EXAMPLE-001] renders cells', '', {
      'openspec/specs/unrelated/spec.md':
        '# Other\n\n## Requirements\n\n### Requirement: Other\n\n#### Scenario: existing debt\n- **WHEN** read\n- **THEN** unresolved\n',
    }),
  );
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<
    typeof inspectPerformanceScenarios
  >;
  expect(observation.specifications.unidentified).toEqual([
    { path: 'openspec/specs/unrelated/spec.md', title: 'existing debt' },
  ]);
  expect(observation.scenarios).toHaveLength(2);
});
test('[TEST-AXES-098] whole-tree B3 refuses an unrelated active conflict before capability filtering', async () => {
  const content =
    '## ADDED Requirements\n\n### Requirement: Other\n\n#### Scenario: debt\n- **WHEN** read\n- **THEN** unresolved\n';
  const invocation = await inspect(
    fixture('none', false, false, '[EXAMPLE-001] renders cells', '', {
      'openspec/changes/first/specs/unrelated/spec.md': content,
      'openspec/changes/second/specs/unrelated/spec.md': content,
    }),
  );
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('competing overlay operation: unrelated');
});
test('[TEST-AXES-099] source and publication failures never emit partial scenario JSON', async () => {
  for (const fault of ['source', 'policy', 'declaration', 'publication'] as const) {
    const setup = fixture();
    if (fault === 'source') {
      writeFileSync(join(setup.root, fixturePath), 'changed source');
      git(setup.root, ['add', '.']);
      git(setup.root, ['commit', '-m', 'changed selected source']);
      setup.revision = git(setup.root, ['rev-parse', 'HEAD']);
    } else if (fault === 'policy') writeFileSync(setup.policyPath, '{broken');
    else if (fault === 'declaration') {
      setup.factsAuthority.scope.declaration.digest = '0'.repeat(64);
      writeFileSync(setup.authorityPath, JSON.stringify(setup.factsAuthority));
    } else rmSync(join(setup.bundle, 'run.json'));
    const invocation = await inspect(setup);
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr.length).toBeGreaterThan(0);
  }
});
test('[TEST-AXES-099] installed scenario dispatch binds the same complete observation', async () => {
  const setup = fixture();
  const packageDirectory = join(setup.root, 'package');
  await buildPackage(packageDirectory);
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      join(packageDirectory, 'dist/bin.mjs'),
      'inspect-performance-scenarios',
      setup.root,
      setup.revision,
      setup.policyPath,
      setup.authorityPath,
      'example',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
  expect(invocation.stderr.toString()).toBe('');
  const source = await inspect(setup);
  expect(JSON.parse(invocation.stdout.toString())).toEqual(JSON.parse(source.stdout));
}, 120_000);

test('[TEST-AXES-097] retired citations cannot observe an active scenario', async () => {
  const invocation = await inspect(
    fixture('none', false, false, '[EXAMPLE-002] retired case', '', {}, true),
  );
  expect(invocation.exitCode).toBe(1);
  const observation = JSON.parse(invocation.stdout) as ReturnType<
    typeof inspectPerformanceScenarios
  >;
  expect(observation.citationFindings).toEqual([
    { caseId: 'cells', kind: 'inactive', title: '[EXAMPLE-002] retired case' },
  ]);
  expect(observation.scenarios).toEqual([
    { id: 'EXAMPLE-001', title: 'renders cells', observation: { kind: 'unobserved-in-selection' } },
  ]);
});

test('[TEST-AXES-099] requires explicit external policy.scenarios', async () => {
  const invocation = await inspect(
    fixture('none', false, false, '[EXAMPLE-001] renders cells', '', {}, false, false),
  );
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout).toBe('');
  expect(invocation.stderr).toContain('needs external policy.scenarios');
});
for (const [replacement, finding] of [
  [
    "publication: { ...context.publication, policyDigest: 'foreign' }",
    'policy differs from publication',
  ],
  [
    'declaration: { ...context.declaration, cases: context.declaration.cases.map((entry) => ({ ...entry, titlePath: [] })) }',
    'terminal test title is absent',
  ],
] as const) {
  test(`[TEST-AXES-099] broken validated context refuses ${finding}`, () => {
    const setup = fixture();
    const modulePath = join(import.meta.dir, 'performance-levels.ts');
    const preload = join(setup.root, 'fault-preload.ts');
    writeFileSync(
      preload,
      `import { mock } from 'bun:test';\nconst actual = await import(${JSON.stringify(modulePath + '?real-context')});\nmock.module(${JSON.stringify(modulePath)}, () => ({ ...actual, inspectPerformanceSelection: (...args) => { const context = actual.inspectPerformanceSelection(...args); return { ...context, ${replacement} }; } }));\n`,
    );
    const invocation = Bun.spawnSync(
      [
        process.execPath,
        'run',
        `--preload=${preload}`,
        join(import.meta.dir, '../cli.ts'),
        'inspect-performance-scenarios',
        setup.root,
        setup.revision,
        setup.policyPath,
        setup.authorityPath,
        'example',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout.toString()).toBe('');
    expect(invocation.stderr.toString()).toContain(finding);
  });
}

test('[TEST-AXES-096] joins multiple distinct passing cases in canonical case order', async () => {
  const invocation = await inspect(fixture('none', true, true));
  expect(invocation.exitCode, invocation.stderr).toBe(0);
  const observation = JSON.parse(invocation.stdout) as ReturnType<
    typeof inspectPerformanceScenarios
  >;
  expect(observation.scenarios[0]?.observation).toEqual({
    kind: 'passing',
    caseIds: ['cells', 'zulu'],
  });
});

test('[TEST-AXES-097] only terminal test-title prefixes cite scenarios, including nested suites', async () => {
  for (const terminal of ['[EXAMPLE-001] renders cells', 'renders cells']) {
    const invocation = await inspect(
      fixture('none', false, false, terminal, '', {}, false, true, '[EXAMPLE-002] suite'),
    );
    expect(invocation.exitCode, invocation.stderr).toBe(terminal.startsWith('[') ? 0 : 1);
    const observation = JSON.parse(invocation.stdout) as ReturnType<
      typeof inspectPerformanceScenarios
    >;
    expect(observation.scenarios[1]?.observation).toEqual({ kind: 'unobserved-in-selection' });
    expect(observation.citationFindings).toHaveLength(terminal.startsWith('[') ? 0 : 1);
  }
});

test('[TEST-AXES-096] upstream observation identities affect complete scenario digest', async () => {
  const setup = fixture();
  const baseline = JSON.parse((await inspect(setup)).stdout) as ReturnType<
    typeof inspectPerformanceScenarios
  >;
  const modulePath = join(import.meta.dir, 'performance-levels.ts');
  const preload = join(setup.root, 'identity-preload.ts');
  writeFileSync(
    preload,
    `import { mock } from 'bun:test';\nconst actual = await import(${JSON.stringify(modulePath + '?real-identity')});\nmock.module(${JSON.stringify(modulePath)}, () => ({ ...actual, inspectPerformanceSelection: (...args) => { const context = actual.inspectPerformanceSelection(...args); return { ...context, publication: { ...context.publication, observationDigest: 'publication-fault' }, levels: { ...context.levels, observationDigest: 'levels-fault' } }; } }));\n`,
  );
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'run',
      `--preload=${preload}`,
      join(import.meta.dir, '../cli.ts'),
      'inspect-performance-scenarios',
      setup.root,
      setup.revision,
      setup.policyPath,
      setup.authorityPath,
      'example',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode).toBe(0);
  const observation = JSON.parse(invocation.stdout.toString()) as ReturnType<
    typeof inspectPerformanceScenarios
  >;
  expect(observation.publicationObservationDigest).toBe('publication-fault');
  expect(observation.levelsObservationDigest).toBe('levels-fault');
  expect(observation.observationDigest).not.toBe(baseline.observationDigest);
  const { observationDigest, ...payload } = observation;
  expect(observationDigest).toBe(hashCanonical(payload));
});
