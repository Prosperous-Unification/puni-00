import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { afterAll, afterEach, expect, test } from 'bun:test';

import { type CliInvocation, invokeCli } from '../invoke-cli';
import { registeredRules } from '../rules/registry';
import { hashBytes, hashCanonical } from './content-manifest';
import { EvaluationInstantError, readEvaluationInstant } from './manual';

const scratch: string[] = [];
const cli = join(import.meta.dir, '..', 'cli.ts');
/**
 * The evaluation instant every case passes as `--now`, as Twilight Dash would: after every
 * fixture timestamp, so the ordinary chain is current, and fixed, so no case reads a clock.
 */
const EVALUATED_AT = '2026-10-11T00:00:00.000Z';
const digest = (record: unknown): string => hashBytes(Buffer.from(JSON.stringify(record)));
function git(root: string, args: string[]): string {
  const call = Bun.spawnSync(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (call.exitCode !== 0) throw new Error(call.stderr.toString());
  return call.stdout.toString().trim();
}
function indexSource(
  moduleId: string,
  memberships: { kind: string; path?: string; prefix?: string; exclusions?: string[] }[],
): string {
  return `# Fixture module\n\n<!-- module-index ${JSON.stringify({
    schemaVersion: 1,
    moduleId,
    memberships,
    relationshipSelectors: [],
    applicableChecks: [],
    inapplicableSections: [
      { section: 'relationships', reason: 'Fixture has no relationships.' },
      { section: 'invariants', reason: 'Fixture has no cross-file invariant.' },
      { section: 'checks', reason: 'Fixture uses the Manual inspector.' },
    ],
    externalConsumers: { kind: 'none-known', knowledgeLimit: 'Fixture candidate only.' },
  })} -->\n`;
}
function reviewedScope(root: string, revision: string, moduleDirectory = 'source') {
  const requirement =
    '### Requirement: Example requirement\n#### Scenario: [EXAMPLE-001] Example\n';
  const paths = [`${moduleDirectory}/README.md`, `${moduleDirectory}/module.ts`];
  const entries = paths.map((path) => ({
    path,
    mode: git(root, ['ls-tree', revision, '--', path]).slice(0, 6),
    blob: git(root, ['rev-parse', `${revision}:${path}`]),
  }));
  return {
    requirementDigest: hashBytes(Buffer.from(requirement)),
    modules: [
      {
        moduleId: 'module-one',
        digest: hashCanonical({
          schemaVersion: 1,
          moduleId: 'module-one',
          indexPath: `${moduleDirectory}/README.md`,
          entries,
        }),
      },
    ],
  };
}
function committedRecords() {
  const disposition = {
    schemaVersion: 1,
    scenarioId: 'EXAMPLE-001',
    title: 'Example',
    reason: 'Physical control',
    procedurePath: 'manual/procedure.json',
    touchedModules: ['module-one'],
  };
  const procedure = {
    schemaVersion: 1,
    scenarioId: 'EXAMPLE-001',
    title: 'Example',
    steps: [
      { stepId: 'step-one', instruction: 'Press control', expectedObservation: 'Lamp lights' },
    ],
  };
  return { disposition, procedure };
}
/**
 * The committed candidate every case starts from, built once per `baseLamp` and copied per case:
 * cases add commits and rewrite records, so each needs its own repository, but building one costs
 * a dozen `git` processes and the copy costs none. Commit IDs survive the copy.
 */
interface CandidateTemplate {
  root: string;
  baseRevision: string;
  revision: string;
  scope: ReturnType<typeof reviewedScope>;
}
const templates = new Map<boolean, CandidateTemplate>();
const templateRoot = mkdtempSync(join(tmpdir(), 'burokrat-manual-template-'));
afterAll(() => {
  rmSync(templateRoot, { recursive: true, force: true });
});
function candidateTemplate(baseLamp: boolean): CandidateTemplate {
  const cached = templates.get(baseLamp);
  if (cached !== undefined) return cached;
  const root = join(templateRoot, String(baseLamp));
  mkdirSync(root);
  git(root, ['init']);
  git(root, ['config', 'user.name', 'Fixture Author']);
  git(root, ['config', 'user.email', 'author@example.invalid']);
  git(root, ['commit', '--allow-empty', '-m', 'earlier history']);
  const source = 'openspec/specs/example/spec.md';
  mkdirSync(join(root, 'openspec/specs/example'), { recursive: true });
  writeFileSync(
    join(root, source),
    '## Requirements\n### Requirement: Example requirement\n#### Scenario: [EXAMPLE-001] Example\n',
  );
  writeFileSync(
    join(root, 'openspec/scenario-allocations.json'),
    JSON.stringify({
      schemaVersion: 1,
      events: [{ kind: 'import', id: 'EXAMPLE-001', source, title: 'Example' }],
    }),
  );
  writeFileSync(
    join(root, 'README.md'),
    indexSource('module-root', [
      { kind: 'directory-prefix', prefix: 'openspec', exclusions: [] },
      { kind: 'directory-prefix', prefix: 'manual', exclusions: [] },
      { kind: 'path', path: 'source/README.md' },
    ]),
  );
  mkdirSync(join(root, 'source'));
  writeFileSync(
    join(root, 'source/README.md'),
    indexSource('module-one', [{ kind: 'path', path: 'module.ts' }]),
  );
  writeFileSync(join(root, 'source/module.ts'), `export const lamp = ${String(baseLamp)};\n`);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'reviewed base']);
  const baseRevision = git(root, ['rev-parse', 'HEAD']);
  if (!baseLamp) writeFileSync(join(root, 'source/module.ts'), 'export const lamp = true;\n');
  const { disposition, procedure } = committedRecords();
  mkdirSync(join(root, 'manual'));
  writeFileSync(join(root, 'manual/disposition.json'), JSON.stringify(disposition));
  writeFileSync(join(root, 'manual/procedure.json'), JSON.stringify(procedure));
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'candidate']);
  const revision = git(root, ['rev-parse', 'HEAD']);
  const template = { root, baseRevision, revision, scope: reviewedScope(root, revision) };
  templates.set(baseLamp, template);
  return template;
}
function fixture(baseLamp = true) {
  const template = candidateTemplate(baseLamp);
  const base = mkdtempSync(join(tmpdir(), 'burokrat-manual-'));
  scratch.push(base);
  const root = join(base, 'candidate');
  cpSync(template.root, root, { recursive: true, verbatimSymlinks: true });
  const { baseRevision, revision } = template;
  const scope = structuredClone(template.scope);
  const { disposition, procedure } = committedRecords();
  const environment = {
    schemaVersion: 1,
    observationId: 'observation-one',
    environmentId: 'bench-one',
    observedAt: '2026-10-08T10:00:00.000Z',
    sourceRevision: revision,
    attributes: { host: 'bench' },
  };
  const report = {
    schemaVersion: 1,
    runId: 'run-one',
    scenarioId: 'EXAMPLE-001',
    title: 'Example',
    dispositionPath: 'manual/disposition.json',
    dispositionDigest: digest(disposition),
    procedureDigest: digest(procedure),
    sourceRevision: revision,
    reviewedScope: scope,
    operator: 'operator-one',
    startedAt: '2026-10-08T10:01:00.000Z',
    completedAt: '2026-10-08T10:02:00.000Z',
    environmentPath: join(base, 'environment.json'),
    environmentDigest: digest(environment),
    reviewApprovalPath: join(base, 'review.json'),
    acceptanceApprovalPath: join(base, 'acceptance.json'),
    steps: [{ stepId: 'step-one', outcome: 'passed', observation: 'Lamp lights' }],
    outcome: 'passed',
  };
  const review = {
    schemaVersion: 1,
    kind: 'disposition-review',
    scenarioId: 'EXAMPLE-001',
    dispositionDigest: digest(disposition),
    procedureDigest: digest(procedure),
    reviewedScope: report.reviewedScope,
    reviewer: 'reviewer-one',
    reference: 'ticket-one',
    reviewedAt: '2026-10-07T10:00:00.000Z',
    reviewBy: '9999-12-31',
  };
  const acceptance = {
    schemaVersion: 1,
    kind: 'report-acceptance',
    runId: 'run-one',
    reportDigest: digest(report),
    environmentDigest: digest(environment),
    operator: 'operator-one',
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    reviewer: 'reviewer-two',
    reference: 'ticket-two',
    acceptedAt: '2026-10-08T10:03:00.000Z',
  };
  const records = { environment, report, review, acceptance };
  for (const [name, record] of Object.entries(records))
    writeFileSync(join(base, `${name}.json`), JSON.stringify(record));
  const manual = {
    dispositions: [{ path: 'manual/disposition.json', digest: digest(disposition) }],
    reports: [{ path: join(base, 'report.json'), digest: digest(report) }],
    environments: [{ path: join(base, 'environment.json'), digest: digest(environment) }],
    approvals: [
      { path: join(base, 'review.json'), digest: digest(review) },
      { path: join(base, 'acceptance.json'), digest: digest(acceptance) },
    ],
  };
  const policyPath = join(base, 'policy.json');
  const policy = {
    schemaVersion: 1,
    policyId: 'manual-fixture',
    ruleModes: registeredRules().map((rule) => ({ ruleId: rule.id, mode: 'observe' })),
    manual,
    scenarios: { baseRevision },
  };
  writeFileSync(policyPath, JSON.stringify(policy));
  return {
    base,
    baseRevision,
    root,
    revision,
    policyPath,
    policy,
    manual,
    disposition,
    procedure,
    records,
    reportPath: join(base, 'report.json'),
  };
}
function inspectArguments(setup: ReturnType<typeof fixture>, now: string): string[] {
  return [
    'inspect-manual',
    setup.root,
    setup.revision,
    setup.policyPath,
    setup.reportPath,
    '--now',
    now,
  ];
}
/** Runs `inspect-manual` in this process through the CLI entry; see {@link invokeCli}. */
function inspect(setup: ReturnType<typeof fixture>, now = EVALUATED_AT): Promise<CliInvocation> {
  return invokeCli(inspectArguments(setup, now));
}
/**
 * Runs `inspect-manual` as its own Bun process, for the cases about the process boundary: the
 * real exit status, and a `PATH` the spawned `git` must see.
 */
function spawnInspect(
  setup: ReturnType<typeof fixture>,
  env: Record<string, string | undefined> = process.env,
): CliInvocation {
  const call = Bun.spawnSync(
    [process.execPath, 'run', cli, ...inspectArguments(setup, EVALUATED_AT)],
    {
      env,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  return {
    exitCode: call.exitCode,
    stdout: call.stdout.toString(),
    stderr: call.stderr.toString(),
  };
}
function readCurrency(call: CliInvocation): unknown {
  const observation = JSON.parse(call.stdout) as Record<string, unknown>;
  return observation['currency'];
}
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

test('inspect-manual accepts an exact external approval chain as a noncertifying passing observation', async () => {
  const setup = fixture();
  const call = await inspect(setup);
  expect(call.exitCode, call.stderr).toBe(0);
  const observation = JSON.parse(call.stdout) as Record<string, unknown>;
  expect(observation['state']).toBe('current');
  expect(observation['validation']).toBe('passed');
  expect(observation['outcome']).toBe('passed');
  expect(observation['provenance']).toBe('policy-pinned-external-approval');
  expect(observation['certifies']).toBe(false);
  expect(observation['scenarioId']).toBe('EXAMPLE-001');
  expect(observation['runId']).toBe('run-one');
  expect(observation['revision']).toBe(setup.revision);
  expect(observation['testedRevision']).toBe(setup.revision);
  expect(observation['currency']).toBe('current');
  expect(observation['reportDigest']).toBe(digest(setup.records.report));
  expect(Object.hasOwn(observation, 'coverage')).toBe(false);
  expect(readdirSync(setup.base).some((name) => name.endsWith('.xml'))).toBe(false);
});

test('inspect-manual maps a stale passing report to a failing CLI verdict', async () => {
  const setup = fixture();
  writeFileSync(join(setup.root, 'source/module.ts'), 'export const lamp = false;\n');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'change touched module']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toBe('');
  const observation = JSON.parse(call.stdout) as Record<string, unknown>;
  expect(observation['state']).toBe('stale');
  expect(observation['validation']).toBe('passed');
  expect(observation['outcome']).toBe('passed');
  expect(observation['currency']).toBe('stale');
  expect(observation['certifies']).toBe(false);
  expect(Object.hasOwn(observation, 'coverage')).toBe(false);
});

test('inspect-manual ends its own process with the verdict exit status', () => {
  const setup = fixture();
  const current = spawnInspect(setup);
  expect(current.exitCode, current.stderr).toBe(0);
  expect(JSON.parse(current.stdout)).toMatchObject({ state: 'current' });
  writeFileSync(join(setup.root, 'source/module.ts'), 'export const lamp = false;\n');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'change touched module']);
  const stale = spawnInspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(stale.exitCode).toBe(1);
  expect(stale.stderr).toBe('');
  expect(JSON.parse(stale.stdout)).toMatchObject({ state: 'stale' });
});

test.each(['failed', 'skipped'] as const)(
  'inspect-manual maps an internally consistent %s run to failed verdict',
  async (outcome) => {
    const setup = fixture();
    setup.records.report.steps[0].outcome = outcome;
    setup.records.report.outcome = outcome;
    setup.records.acceptance.reportDigest = digest(setup.records.report);
    writeApprovedChain(setup);
    const call = await inspect(setup);
    expect(call.exitCode).toBe(1);
    expect(call.stderr).toBe('');
    const observation = JSON.parse(call.stdout) as Record<string, unknown>;
    expect(observation['state']).toBe('failed');
    expect(observation['validation']).toBe('passed');
    expect(observation['currency']).toBe('current');
    expect(observation['outcome']).toBe(outcome);
    expect(observation['certifies']).toBe(false);
    expect(Object.hasOwn(observation, 'coverage')).toBe(false);
  },
);

test('inspect-manual gives failed outcome precedence over stale source', async () => {
  const setup = fixture();
  writeFileSync(join(setup.root, 'source/module.ts'), 'export const lamp = false;\n');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'change touched module']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  setup.records.report.steps[0].outcome = 'failed';
  setup.records.report.outcome = 'failed';
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  const observation = JSON.parse(call.stdout) as Record<string, unknown>;
  expect(observation['state']).toBe('failed');
  expect(observation['currency']).toBe('stale');
  expect(observation['outcome']).toBe('failed');
});

test('inspect-manual derives failed aggregate ahead of skipped steps', async () => {
  const setup = fixture();
  const procedure = {
    ...setup.procedure,
    steps: [
      ...setup.procedure.steps,
      { stepId: 'step-two', instruction: 'Release control', expectedObservation: 'Lamp goes dark' },
    ],
  };
  writeFileSync(join(setup.root, 'manual/procedure.json'), JSON.stringify(procedure));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'add second reviewed step']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  setup.records.report.sourceRevision = revision;
  setup.records.environment.sourceRevision = revision;
  setup.records.report.procedureDigest = digest(procedure);
  setup.records.review.procedureDigest = digest(procedure);
  setup.records.report.steps = [
    { stepId: 'step-one', outcome: 'skipped', observation: 'Not run' },
    { stepId: 'step-two', outcome: 'failed', observation: 'Lamp stayed lit' },
  ];
  setup.records.report.outcome = 'failed';
  setup.records.report.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(1);
  const observation = JSON.parse(call.stdout) as Record<string, unknown>;
  expect(observation['state']).toBe('failed');
  expect(observation['outcome']).toBe('failed');
  expect(observation['currency']).toBe('current');
});

test('inspect-manual maps an overdue approved report to a named refusal verdict', async () => {
  const setup = fixture();
  setup.records.review.reviewedAt = '1999-12-31T10:00:00.000Z';
  setup.records.review.reviewBy = '2000-01-01';
  writeApprovedChain(setup);
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toBe('');
  const observation = JSON.parse(call.stdout) as Record<string, unknown>;
  expect(observation['state']).toBe('overdue');
  expect(observation['validation']).toBe('refused');
  expect(observation['outcome']).toBe('passed');
  expect(observation['currency']).toBe('current');
  expect(observation['finding']).toBe('EXAMPLE-001 review overdue on 2000-01-01');
  expect(observation['certifies']).toBe(false);
});

test.each([
  ['the last instant of the deadline date', '2026-10-09T23:59:59.999Z', 'current', 0],
  ['the first instant after the deadline date', '2026-10-10T00:00:00.000Z', 'overdue', 1],
] as const)('inspect-manual evaluated at %s (%s)', async (_case, now, state, exitCode) => {
  const setup = fixture();
  setup.records.review.reviewBy = '2026-10-09';
  writeApprovedChain(setup);
  const call = await inspect(setup, now);
  expect(call.exitCode, call.stderr).toBe(exitCode);
  const observation = JSON.parse(call.stdout) as Record<string, unknown>;
  expect(observation['state']).toBe(state);
});

test('inspect-manual refuses to run without an evaluation instant', () => {
  const setup = fixture();
  const call = Bun.spawnSync(
    [
      process.execPath,
      'run',
      cli,
      'inspect-manual',
      setup.root,
      setup.revision,
      setup.policyPath,
      setup.reportPath,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(call.exitCode).toBe(1);
  expect(call.stdout.toString()).toBe('');
  expect(call.stderr.toString()).toContain('inspect-manual requires --now <UTC instant>');
});

test('inspect-manual refuses a malformed evaluation instant', async () => {
  const call = await inspect(fixture(), '2026-02-30T00:00:00.000Z');
  expect(call.exitCode).toBe(1);
  expect(call.stdout).toBe('');
  expect(call.stderr).toContain(
    'inspect-manual --now is not a UTC instant: 2026-02-30T00:00:00.000Z',
  );
});

test.each([
  ['absent', undefined],
  ['malformed', '2026-10-11'],
] as const)(
  'readEvaluationInstant refuses the %s instant with its typed error',
  (failure, value) => {
    let refusal: unknown;
    try {
      readEvaluationInstant(value);
    } catch (cause) {
      refusal = cause;
    }
    expect(refusal).toBeInstanceOf(EvaluationInstantError);
    expect((refusal as EvaluationInstantError).failure).toBe(failure);
  },
);

test('inspect-manual gives overdue precedence over failed outcome and stale source', async () => {
  const setup = fixture();
  writeFileSync(join(setup.root, 'source/module.ts'), 'export const lamp = false;\n');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'change touched module']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  setup.records.report.steps[0].outcome = 'failed';
  setup.records.report.outcome = 'failed';
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  setup.records.review.reviewedAt = '1999-12-31T10:00:00.000Z';
  setup.records.review.reviewBy = '2000-01-01';
  writeApprovedChain(setup);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toBe('');
  const observation = JSON.parse(call.stdout) as Record<string, unknown>;
  expect(observation['state']).toBe('overdue');
  expect(observation['validation']).toBe('refused');
  expect(observation['outcome']).toBe('failed');
  expect(observation['currency']).toBe('stale');
  expect(observation['finding']).toBe('EXAMPLE-001 review overdue on 2000-01-01');
  expect(observation['certifies']).toBe(false);
});

test('inspect-manual refuses inconsistent report outcome without a JSON verdict', async () => {
  const setup = fixture();
  setup.records.report.steps[0].outcome = 'failed';
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stdout).toBe('');
  expect(call.stderr).toContain('Manual report step outcome is not a passing observation');
});

test('inspect-manual keeps an earlier tested commit distinct from an unrelated selected descendant', async () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'README.md'),
    indexSource('module-root', [
      { kind: 'directory-prefix', prefix: 'openspec', exclusions: [] },
      { kind: 'directory-prefix', prefix: 'manual', exclusions: [] },
      { kind: 'path', path: 'source/README.md' },
      { kind: 'path', path: 'unrelated.txt' },
    ]),
  );
  writeFileSync(join(setup.root, 'unrelated.txt'), 'unrelated change');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'unrelated descendant']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(0);
  const observation = JSON.parse(call.stdout) as Record<string, unknown>;
  expect(observation['revision']).toBe(revision);
  expect(observation['testedRevision']).toBe(setup.revision);
  expect(observation['currency']).toBe('current');
  expect(observation['certifies']).toBe(false);
});

test.each([
  [
    'requirement',
    'openspec/specs/example/spec.md',
    '## Requirements\n### Requirement: Example requirement\nChanged text.\n#### Scenario: [EXAMPLE-001] Example\n',
  ],
  [
    'procedure',
    'manual/procedure.json',
    JSON.stringify({
      schemaVersion: 1,
      scenarioId: 'EXAMPLE-001',
      title: 'Example',
      steps: [
        {
          stepId: 'step-one',
          instruction: 'Press the red control',
          expectedObservation: 'Lamp lights',
        },
      ],
    }),
  ],
  ['module content', 'source/module.ts', 'export const lamp = false;\n'],
])(
  'inspect-manual marks changed %s stale from the production command',
  async (_subject, path, source) => {
    const setup = fixture();
    writeFileSync(join(setup.root, path), source);
    git(setup.root, ['add', '.']);
    git(setup.root, ['commit', '-m', 'change reviewed source']);
    const revision = git(setup.root, ['rev-parse', 'HEAD']);
    const call = await inspect({ ...setup, revision });
    expect(call.exitCode, call.stderr).toBe(1);
    expect(readCurrency(call)).toBe('stale');
  },
);

test('inspect-manual marks a touched module membership addition stale', async () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'source/README.md'),
    indexSource('module-one', [
      { kind: 'path', path: 'module.ts' },
      { kind: 'path', path: 'added.ts' },
    ]),
  );
  writeFileSync(join(setup.root, 'source/added.ts'), 'export const added = true;\n');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'add module member']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(1);
  expect(readCurrency(call)).toBe('stale');
});

test('inspect-manual detects a module change followed by a byte-for-byte revert', async () => {
  const setup = fixture();
  writeFileSync(join(setup.root, 'source/module.ts'), 'export const lamp = false;\n');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'temporarily change lamp']);
  writeFileSync(join(setup.root, 'source/module.ts'), 'export const lamp = true;\n');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'restore lamp']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(1);
  expect(readCurrency(call)).toBe('stale');
});

test('inspect-manual refuses a tested commit outside selected ancestry', async () => {
  const setup = fixture();
  git(setup.root, ['checkout', '-b', 'other', setup.baseRevision]);
  writeFileSync(join(setup.root, 'other.txt'), 'different branch\n');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'unrelated tested branch']);
  const unrelated = git(setup.root, ['rev-parse', 'HEAD']);
  setup.records.report.sourceRevision = unrelated;
  setup.records.environment.sourceRevision = unrelated;
  setup.records.report.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual tested revision is not a candidate ancestor');
});

test('inspect-manual refuses incomplete shallow Git history', async () => {
  const setup = fixture();
  for (const number of [1, 2, 3]) {
    writeFileSync(
      join(setup.root, `unrelated-${String(number)}.txt`),
      `change ${String(number)}\n`,
    );
    git(setup.root, ['add', '.']);
    git(setup.root, ['commit', '-m', `unrelated ${String(number)}`]);
  }
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const clone = join(setup.base, 'shallow');
  git(setup.base, ['clone', '--depth=5', `file://${setup.root}`, clone]);
  const call = await inspect({ ...setup, root: clone, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual source history is incomplete');
});

test.each([
  ['omitted', (modules: { moduleId: string; digest: string }[]) => modules.slice(0, 0)],
  ['duplicate', (modules: { moduleId: string; digest: string }[]) => [...modules, modules[0]]],
  [
    'extra',
    (modules: { moduleId: string; digest: string }[]) => [
      ...modules,
      { moduleId: 'module-two', digest: 'a'.repeat(64) },
    ],
  ],
])('inspect-manual refuses %s reviewed module scope', async (_case, change) => {
  const setup = fixture();
  setup.records.report.reviewedScope.modules = change(setup.records.report.reviewedScope.modules);
  setup.records.review.reviewedScope = setup.records.report.reviewedScope;
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual reviewed module scope differs from touched modules');
});

test('inspect-manual refuses a reviewed requirement digest outside tested Git source', async () => {
  const setup = fixture();
  setup.records.report.reviewedScope.requirementDigest = 'a'.repeat(64);
  setup.records.review.reviewedScope = setup.records.report.reviewedScope;
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual reviewed source scope differs from tested revision');
});

test('inspect-manual refuses a reviewed module digest outside tested Git source', async () => {
  const setup = fixture();
  setup.records.report.reviewedScope.modules[0].digest = 'a'.repeat(64);
  setup.records.review.reviewedScope = setup.records.report.reviewedScope;
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual reviewed source scope differs from tested revision');
});

test('inspect-manual refuses a touched module ID absent from tested indexes', async () => {
  const setup = fixture();
  setup.disposition.touchedModules = ['module-unknown'];
  writeFileSync(join(setup.root, 'manual/disposition.json'), JSON.stringify(setup.disposition));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'declare unknown touched module']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  setup.manual.dispositions[0].digest = digest(setup.disposition);
  setup.records.report.dispositionDigest = digest(setup.disposition);
  setup.records.review.dispositionDigest = digest(setup.disposition);
  setup.records.report.reviewedScope.modules = [
    { moduleId: 'module-unknown', digest: 'a'.repeat(64) },
  ];
  setup.records.review.reviewedScope = setup.records.report.reviewedScope;
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual reviewed source scope differs from tested revision');
});

test('inspect-manual validates report steps against the tested procedure after candidate steps change', async () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({
      ...setup.procedure,
      steps: [
        ...setup.procedure.steps,
        {
          stepId: 'step-two',
          instruction: 'Release control',
          expectedObservation: 'Lamp goes dark',
        },
      ],
    }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'add later procedure step']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(1);
  expect(readCurrency(call)).toBe('stale');
  const observation = JSON.parse(call.stdout) as Record<string, unknown>;
  expect(observation['procedureDigest']).toBe(digest(setup.procedure));
  expect(observation['selectedProcedureDigest']).not.toBe(digest(setup.procedure));
});

test('inspect-manual refuses an empty tested procedure even after the candidate repairs it', async () => {
  const setup = fixture();
  const procedurePath = join(setup.root, 'manual/procedure.json');
  writeFileSync(procedurePath, JSON.stringify({ ...setup.procedure, steps: [] }));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'empty tested procedure']);
  const tested = git(setup.root, ['rev-parse', 'HEAD']);
  writeFileSync(procedurePath, JSON.stringify(setup.procedure));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'repair procedure']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  setup.records.report.sourceRevision = tested;
  setup.records.environment.sourceRevision = tested;
  setup.records.report.procedureDigest = digest({ ...setup.procedure, steps: [] });
  setup.records.review.procedureDigest = setup.records.report.procedureDigest;
  setup.records.report.steps = [];
  setup.records.report.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual tested procedure steps are invalid');
});

test('inspect-manual refuses a tested procedure title repaired only in the candidate', async () => {
  const setup = fixture();
  const path = join(setup.root, 'manual/procedure.json');
  const historical = { ...setup.procedure, title: 'Alternate' };
  writeFileSync(path, JSON.stringify(historical));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'wrong tested procedure title']);
  const tested = git(setup.root, ['rev-parse', 'HEAD']);
  writeFileSync(path, JSON.stringify(setup.procedure));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'repair candidate procedure title']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  setup.records.report.sourceRevision = tested;
  setup.records.environment.sourceRevision = tested;
  setup.records.report.procedureDigest = digest(historical);
  setup.records.review.procedureDigest = digest(historical);
  setup.records.report.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual tested procedure scenario differs from disposition');
});

test.each([
  [
    'unsupported version',
    (procedure: ReturnType<typeof fixture>['procedure']) => ({ ...procedure, schemaVersion: 99 }),
    'Manual historical procedure is malformed',
  ],
  [
    'empty steps',
    (procedure: ReturnType<typeof fixture>['procedure']) => ({ ...procedure, steps: [] }),
    'Manual historical procedure steps are invalid',
  ],
  [
    'duplicate steps',
    (procedure: ReturnType<typeof fixture>['procedure']) => ({
      ...procedure,
      steps: [...procedure.steps, procedure.steps[0]],
    }),
    'Manual historical procedure steps are invalid',
  ],
  [
    'blank instruction',
    (procedure: ReturnType<typeof fixture>['procedure']) => ({
      ...procedure,
      steps: [{ ...procedure.steps[0], instruction: ' ' }],
    }),
    'Manual historical procedure steps are invalid',
  ],
  [
    'wrong title',
    (procedure: ReturnType<typeof fixture>['procedure']) => ({ ...procedure, title: 'Alternate' }),
    'Manual historical procedure scenario differs from selected specification',
  ],
])('inspect-manual refuses %s in an intervening procedure', async (_subject, change, finding) => {
  const setup = fixture();
  const path = join(setup.root, 'manual/procedure.json');
  writeFileSync(path, JSON.stringify(change(setup.procedure)));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'malformed historical procedure']);
  writeFileSync(path, JSON.stringify(setup.procedure));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'restore valid procedure']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain(finding);
});

test('inspect-manual marks a valid historical scenario and procedure rename then revert stale', async () => {
  const setup = fixture();
  const specPath = join(setup.root, 'openspec/specs/example/spec.md');
  const journalPath = join(setup.root, 'openspec/scenario-allocations.json');
  const procedurePath = join(setup.root, 'manual/procedure.json');
  const dispositionPath = join(setup.root, 'manual/disposition.json');
  const originalSpec = readFileSync(specPath);
  const originalJournal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    schemaVersion: number;
    events: unknown[];
  };
  const renamed = {
    kind: 'rename',
    id: 'EXAMPLE-001',
    priorTitle: 'Example',
    title: 'Alternate',
    priorRevision: setup.revision,
  };
  writeFileSync(
    specPath,
    '## Requirements\n### Requirement: Example requirement\n#### Scenario: [EXAMPLE-001] Alternate\n',
  );
  writeFileSync(
    journalPath,
    JSON.stringify({ ...originalJournal, events: [...originalJournal.events, renamed] }),
  );
  writeFileSync(procedurePath, JSON.stringify({ ...setup.procedure, title: 'Alternate' }));
  writeFileSync(dispositionPath, JSON.stringify({ ...setup.disposition, title: 'Alternate' }));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'rename historical scenario and procedure']);
  const renamedRevision = git(setup.root, ['rev-parse', 'HEAD']);
  writeFileSync(specPath, originalSpec);
  writeFileSync(
    journalPath,
    JSON.stringify({
      ...originalJournal,
      events: [
        ...originalJournal.events,
        renamed,
        {
          kind: 'rename',
          id: 'EXAMPLE-001',
          priorTitle: 'Alternate',
          title: 'Example',
          priorRevision: renamedRevision,
        },
      ],
    }),
  );
  writeFileSync(procedurePath, JSON.stringify(setup.procedure));
  writeFileSync(dispositionPath, JSON.stringify(setup.disposition));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'restore scenario and procedure title']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(1);
  expect(readCurrency(call)).toBe('stale');
  expect((JSON.parse(call.stdout) as { certifies: unknown }).certifies).toBe(false);
});

test('inspect-manual ignores Git replacement objects for module indexes', async () => {
  const setup = fixture();
  const replacement = join(setup.base, 'replacement.md');
  writeFileSync(replacement, '# forged index\n');
  const oldBlob = git(setup.root, ['rev-parse', `${setup.revision}:source/README.md`]);
  const newBlob = git(setup.root, ['hash-object', '-w', replacement]);
  git(setup.root, ['replace', oldBlob, newBlob]);
  const call = await inspect(setup);
  expect(call.exitCode, call.stderr).toBe(0);
  expect(readCurrency(call)).toBe('current');
});

test('inspect-manual marks an edited module index stale', async () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'source/README.md'),
    `${indexSource('module-one', [
      { kind: 'path', path: 'module.ts' },
    ])}\nReviewed explanation changed.\n`,
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'edit module index']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(1);
  expect(readCurrency(call)).toBe('stale');
});

test('inspect-manual marks a sibling scenario edit in the containing requirement stale', async () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'openspec/specs/example/spec.md'),
    '## Requirements\n### Requirement: Example requirement\n#### Scenario: [EXAMPLE-001] Example\n#### Scenario: A new sibling\n',
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'add sibling scenario']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(1);
  expect(readCurrency(call)).toBe('stale');
});

test('inspect-manual accepts a tested revision earlier than the current B3 base', async () => {
  const setup = fixture();
  git(setup.root, ['commit', '--allow-empty', '-m', 'new candidate policy base']);
  const baseRevision = git(setup.root, ['rev-parse', 'HEAD']);
  git(setup.root, ['commit', '--allow-empty', '-m', 'later selected commit']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  writeFileSync(setup.policyPath, JSON.stringify({ ...setup.policy, scenarios: { baseRevision } }));
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(0);
  expect(readCurrency(call)).toBe('current');
});

test.each([
  [
    'requirement',
    'openspec/specs/example/spec.md',
    '## Requirements\n### Requirement: Example requirement\nTemporary text.\n#### Scenario: [EXAMPLE-001] Example\n',
  ],
  [
    'procedure',
    'manual/procedure.json',
    JSON.stringify({
      schemaVersion: 1,
      scenarioId: 'EXAMPLE-001',
      title: 'Example',
      steps: [
        {
          stepId: 'step-one',
          instruction: 'Temporarily use the red control',
          expectedObservation: 'Lamp lights',
        },
      ],
    }),
  ],
  [
    'module membership',
    'source/README.md',
    indexSource('module-one', [{ kind: 'directory-prefix', prefix: 'module.ts', exclusions: [] }]),
  ],
])('inspect-manual detects %s change then revert', async (_subject, path, changed) => {
  const setup = fixture();
  const original = readFileSync(join(setup.root, path));
  writeFileSync(join(setup.root, path), changed);
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'temporary reviewed input change']);
  writeFileSync(join(setup.root, path), original);
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'restore reviewed input']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(1);
  expect(readCurrency(call)).toBe('stale');
});

test('inspect-manual marks an executable-mode change to a module member stale', async () => {
  const setup = fixture();
  git(setup.root, ['update-index', '--chmod=+x', 'source/module.ts']);
  git(setup.root, ['commit', '-m', 'change member mode']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(1);
  expect(readCurrency(call)).toBe('stale');
});

test.each(['remove', 'rename'])(
  'inspect-manual marks a module member %s stale',
  async (operation) => {
    const setup = fixture();
    if (operation === 'rename') git(setup.root, ['mv', 'source/module.ts', 'source/renamed.ts']);
    else rmSync(join(setup.root, 'source/module.ts'));
    writeFileSync(
      join(setup.root, 'source/README.md'),
      indexSource(
        'module-one',
        operation === 'rename' ? [{ kind: 'path', path: 'renamed.ts' }] : [],
      ),
    );
    git(setup.root, ['add', '.']);
    git(setup.root, ['commit', '-m', `${operation} module member`]);
    const revision = git(setup.root, ['rev-parse', 'HEAD']);
    const call = await inspect({ ...setup, revision });
    expect(call.exitCode, call.stderr).toBe(1);
    expect(readCurrency(call)).toBe('stale');
  },
);

test('inspect-manual marks nested index ownership transfer stale', async () => {
  const setup = fixture();
  mkdirSync(join(setup.root, 'source/child'));
  git(setup.root, ['mv', 'source/module.ts', 'source/child/module.ts']);
  writeFileSync(
    join(setup.root, 'source/README.md'),
    indexSource('module-one', [{ kind: 'path', path: 'child/README.md' }]),
  );
  writeFileSync(
    join(setup.root, 'source/child/README.md'),
    indexSource('module-child', [{ kind: 'path', path: 'module.ts' }]),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'transfer member to child index']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(1);
  expect(readCurrency(call)).toBe('stale');
});

test('inspect-manual refuses a grafted history', async () => {
  const setup = fixture();
  writeFileSync(join(setup.root, '.git/info/grafts'), `${setup.revision} ${setup.baseRevision}\n`);
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual source history is incomplete: grafts present');
});

test.each([
  ['unrelated', false, 'current'],
  ['touched module change then revert', true, 'stale'],
])(
  'inspect-manual handles a pretested side branch with %s',
  async (_subject, changesModule, currency) => {
    const setup = fixture();
    const originalBranch = git(setup.root, ['branch', '--show-current']);
    git(setup.root, ['checkout', '-b', 'side', setup.baseRevision]);
    if (changesModule) {
      writeFileSync(join(setup.root, 'source/module.ts'), 'export const lamp = false;\n');
      git(setup.root, ['add', '.']);
      git(setup.root, ['commit', '-m', 'side branch changes module']);
      writeFileSync(join(setup.root, 'source/module.ts'), 'export const lamp = true;\n');
      git(setup.root, ['add', '.']);
      git(setup.root, ['commit', '-m', 'side branch restores module']);
    } else {
      writeFileSync(join(setup.root, 'side.txt'), 'unrelated branch change\n');
      git(setup.root, ['add', '.']);
      git(setup.root, ['commit', '-m', 'side branch unrelated']);
    }
    git(setup.root, ['checkout', originalBranch]);
    if (!changesModule) {
      writeFileSync(join(setup.root, 'side.txt'), 'unrelated branch change\n');
      writeFileSync(
        join(setup.root, 'README.md'),
        indexSource('module-root', [
          { kind: 'directory-prefix', prefix: 'openspec', exclusions: [] },
          { kind: 'directory-prefix', prefix: 'manual', exclusions: [] },
          { kind: 'path', path: 'source/README.md' },
          { kind: 'path', path: 'side.txt' },
        ]),
      );
      git(setup.root, ['add', '.']);
      git(setup.root, ['commit', '-m', 'index unrelated side file']);
    }
    git(setup.root, ['merge', '--no-ff', '-m', 'merge side branch', 'side']);
    const revision = git(setup.root, ['rev-parse', 'HEAD']);
    const call = await inspect({ ...setup, revision });
    expect(call.exitCode, call.stderr).toBe(currency === 'stale' ? 1 : 0);
    expect(readCurrency(call)).toBe(currency);
  },
);

test.each(['commit', 'tree', 'blob'])(
  'inspect-manual refuses a missing intermediate %s object',
  async (kind) => {
    const setup = fixture();
    writeFileSync(join(setup.root, 'source/module.ts'), 'export const lamp = false;\n');
    git(setup.root, ['add', '.']);
    git(setup.root, ['commit', '-m', 'intermediate source change']);
    const middle = git(setup.root, ['rev-parse', 'HEAD']);
    writeFileSync(join(setup.root, 'source/module.ts'), 'export const lamp = true;\n');
    git(setup.root, ['add', '.']);
    git(setup.root, ['commit', '-m', 'restore source']);
    const revision = git(setup.root, ['rev-parse', 'HEAD']);
    const objectId =
      kind === 'commit'
        ? middle
        : kind === 'tree'
          ? git(setup.root, ['rev-parse', `${middle}^{tree}`])
          : git(setup.root, ['rev-parse', `${middle}:source/module.ts`]);
    rmSync(join(setup.root, '.git/objects', objectId.slice(0, 2), objectId.slice(2)));
    const call = await inspect({ ...setup, revision });
    expect(call.exitCode).toBe(1);
    if (kind === 'commit') {
      expect(stripVTControlCharacters(call.stderr)).toMatch(
        /^(?:specifications base is not a candidate ancestor|cannot verify specifications ancestry: .+)$/m,
      );
    } else {
      expect(call.stderr).toMatch(
        /cannot verify Manual source (history|objects)|specifications base is not a candidate ancestor|absent .*revision|cannot read selected|cannot read selected blob|cannot resolve/,
      );
    }
  },
);

test('inspect-manual refuses malformed index metadata in an intervening commit', async () => {
  const setup = fixture();
  writeFileSync(join(setup.root, 'source/README.md'), '# Broken\n<!-- module-index {broken} -->\n');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'malformed historical index']);
  writeFileSync(
    join(setup.root, 'source/README.md'),
    indexSource('module-one', [{ kind: 'path', path: 'module.ts' }]),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'restore index']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('index metadata malformed');
});

test('inspect-manual refuses a nonregular historical canonical spec', async () => {
  const setup = fixture();
  const path = join(setup.root, 'openspec/specs/example/spec.md');
  const original = readFileSync(path);
  rmSync(path);
  symlinkSync('missing-spec.md', path);
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'historical symlink spec']);
  rmSync(path);
  writeFileSync(path, original);
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'restore regular spec']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual historical specification is not a regular blob');
});

test('inspect-manual refuses duplicate containing historical scenarios', async () => {
  const setup = fixture();
  const path = join(setup.root, 'openspec/specs/example/spec.md');
  const original = readFileSync(path);
  writeFileSync(
    path,
    '## Requirements\n### Requirement: Example requirement\n#### Scenario: [EXAMPLE-001] Example\n### Requirement: Other requirement\n#### Scenario: [EXAMPLE-001] Example\n',
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'duplicate historical scenario']);
  writeFileSync(path, original);
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'restore unique scenario']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual historical scenario is ambiguous or absent');
});

test('inspect-manual refuses a historical journal title conflicting with its spec', async () => {
  const setup = fixture();
  const path = join(setup.root, 'openspec/scenario-allocations.json');
  const original = readFileSync(path);
  writeFileSync(
    path,
    JSON.stringify({
      schemaVersion: 1,
      events: [
        {
          kind: 'import',
          id: 'EXAMPLE-001',
          source: 'openspec/specs/example/spec.md',
          title: 'Example',
        },
        {
          kind: 'rename',
          id: 'EXAMPLE-001',
          priorTitle: 'Example',
          title: 'Alternate',
          priorRevision: setup.revision,
        },
      ],
    }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'historical journal title drift']);
  writeFileSync(path, original);
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'restore journal title']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain(
    'Manual historical scenario journal differs from selected specification',
  );
});

test('inspect-manual sees a relevant second-parent edge of a pretested side merge', async () => {
  const setup = fixture(false);
  const branch = git(setup.root, ['branch', '--show-current']);
  const earlier = git(setup.root, ['rev-parse', `${setup.baseRevision}^`]);
  git(setup.root, ['checkout', '-b', 'side', earlier]);
  git(setup.root, ['commit', '--allow-empty', '-m', 'older side branch']);
  git(setup.root, [
    'merge',
    '--no-ff',
    '-s',
    'ours',
    '-m',
    'merge older base into side',
    setup.baseRevision,
  ]);
  git(setup.root, ['checkout', branch]);
  git(setup.root, ['merge', '--no-ff', '-s', 'ours', '-m', 'merge side into selected', 'side']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(1);
  expect(readCurrency(call)).toBe('stale');
});

test('inspect-manual refuses a missing older blob on an excluded side-merge parent', async () => {
  const setup = fixture(false);
  const branch = git(setup.root, ['branch', '--show-current']);
  const earlier = git(setup.root, ['rev-parse', `${setup.baseRevision}^`]);
  git(setup.root, ['checkout', '-b', 'side', earlier]);
  git(setup.root, ['commit', '--allow-empty', '-m', 'older side branch']);
  git(setup.root, [
    'merge',
    '--no-ff',
    '-s',
    'ours',
    '-m',
    'merge older base into side',
    setup.baseRevision,
  ]);
  git(setup.root, ['checkout', branch]);
  git(setup.root, ['merge', '--no-ff', '-s', 'ours', '-m', 'merge side into selected', 'side']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const olderBlob = git(setup.root, ['rev-parse', `${setup.baseRevision}:source/module.ts`]);
  rmSync(join(setup.root, '.git/objects', olderBlob.slice(0, 2), olderBlob.slice(2)));
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('cannot verify Manual side-branch parent objects');
});

test('inspect-manual detects a pretested side edit under a BOM-prefixed module path', async () => {
  const setup = fixture();
  const moduleDirectory = '\uFEFFsource';
  git(setup.root, ['mv', 'source', moduleDirectory]);
  writeFileSync(
    join(setup.root, 'README.md'),
    indexSource('module-root', [
      { kind: 'directory-prefix', prefix: 'openspec', exclusions: [] },
      { kind: 'directory-prefix', prefix: 'manual', exclusions: [] },
      { kind: 'path', path: `${moduleDirectory}/README.md` },
    ]),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'move module to BOM path']);
  const fork = git(setup.root, ['rev-parse', 'HEAD']);
  git(setup.root, ['commit', '--allow-empty', '-m', 'tested after BOM move']);
  const tested = git(setup.root, ['rev-parse', 'HEAD']);
  const branch = git(setup.root, ['branch', '--show-current']);
  git(setup.root, ['checkout', '-b', 'side', fork]);
  writeFileSync(join(setup.root, moduleDirectory, 'module.ts'), 'export const lamp = false;\n');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'change BOM module']);
  writeFileSync(join(setup.root, moduleDirectory, 'module.ts'), 'export const lamp = true;\n');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'restore BOM module']);
  git(setup.root, ['checkout', branch]);
  git(setup.root, ['merge', '--no-ff', '-m', 'merge BOM side branch', 'side']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  setup.records.report.sourceRevision = tested;
  setup.records.environment.sourceRevision = tested;
  setup.records.report.reviewedScope = reviewedScope(setup.root, tested, moduleDirectory);
  setup.records.review.reviewedScope = setup.records.report.reviewedScope;
  setup.records.report.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(1);
  expect(readCurrency(call)).toBe('stale');
});

test('inspect-manual refuses a retired scenario in an intervening journal', async () => {
  const setup = fixture();
  const path = join(setup.root, 'openspec/scenario-allocations.json');
  const original = readFileSync(path);
  writeFileSync(
    path,
    JSON.stringify({
      schemaVersion: 1,
      events: [
        {
          kind: 'import',
          id: 'EXAMPLE-001',
          source: 'openspec/specs/example/spec.md',
          title: 'Example',
        },
        { kind: 'retire', id: 'EXAMPLE-001' },
      ],
    }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'temporary retirement']);
  writeFileSync(path, original);
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'restore journal']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual historical scenario is not active');
});

test('inspect-manual refuses a historical scenario title outside the reviewed report', async () => {
  const setup = fixture();
  const specPath = join(setup.root, 'openspec/specs/example/spec.md');
  const journalPath = join(setup.root, 'openspec/scenario-allocations.json');
  const originalSpec = readFileSync(specPath);
  const importEvent = {
    kind: 'import',
    id: 'EXAMPLE-001',
    source: 'openspec/specs/example/spec.md',
    title: 'Example',
  };
  const renamed = {
    kind: 'rename',
    id: 'EXAMPLE-001',
    priorTitle: 'Example',
    title: 'Alternate',
    priorRevision: setup.revision,
  };
  writeFileSync(
    specPath,
    '## Requirements\n### Requirement: Example requirement\n#### Scenario: [EXAMPLE-001] Alternate\n',
  );
  writeFileSync(journalPath, JSON.stringify({ schemaVersion: 1, events: [importEvent, renamed] }));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'historical alternate title']);
  const tested = git(setup.root, ['rev-parse', 'HEAD']);
  writeFileSync(specPath, originalSpec);
  writeFileSync(
    journalPath,
    JSON.stringify({
      schemaVersion: 1,
      events: [
        importEvent,
        renamed,
        {
          kind: 'rename',
          id: 'EXAMPLE-001',
          priorTitle: 'Alternate',
          title: 'Example',
          priorRevision: tested,
        },
      ],
    }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'restore current title']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  setup.records.report.sourceRevision = tested;
  setup.records.environment.sourceRevision = tested;
  setup.records.report.reviewedScope.requirementDigest = hashBytes(
    Buffer.from('### Requirement: Example requirement\n#### Scenario: [EXAMPLE-001] Alternate\n'),
  );
  setup.records.review.reviewedScope = setup.records.report.reviewedScope;
  setup.records.report.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual historical scenario title differs from reviewed report');
});

test('inspect-manual refuses a missing blob from a reverted side branch', async () => {
  const setup = fixture();
  const branch = git(setup.root, ['branch', '--show-current']);
  git(setup.root, ['checkout', '-b', 'side', setup.baseRevision]);
  writeFileSync(join(setup.root, 'ephemeral.txt'), 'side-only bytes\n');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'add side-only blob']);
  const blob = git(setup.root, ['rev-parse', 'HEAD:ephemeral.txt']);
  rmSync(join(setup.root, 'ephemeral.txt'));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'remove side-only blob']);
  git(setup.root, ['checkout', branch]);
  git(setup.root, ['merge', '--no-ff', '-m', 'merge reverted side branch', 'side']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  rmSync(join(setup.root, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('cannot verify Manual source objects');
});

test('inspect-manual refuses truncated Git path output on a side branch', () => {
  const setup = fixture();
  const branch = git(setup.root, ['branch', '--show-current']);
  git(setup.root, ['checkout', '-b', 'side', setup.baseRevision]);
  git(setup.root, ['commit', '--allow-empty', '-m', 'side commit']);
  git(setup.root, ['checkout', branch]);
  git(setup.root, ['merge', '--no-ff', '-m', 'merge side commit', 'side']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const tools = join(setup.base, 'tools');
  mkdirSync(tools);
  const wrapper = join(tools, 'git');
  writeFileSync(
    wrapper,
    '#!/bin/sh\nif [ "$3" = "diff-tree" ]; then printf "source/module.ts"; exit 0; fi\nexec /usr/bin/git "$@"\n',
  );
  chmodSync(wrapper, 0o755);
  const inheritedPath = process.env['PATH'];
  if (inheritedPath === undefined) throw new Error('test PATH is absent');
  const call = spawnInspect(
    { ...setup, revision },
    { ...process.env, PATH: `${tools}:${inheritedPath}` },
  );
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('malformed Manual side-branch changes paths');
});

test('inspect-manual refuses malformed Git parent output on a side branch', () => {
  const setup = fixture();
  const branch = git(setup.root, ['branch', '--show-current']);
  git(setup.root, ['checkout', '-b', 'side', setup.baseRevision]);
  git(setup.root, ['commit', '--allow-empty', '-m', 'side commit']);
  git(setup.root, ['checkout', branch]);
  git(setup.root, ['merge', '--no-ff', '-m', 'merge side commit', 'side']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const tools = join(setup.base, 'tools');
  mkdirSync(tools);
  const wrapper = join(tools, 'git');
  writeFileSync(
    wrapper,
    '#!/bin/sh\nif [ "$3" = "rev-list" ] && [ "$4" = "--parents" ]; then printf "invalid-parent\\n"; exit 0; fi\nexec /usr/bin/git "$@"\n',
  );
  chmodSync(wrapper, 0o755);
  const inheritedPath = process.env['PATH'];
  if (inheritedPath === undefined) throw new Error('test PATH is absent');
  const call = spawnInspect(
    { ...setup, revision },
    { ...process.env, PATH: `${tools}:${inheritedPath}` },
  );
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('malformed Manual side-branch parent list');
});

test('inspect-manual marks a changed effective overlay requirement stale', async () => {
  const setup = fixture();
  const path = join(setup.root, 'openspec/changes/overlay/specs/example/spec.md');
  mkdirSync(join(setup.root, 'openspec/changes/overlay/specs/example'), { recursive: true });
  writeFileSync(
    path,
    '## MODIFIED Requirements\n### Requirement: Example requirement\nOverlay edit.\n#### Scenario: [EXAMPLE-001] Example\n',
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'overlay requirement edit']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(1);
  expect(readCurrency(call)).toBe('stale');
});

test('inspect-manual keeps identical effective overlay and archive movement current', async () => {
  const setup = fixture();
  const directory = join(setup.root, 'openspec/changes/overlay/specs/example');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, 'spec.md'),
    '## MODIFIED Requirements\n### Requirement: Example requirement\n#### Scenario: [EXAMPLE-001] Example\n',
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'identical overlay']);
  mkdirSync(join(setup.root, 'openspec/changes/archive/overlay/specs/example'), {
    recursive: true,
  });
  git(setup.root, [
    'mv',
    'openspec/changes/overlay/specs/example/spec.md',
    'openspec/changes/archive/overlay/specs/example/spec.md',
  ]);
  git(setup.root, ['commit', '-m', 'archive identical overlay']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = await inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr).toBe(0);
  expect(readCurrency(call)).toBe('current');
});

test('inspect-manual refuses a pinned tested SHA that is not a commit object', async () => {
  const setup = fixture();
  setup.records.report.sourceRevision = 'a'.repeat(40);
  setup.records.environment.sourceRevision = setup.records.report.sourceRevision;
  setup.records.report.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('absent tested revision');
});

test('inspect-manual refuses an annotated tag object SHA as the tested revision', async () => {
  const setup = fixture();
  git(setup.root, ['tag', '-a', 'tested-tag', '-m', 'annotated tested tag']);
  const tagObject = git(setup.root, ['rev-parse', 'refs/tags/tested-tag']);
  setup.records.report.sourceRevision = tagObject;
  setup.records.environment.sourceRevision = tagObject;
  setup.records.report.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual tested revision is not an exact commit');
});

function writeApprovedChain(setup: ReturnType<typeof fixture>): void {
  for (const [name, record] of Object.entries(setup.records))
    writeFileSync(join(setup.base, `${name}.json`), JSON.stringify(record));
  const manual = {
    ...setup.manual,
    reports: [{ path: setup.reportPath, digest: digest(setup.records.report) }],
    environments: [
      { path: join(setup.base, 'environment.json'), digest: digest(setup.records.environment) },
    ],
    approvals: [
      { path: join(setup.base, 'review.json'), digest: digest(setup.records.review) },
      { path: join(setup.base, 'acceptance.json'), digest: digest(setup.records.acceptance) },
    ],
  };
  writeFileSync(setup.policyPath, JSON.stringify({ ...setup.policy, manual }));
}

test.each([
  [
    'report scenario',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.scenarioId = 'EXAMPLE-002';
    },
    'Manual report scenario',
  ],
  [
    'report disposition digest',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.dispositionDigest = 'c'.repeat(64);
    },
    'Manual report disposition digest',
  ],
  [
    'report procedure digest',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.procedureDigest = 'c'.repeat(64);
    },
    'Manual report procedure digest',
  ],
  [
    'blank run ID',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.runId = ' ';
      s.records.acceptance.runId = ' ';
    },
    'Manual report run ID',
  ],
  [
    'blank operator',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.operator = ' ';
      s.records.acceptance.operator = ' ';
    },
    'Manual report operator',
  ],
  [
    'review disposition digest',
    (s: ReturnType<typeof fixture>) => {
      s.records.review.dispositionDigest = 'c'.repeat(64);
    },
    'Manual review disposition digest',
  ],
  [
    'review procedure digest',
    (s: ReturnType<typeof fixture>) => {
      s.records.review.procedureDigest = 'c'.repeat(64);
    },
    'Manual review procedure digest',
  ],
  [
    'review scope',
    (s: ReturnType<typeof fixture>) => {
      s.records.review.reviewedScope = {
        ...s.records.report.reviewedScope,
        requirementDigest: 'c'.repeat(64),
      };
    },
    'Manual review scope',
  ],
  [
    'review scenario',
    (s: ReturnType<typeof fixture>) => {
      s.records.review.scenarioId = 'EXAMPLE-002';
    },
    'Manual review scenario',
  ],
  [
    'review identity',
    (s: ReturnType<typeof fixture>) => {
      s.records.review.reviewer = s.records.report.operator;
    },
    'Manual review identity',
  ],
  [
    'acceptance identity',
    (s: ReturnType<typeof fixture>) => {
      s.records.acceptance.reviewer = s.records.report.operator;
    },
    'Manual acceptance identity',
  ],
  [
    'acceptance report digest',
    (s: ReturnType<typeof fixture>) => {
      s.records.acceptance.reportDigest = 'c'.repeat(64);
    },
    'Manual acceptance report digest',
  ],
  [
    'acceptance environment digest',
    (s: ReturnType<typeof fixture>) => {
      s.records.acceptance.environmentDigest = 'c'.repeat(64);
    },
    'Manual acceptance environment digest',
  ],
  [
    'acceptance run',
    (s: ReturnType<typeof fixture>) => {
      s.records.acceptance.runId = 'other-run';
    },
    'Manual acceptance run',
  ],
  [
    'acceptance operator',
    (s: ReturnType<typeof fixture>) => {
      s.records.acceptance.operator = 'other-operator';
    },
    'Manual acceptance operator',
  ],
  [
    'acceptance times',
    (s: ReturnType<typeof fixture>) => {
      s.records.acceptance.startedAt = '2026-10-08T10:01:01.000Z';
    },
    'Manual acceptance times',
  ],
  [
    'environment digest',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.environmentDigest = 'c'.repeat(64);
    },
    'Manual report environment digest',
  ],
  [
    'environment revision',
    (s: ReturnType<typeof fixture>) => {
      s.records.environment.sourceRevision = 'a'.repeat(40);
    },
    'Manual environment source revision',
  ],
  [
    'environment attributes',
    (s: ReturnType<typeof fixture>) => {
      s.records.environment.attributes = { host: '' };
    },
    'Manual environment attributes',
  ],
  [
    'wrong tested revision',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.sourceRevision = 'a'.repeat(40);
    },
    'Manual environment source revision',
  ],
  [
    'malformed timestamp',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.startedAt = '2026-02-30T10:01:00.000Z';
    },
    'Manual report startedAt',
  ],
  [
    'future timestamp',
    (s: ReturnType<typeof fixture>) => {
      s.records.environment.observedAt = '2999-01-01T00:00:00.000Z';
    },
    'Manual environment observedAt',
  ],
  [
    'future review',
    (s: ReturnType<typeof fixture>) => {
      s.records.review.reviewedAt = '2999-01-01T00:00:00.000Z';
    },
    'Manual review reviewedAt',
  ],
  [
    'future acceptance',
    (s: ReturnType<typeof fixture>) => {
      s.records.acceptance.acceptedAt = '2999-01-01T00:00:00.000Z';
    },
    'Manual acceptance acceptedAt',
  ],
  [
    'malformed deadline',
    (s: ReturnType<typeof fixture>) => {
      s.records.review.reviewBy = '2026-02-30';
    },
    'Manual review deadline is not a valid UTC date',
  ],
  [
    'deadline before review',
    (s: ReturnType<typeof fixture>) => {
      s.records.review.reviewBy = '2026-10-06';
    },
    'Manual review deadline predates review',
  ],
  [
    'run order',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.startedAt = '2026-10-08T10:04:00.000Z';
    },
    'Manual run chronology',
  ],
  [
    'acceptance order',
    (s: ReturnType<typeof fixture>) => {
      s.records.acceptance.acceptedAt = '2026-10-08T10:00:00.000Z';
    },
    'Manual acceptance chronology',
  ],
  [
    'missing step',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.steps = [];
    },
    'Manual report steps',
  ],
  [
    'duplicate step',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.steps.push(s.records.report.steps[0]);
    },
    'Manual report steps',
  ],
  [
    'extra step',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.steps.push({ stepId: 'extra', outcome: 'passed', observation: 'Extra' });
    },
    'Manual report steps',
  ],
  [
    'failed step',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.steps[0].outcome = 'failed';
    },
    'Manual report step outcome',
  ],
  [
    'skipped step',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.steps[0].outcome = 'skipped';
    },
    'Manual report step outcome',
  ],
  [
    'blank observation',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.steps[0].observation = ' ';
    },
    'Manual report step observation is blank',
  ],
  [
    'failed aggregate',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.outcome = 'failed';
    },
    'Manual report outcome',
  ],
] as const)('inspect-manual refuses %s with approved bytes', async (name, change, finding) => {
  const setup = fixture();
  change(setup);
  if (name !== 'environment digest')
    setup.records.report.environmentDigest = digest(setup.records.environment);
  if (name !== 'acceptance environment digest')
    setup.records.acceptance.environmentDigest = digest(setup.records.environment);
  if (name !== 'acceptance report digest')
    setup.records.acceptance.reportDigest = digest(setup.records.report);
  if (name !== 'acceptance times') {
    setup.records.acceptance.startedAt = setup.records.report.startedAt;
    setup.records.acceptance.completedAt = setup.records.report.completedAt;
  }
  writeApprovedChain(setup);
  const call = await inspect(setup);
  expect(call.exitCode, call.stdout).toBe(1);
  expect(call.stderr).toContain(finding);
});

test('inspect-manual refuses absent and unreadable external report separately', async () => {
  const setup = fixture();
  const absent = { ...setup, reportPath: join(setup.base, 'absent.json') };
  const missing = await inspect(absent);
  expect(missing.exitCode).toBe(1);
  expect(missing.stderr).toContain('cannot inspect manual report');
  expect(missing.stderr).toContain('ENOENT');
  const directory = join(setup.base, 'directory-report');
  mkdirSync(directory);
  const unreadable = await inspect({ ...setup, reportPath: directory });
  expect(unreadable.exitCode).toBe(1);
  expect(unreadable.stderr).toContain('manual report');
});

test('inspect-manual refuses an absent externally approved acceptance record', async () => {
  const setup = fixture();
  rmSync(join(setup.base, 'acceptance.json'));
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('cannot inspect manual acceptance approval');
  expect(call.stderr).toContain('ENOENT');
});

test('inspect-manual refuses malformed external UTF-8 and JSON', async () => {
  const setup = fixture();
  writeFileSync(setup.reportPath, Buffer.from([0xff]));
  expect((await inspect(setup)).stderr).toContain('not UTF-8');
  writeFileSync(setup.reportPath, '{');
  expect((await inspect(setup)).stderr).toContain('malformed manual report JSON');
});

test('inspect-manual refuses unknown schema version and fields', async () => {
  const setup = fixture();
  writeFileSync(setup.reportPath, JSON.stringify({ ...setup.records.report, schemaVersion: 99 }));
  expect((await inspect(setup)).stderr).toContain('schemaVersion');
  writeFileSync(setup.reportPath, JSON.stringify({ ...setup.records.report, unknown: true }));
  expect((await inspect(setup)).stderr).toContain('unknown');
});

test('inspect-manual refuses duplicate policy pins and duplicate procedure steps', async () => {
  const setup = fixture();
  writeFileSync(
    setup.policyPath,
    JSON.stringify({
      ...setup.policy,
      manual: { ...setup.manual, reports: [setup.manual.reports[0], setup.manual.reports[0]] },
    }),
  );
  expect((await inspect(setup)).stderr).toContain('duplicate Manual report pin');
  writeFileSync(setup.policyPath, JSON.stringify(setup.policy));
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({
      ...setup.procedure,
      steps: [setup.procedure.steps[0], setup.procedure.steps[0]],
    }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'duplicate step']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  expect((await inspect({ ...setup, revision })).stderr).toContain('duplicate Manual step ID');
});

test('inspect-manual refuses external symlinks and candidate path escape', async () => {
  const setup = fixture();
  const link = join(setup.base, 'linked-report.json');
  symlinkSync(setup.reportPath, link);
  expect((await inspect({ ...setup, reportPath: link })).stderr).toContain('symlink');
  const escaped = { ...setup.records.report, dispositionPath: '../outside.json' };
  writeFileSync(setup.reportPath, JSON.stringify(escaped));
  expect((await inspect(setup)).stderr).toContain('dispositionPath');
});

test('inspect-manual refuses absent committed disposition and procedure blobs', async () => {
  const setup = fixture();
  rmSync(join(setup.root, 'manual/disposition.json'));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'remove disposition']);
  const absentDisposition = await inspect({
    ...setup,
    revision: git(setup.root, ['rev-parse', 'HEAD']),
  });
  expect(absentDisposition.stderr).toContain('manual disposition is absent');
  writeFileSync(join(setup.root, 'manual/disposition.json'), JSON.stringify(setup.disposition));
  rmSync(join(setup.root, 'manual/procedure.json'));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'remove procedure']);
  const absentProcedure = await inspect({
    ...setup,
    revision: git(setup.root, ['rev-parse', 'HEAD']),
  });
  expect(absentProcedure.stderr).toContain('manual procedure is absent');
});

test('inspect-manual refuses malformed committed procedure bytes and symlink mode', async () => {
  const setup = fixture();
  writeFileSync(join(setup.root, 'manual/procedure.json'), Buffer.from([0xff]));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'invalid utf8']);
  expect(
    (await inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) })).stderr,
  ).toContain('manual procedure is not UTF-8');
  rmSync(join(setup.root, 'manual/procedure.json'));
  symlinkSync('disposition.json', join(setup.root, 'manual/procedure.json'));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'symlink procedure']);
  expect(
    (await inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) })).stderr,
  ).toContain('manual procedure is absent or not a regular committed blob');
});

test('inspect-manual refuses malformed and unknown fields in every external record', async () => {
  for (const name of ['environment', 'review', 'acceptance'] as const) {
    const setup = fixture();
    const path = join(setup.base, `${name}.json`);
    writeFileSync(path, '{');
    expect((await inspect(setup)).stderr).toContain(
      `malformed manual ${name === 'review' ? 'review approval' : name === 'acceptance' ? 'acceptance approval' : name} JSON`,
    );
    writeFileSync(path, JSON.stringify({ ...setup.records[name], extra: true }));
    expect((await inspect(setup)).stderr).toContain('extra');
  }
}, 12_000);

test('inspect-manual refuses a policy inside candidate and a noncommitted revision', async () => {
  const setup = fixture();
  const inside = join(setup.root, 'policy.json');
  writeFileSync(inside, JSON.stringify(setup.policy));
  expect((await inspect({ ...setup, policyPath: inside })).stderr).toContain(
    'resolves inside selected candidate',
  );
  expect((await inspect({ ...setup, revision: 'staged' })).stderr).toContain(
    'absent committed revision',
  );
});

test('inspect-manual requires policy authority and exact report and disposition pins', async () => {
  const setup = fixture();
  writeFileSync(setup.policyPath, JSON.stringify({ ...setup.policy, manual: undefined }));
  expect((await inspect(setup)).stderr).toContain('policy.manual');
  writeFileSync(setup.policyPath, JSON.stringify(setup.policy));
  writeFileSync(
    setup.reportPath,
    JSON.stringify({ ...setup.records.report, operator: 'different-operator' }),
  );
  expect((await inspect(setup)).stderr).toContain('Manual report differs from external policy pin');
  writeFileSync(setup.reportPath, JSON.stringify(setup.records.report));
  writeFileSync(
    join(setup.root, 'manual/disposition.json'),
    JSON.stringify({ ...setup.disposition, reason: 'Different physical control' }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'change disposition']);
  expect(
    (await inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) })).stderr,
  ).toContain('Manual disposition differs from external policy pin');
});

test('inspect-manual requires exact environment and approval pins', async () => {
  const setup = fixture();
  writeFileSync(
    join(setup.base, 'environment.json'),
    JSON.stringify({ ...setup.records.environment, environmentId: 'different-bench' }),
  );
  expect((await inspect(setup)).stderr).toContain(
    'Manual environment differs from external policy pin',
  );
  writeFileSync(join(setup.base, 'environment.json'), JSON.stringify(setup.records.environment));
  writeFileSync(
    join(setup.base, 'review.json'),
    JSON.stringify({ ...setup.records.review, reviewer: 'different-reviewer' }),
  );
  expect((await inspect(setup)).stderr).toContain(
    'Manual approval differs from external policy pin',
  );
});

test('inspect-manual refuses unknown fields in committed disposition and procedure', async () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'manual/disposition.json'),
    JSON.stringify({ ...setup.disposition, extra: true }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'extra disposition field']);
  expect(
    (await inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) })).stderr,
  ).toContain('extra');
  writeFileSync(join(setup.root, 'manual/disposition.json'), JSON.stringify(setup.disposition));
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, extra: true }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'extra procedure field']);
  expect(
    (await inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) })).stderr,
  ).toContain('extra');
});

test('inspect-manual refuses unknown Manual policy fields and wrong command arity', async () => {
  const setup = fixture();
  writeFileSync(
    setup.policyPath,
    JSON.stringify({ ...setup.policy, manual: { ...setup.manual, extra: true } }),
  );
  expect((await inspect(setup)).stderr).toContain('extra');
  const call = Bun.spawnSync([process.execPath, 'run', cli, 'inspect-manual', setup.root], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('usage: twilight-burokrat inspect-manual');
});

test('inspect-manual refuses aliases of one external report pin', async () => {
  const setup = fixture();
  const alias = `${setup.base}/subdir/../report.json`;
  writeFileSync(
    setup.policyPath,
    JSON.stringify({
      ...setup.policy,
      manual: {
        ...setup.manual,
        reports: [...setup.manual.reports, { path: alias, digest: setup.manual.reports[0].digest }],
      },
    }),
  );
  expect((await inspect(setup)).stderr).toContain('not canonical absolute');
});

test('inspect-manual refuses unknown fields on Manual pins and nested step records', async () => {
  const setup = fixture();
  writeFileSync(
    setup.policyPath,
    JSON.stringify({
      ...setup.policy,
      manual: { ...setup.manual, reports: [{ ...setup.manual.reports[0], extra: true }] },
    }),
  );
  expect((await inspect(setup)).stderr).toContain('extra');
  writeFileSync(
    setup.policyPath,
    JSON.stringify({
      ...setup.policy,
      manual: { ...setup.manual, dispositions: [{ ...setup.manual.dispositions[0], extra: true }] },
    }),
  );
  expect((await inspect(setup)).stderr).toContain('extra');
  writeFileSync(setup.policyPath, JSON.stringify(setup.policy));
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, steps: [{ ...setup.procedure.steps[0], extra: true }] }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'extra step field']);
  expect(
    (await inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) })).stderr,
  ).toContain('extra');
});

test('inspect-manual refuses unknown fields in reviewed scope and report step records', async () => {
  const setup = fixture();
  const module = { ...setup.records.report.reviewedScope.modules[0], extra: true };
  writeFileSync(
    setup.reportPath,
    JSON.stringify({
      ...setup.records.report,
      reviewedScope: { ...setup.records.report.reviewedScope, modules: [module] },
    }),
  );
  expect((await inspect(setup)).stderr).toContain('extra');
  const scope = { ...setup.records.report.reviewedScope, extra: true };
  writeFileSync(
    setup.reportPath,
    JSON.stringify({ ...setup.records.report, reviewedScope: scope }),
  );
  expect((await inspect(setup)).stderr).toContain('extra');
  writeFileSync(
    setup.reportPath,
    JSON.stringify({
      ...setup.records.report,
      steps: [{ ...setup.records.report.steps[0], extra: true }],
    }),
  );
  expect((await inspect(setup)).stderr).toContain('extra');
});

test('inspect-manual refuses a symlink before a parent segment in the report path', async () => {
  const setup = fixture();
  mkdirSync(join(setup.base, 'other', 'deep'), { recursive: true });
  symlinkSync(join(setup.base, 'other', 'deep'), join(setup.base, 'jump'));
  writeFileSync(setup.reportPath, '{');
  writeFileSync(join(setup.base, 'other', 'report.json'), JSON.stringify(setup.records.report));
  const path = `${setup.base}/jump/../report.json`;
  const call = await inspect({ ...setup, reportPath: path });
  expect(call.exitCode, call.stdout).toBe(1);
  expect(call.stderr).toContain('not canonical absolute');
});

test('inspect-manual refuses an unreadable regular report with EACCES', async () => {
  const setup = fixture();
  chmodSync(setup.reportPath, 0o000);
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('cannot open manual report');
  expect(call.stderr).toContain('EACCES');
});

test('inspect-manual names EACCES while inspecting an unreadable path component', async () => {
  const setup = fixture();
  const protectedDirectory = join(setup.base, 'protected');
  mkdirSync(protectedDirectory);
  const path = join(protectedDirectory, 'report.json');
  writeFileSync(path, JSON.stringify(setup.records.report));
  chmodSync(protectedDirectory, 0o000);
  try {
    const call = await inspect({ ...setup, reportPath: path });
    expect(call.exitCode).toBe(1);
    expect(call.stderr).toContain('cannot inspect manual report');
    expect(call.stderr).toContain('EACCES');
  } finally {
    chmodSync(protectedDirectory, 0o700);
  }
});

function commitDisposition(setup: ReturnType<typeof fixture>, changes: Record<string, unknown>) {
  const disposition = { ...setup.disposition, ...changes };
  writeFileSync(join(setup.root, 'manual/disposition.json'), JSON.stringify(disposition));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'change disposition']);
  const policy = {
    ...setup.policy,
    manual: {
      ...setup.manual,
      dispositions: [{ path: 'manual/disposition.json', digest: digest(disposition) }],
    },
  };
  writeFileSync(setup.policyPath, JSON.stringify(policy));
  return { ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) };
}

test('inspect-manual resolves the committed scenario through B3', async () => {
  const setup = fixture();
  const call = await inspect(setup);
  expect(call.exitCode, call.stderr).toBe(0);
  const finding = JSON.parse(call.stdout) as Record<string, unknown>;
  expect(finding['selectedScenario']).toEqual({ id: 'EXAMPLE-001', title: 'Example' });
});

test('inspect-manual names a missing or blank disposition reason', async () => {
  for (const reason of [undefined, '   ']) {
    const setup = fixture();
    const call = await inspect(commitDisposition(setup, { reason }));
    expect(call.exitCode).toBe(1);
    expect(call.stderr).toContain('Manual disposition reason');
  }
});

test('inspect-manual names a procedure with no ordered steps', async () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, steps: [] }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'empty steps']);
  const call = await inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual procedure needs ordered steps');
});

test('inspect-manual names a mismatched procedure scenario', async () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, scenarioId: 'EXAMPLE-002' }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'mismatch procedure']);
  const call = await inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual procedure scenario differs');
});

test('inspect-manual refuses an unknown scenario ID', async () => {
  const setup = fixture();
  const changed = commitDisposition(setup, { scenarioId: 'EXAMPLE-999' });
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, scenarioId: 'EXAMPLE-999' }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'same unknown procedure']);
  const call = await inspect({ ...changed, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual scenario is not active: EXAMPLE-999');
});

test('inspect-manual refuses a retired scenario ID', async () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'openspec/specs/example/spec.md'),
    '## Requirements\n### Requirement: Example requirement\n#### Scenario: [EXAMPLE-002] Replacement\n',
  );
  writeFileSync(
    join(setup.root, 'openspec/scenario-allocations.json'),
    JSON.stringify({
      schemaVersion: 1,
      events: [
        {
          kind: 'import',
          id: 'EXAMPLE-001',
          source: 'openspec/specs/example/spec.md',
          title: 'Example',
        },
        { kind: 'retire', id: 'EXAMPLE-001' },
        {
          kind: 'allocate',
          id: 'EXAMPLE-002',
          source: 'openspec/specs/example/spec.md',
          title: 'Replacement',
        },
      ],
    }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'retire scenario']);
  const call = await inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual scenario is not active: EXAMPLE-001');
});

test('inspect-manual refuses unresolved active specification conflict', async () => {
  const setup = fixture();
  for (const change of ['first', 'second']) {
    const path = join(setup.root, `openspec/changes/${change}/specs/example`);
    mkdirSync(path, { recursive: true });
    writeFileSync(
      join(path, 'spec.md'),
      '## ADDED Requirements\n### Requirement: Duplicate\n#### Scenario: [EXAMPLE-002] Duplicate\n',
    );
  }
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'competing changes']);
  const call = await inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('competing');
});

test('inspect-manual refuses an empty or repeated touched-module set', async () => {
  for (const touchedModules of [[], ['module-one', 'module-one'], ['   ']]) {
    const setup = fixture();
    const call = await inspect(commitDisposition(setup, { touchedModules }));
    expect(call.exitCode).toBe(1);
    expect(call.stderr).toContain('Manual touched modules');
  }
});

test('inspect-manual refuses blank instructions and expected observations', async () => {
  for (const changes of [{ instruction: ' ' }, { expectedObservation: ' ' }, { stepId: ' ' }]) {
    const setup = fixture();
    writeFileSync(
      join(setup.root, 'manual/procedure.json'),
      JSON.stringify({ ...setup.procedure, steps: [{ ...setup.procedure.steps[0], ...changes }] }),
    );
    git(setup.root, ['add', '.']);
    git(setup.root, ['commit', '-m', 'blank step']);
    const call = await inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
    expect(call.exitCode).toBe(1);
    expect(call.stderr).toContain('Manual procedure step is blank');
  }
});

test('inspect-manual refuses a disposition title that differs from B3', async () => {
  const setup = fixture();
  const changed = commitDisposition(setup, { title: 'Other title' });
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, title: 'Other title' }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'matching procedure title']);
  const call = await inspect({ ...changed, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual scenario title differs from effective specification');
});

test('inspect-manual names an unreadable committed procedure object', async () => {
  const setup = fixture();
  const blob = git(setup.root, ['rev-parse', 'HEAD:manual/procedure.json']);
  rmSync(join(setup.root, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('cannot read selected blob');
  expect(call.stderr).toContain('manual/procedure.json');
});

test('inspect-manual names malformed committed procedure JSON', async () => {
  const setup = fixture();
  writeFileSync(join(setup.root, 'manual/procedure.json'), '{');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'malformed procedure JSON']);
  const call = await inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('malformed manual procedure JSON');
});

test('inspect-manual requires external B3 scenarios authority', async () => {
  const setup = fixture();
  writeFileSync(setup.policyPath, JSON.stringify({ ...setup.policy, scenarios: undefined }));
  const call = await inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('policy.scenarios');
});

test('inspect-manual requires procedure title to match the disposition', async () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, title: 'Other title' }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'mismatched procedure title']);
  const call = await inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr).toContain('Manual procedure scenario differs');
});
