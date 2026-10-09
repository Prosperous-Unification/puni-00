import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { registeredRules } from '../rules/registry';
import { hashBytes } from './content-manifest';

const scratch: string[] = [];
const cli = join(import.meta.dir, '..', 'cli.ts');
const digest = (record: unknown): string => hashBytes(Buffer.from(JSON.stringify(record)));
function git(root: string, args: string[]): string {
  const call = Bun.spawnSync(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (call.exitCode !== 0) throw new Error(call.stderr.toString());
  return call.stdout.toString().trim();
}
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'burokrat-manual-'));
  scratch.push(base);
  const root = join(base, 'candidate');
  mkdirSync(root);
  git(root, ['init']);
  git(root, ['config', 'user.name', 'Fixture Author']);
  git(root, ['config', 'user.email', 'author@example.invalid']);
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
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'reviewed base']);
  const baseRevision = git(root, ['rev-parse', 'HEAD']);
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
  mkdirSync(join(root, 'manual'));
  writeFileSync(join(root, 'manual/disposition.json'), JSON.stringify(disposition));
  writeFileSync(join(root, 'manual/procedure.json'), JSON.stringify(procedure));
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'candidate']);
  const revision = git(root, ['rev-parse', 'HEAD']);
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
    reviewedScope: {
      requirementDigest: 'a'.repeat(64),
      modules: [{ moduleId: 'module-one', digest: 'b'.repeat(64) }],
    },
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
function inspect(setup: ReturnType<typeof fixture>) {
  return Bun.spawnSync(
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
}
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

test('inspect-manual accepts an exact external approval chain as a noncertifying passing observation', () => {
  const setup = fixture();
  const call = inspect(setup);
  expect(call.exitCode, call.stderr.toString()).toBe(0);
  const observation = JSON.parse(call.stdout.toString()) as Record<string, unknown>;
  expect(observation['state']).toBe('passing');
  expect(observation['validation']).toBe('passed');
  expect(observation['outcome']).toBe('passed');
  expect(observation['provenance']).toBe('policy-pinned-external-approval');
  expect(observation['certifies']).toBe(false);
  expect(observation['scenarioId']).toBe('EXAMPLE-001');
  expect(observation['runId']).toBe('run-one');
  expect(observation['revision']).toBe(setup.revision);
  expect(observation['testedRevision']).toBe(setup.revision);
  expect(observation['reportDigest']).toBe(digest(setup.records.report));
  expect(Object.hasOwn(observation, 'coverage')).toBe(false);
});

test('inspect-manual keeps an earlier tested commit distinct from an unrelated selected descendant', () => {
  const setup = fixture();
  writeFileSync(join(setup.root, 'unrelated.txt'), 'unrelated change');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'unrelated descendant']);
  const revision = git(setup.root, ['rev-parse', 'HEAD']);
  const call = inspect({ ...setup, revision });
  expect(call.exitCode, call.stderr.toString()).toBe(0);
  const observation = JSON.parse(call.stdout.toString()) as Record<string, unknown>;
  expect(observation['revision']).toBe(revision);
  expect(observation['testedRevision']).toBe(setup.revision);
  expect(observation['currency']).toBe('unevaluated');
  expect(observation['certifies']).toBe(false);
});

test('inspect-manual refuses a pinned tested SHA that is not a commit object', () => {
  const setup = fixture();
  setup.records.report.sourceRevision = 'a'.repeat(40);
  setup.records.environment.sourceRevision = setup.records.report.sourceRevision;
  setup.records.report.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('absent tested revision');
});

test('inspect-manual refuses an annotated tag object SHA as the tested revision', () => {
  const setup = fixture();
  git(setup.root, ['tag', '-a', 'tested-tag', '-m', 'annotated tested tag']);
  const tagObject = git(setup.root, ['rev-parse', 'refs/tags/tested-tag']);
  setup.records.report.sourceRevision = tagObject;
  setup.records.environment.sourceRevision = tagObject;
  setup.records.report.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.environmentDigest = digest(setup.records.environment);
  setup.records.acceptance.reportDigest = digest(setup.records.report);
  writeApprovedChain(setup);
  const call = inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('Manual tested revision is not an exact commit');
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
    'deadline',
    (s: ReturnType<typeof fixture>) => {
      s.records.review.reviewedAt = '1999-12-31T10:00:00.000Z';
      s.records.review.reviewBy = '2000-01-01';
    },
    'EXAMPLE-001 review overdue on 2000-01-01',
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
    'failed aggregate',
    (s: ReturnType<typeof fixture>) => {
      s.records.report.outcome = 'failed';
    },
    'Manual report outcome',
  ],
] as const)('inspect-manual refuses %s with approved bytes', (name, change, finding) => {
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
  const call = inspect(setup);
  expect(call.exitCode, call.stdout.toString()).toBe(1);
  expect(call.stderr.toString()).toContain(finding);
});

test('inspect-manual refuses absent and unreadable external report separately', () => {
  const setup = fixture();
  const absent = { ...setup, reportPath: join(setup.base, 'absent.json') };
  const missing = inspect(absent);
  expect(missing.exitCode).toBe(1);
  expect(missing.stderr.toString()).toContain('cannot inspect manual report');
  expect(missing.stderr.toString()).toContain('ENOENT');
  const directory = join(setup.base, 'directory-report');
  mkdirSync(directory);
  const unreadable = inspect({ ...setup, reportPath: directory });
  expect(unreadable.exitCode).toBe(1);
  expect(unreadable.stderr.toString()).toContain('manual report');
});

test('inspect-manual refuses an absent externally approved acceptance record', () => {
  const setup = fixture();
  rmSync(join(setup.base, 'acceptance.json'));
  const call = inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('cannot inspect manual acceptance approval');
  expect(call.stderr.toString()).toContain('ENOENT');
});

test('inspect-manual refuses malformed external UTF-8 and JSON', () => {
  const setup = fixture();
  writeFileSync(setup.reportPath, Buffer.from([0xff]));
  expect(inspect(setup).stderr.toString()).toContain('not UTF-8');
  writeFileSync(setup.reportPath, '{');
  expect(inspect(setup).stderr.toString()).toContain('malformed manual report JSON');
});

test('inspect-manual refuses unknown schema version and fields', () => {
  const setup = fixture();
  writeFileSync(setup.reportPath, JSON.stringify({ ...setup.records.report, schemaVersion: 99 }));
  expect(inspect(setup).stderr.toString()).toContain('schemaVersion');
  writeFileSync(setup.reportPath, JSON.stringify({ ...setup.records.report, unknown: true }));
  expect(inspect(setup).stderr.toString()).toContain('unknown');
});

test('inspect-manual refuses duplicate policy pins and duplicate procedure steps', () => {
  const setup = fixture();
  writeFileSync(
    setup.policyPath,
    JSON.stringify({
      ...setup.policy,
      manual: { ...setup.manual, reports: [setup.manual.reports[0], setup.manual.reports[0]] },
    }),
  );
  expect(inspect(setup).stderr.toString()).toContain('duplicate Manual report pin');
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
  expect(inspect({ ...setup, revision }).stderr.toString()).toContain('duplicate Manual step ID');
});

test('inspect-manual refuses external symlinks and candidate path escape', () => {
  const setup = fixture();
  const link = join(setup.base, 'linked-report.json');
  symlinkSync(setup.reportPath, link);
  expect(inspect({ ...setup, reportPath: link }).stderr.toString()).toContain('symlink');
  const escaped = { ...setup.records.report, dispositionPath: '../outside.json' };
  writeFileSync(setup.reportPath, JSON.stringify(escaped));
  expect(inspect(setup).stderr.toString()).toContain('dispositionPath');
});

test('inspect-manual refuses absent committed disposition and procedure blobs', () => {
  const setup = fixture();
  rmSync(join(setup.root, 'manual/disposition.json'));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'remove disposition']);
  const absentDisposition = inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(absentDisposition.stderr.toString()).toContain('manual disposition is absent');
  writeFileSync(join(setup.root, 'manual/disposition.json'), JSON.stringify(setup.disposition));
  rmSync(join(setup.root, 'manual/procedure.json'));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'remove procedure']);
  const absentProcedure = inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(absentProcedure.stderr.toString()).toContain('manual procedure is absent');
});

test('inspect-manual refuses malformed committed procedure bytes and symlink mode', () => {
  const setup = fixture();
  writeFileSync(join(setup.root, 'manual/procedure.json'), Buffer.from([0xff]));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'invalid utf8']);
  expect(
    inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) }).stderr.toString(),
  ).toContain('manual procedure is not UTF-8');
  rmSync(join(setup.root, 'manual/procedure.json'));
  symlinkSync('disposition.json', join(setup.root, 'manual/procedure.json'));
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'symlink procedure']);
  expect(
    inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) }).stderr.toString(),
  ).toContain('manual procedure is absent or not a regular committed blob');
});

test('inspect-manual refuses malformed and unknown fields in every external record', () => {
  for (const name of ['environment', 'review', 'acceptance'] as const) {
    const setup = fixture();
    const path = join(setup.base, `${name}.json`);
    writeFileSync(path, '{');
    expect(inspect(setup).stderr.toString()).toContain(
      `malformed manual ${name === 'review' ? 'review approval' : name === 'acceptance' ? 'acceptance approval' : name} JSON`,
    );
    writeFileSync(path, JSON.stringify({ ...setup.records[name], extra: true }));
    expect(inspect(setup).stderr.toString()).toContain('extra');
  }
});

test('inspect-manual refuses a policy inside candidate and a noncommitted revision', () => {
  const setup = fixture();
  const inside = join(setup.root, 'policy.json');
  writeFileSync(inside, JSON.stringify(setup.policy));
  expect(inspect({ ...setup, policyPath: inside }).stderr.toString()).toContain(
    'resolves inside selected candidate',
  );
  expect(inspect({ ...setup, revision: 'staged' }).stderr.toString()).toContain(
    'absent committed revision',
  );
});

test('inspect-manual requires policy authority and exact report and disposition pins', () => {
  const setup = fixture();
  writeFileSync(setup.policyPath, JSON.stringify({ ...setup.policy, manual: undefined }));
  expect(inspect(setup).stderr.toString()).toContain('policy.manual');
  writeFileSync(setup.policyPath, JSON.stringify(setup.policy));
  writeFileSync(
    setup.reportPath,
    JSON.stringify({ ...setup.records.report, operator: 'different-operator' }),
  );
  expect(inspect(setup).stderr.toString()).toContain(
    'Manual report differs from external policy pin',
  );
  writeFileSync(setup.reportPath, JSON.stringify(setup.records.report));
  writeFileSync(
    join(setup.root, 'manual/disposition.json'),
    JSON.stringify({ ...setup.disposition, reason: 'Different physical control' }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'change disposition']);
  expect(
    inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) }).stderr.toString(),
  ).toContain('Manual disposition differs from external policy pin');
});

test('inspect-manual requires exact environment and approval pins', () => {
  const setup = fixture();
  writeFileSync(
    join(setup.base, 'environment.json'),
    JSON.stringify({ ...setup.records.environment, environmentId: 'different-bench' }),
  );
  expect(inspect(setup).stderr.toString()).toContain(
    'Manual environment differs from external policy pin',
  );
  writeFileSync(join(setup.base, 'environment.json'), JSON.stringify(setup.records.environment));
  writeFileSync(
    join(setup.base, 'review.json'),
    JSON.stringify({ ...setup.records.review, reviewer: 'different-reviewer' }),
  );
  expect(inspect(setup).stderr.toString()).toContain(
    'Manual approval differs from external policy pin',
  );
});

test('inspect-manual refuses unknown fields in committed disposition and procedure', () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'manual/disposition.json'),
    JSON.stringify({ ...setup.disposition, extra: true }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'extra disposition field']);
  expect(
    inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) }).stderr.toString(),
  ).toContain('extra');
  writeFileSync(join(setup.root, 'manual/disposition.json'), JSON.stringify(setup.disposition));
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, extra: true }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'extra procedure field']);
  expect(
    inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) }).stderr.toString(),
  ).toContain('extra');
});

test('inspect-manual refuses unknown Manual policy fields and wrong command arity', () => {
  const setup = fixture();
  writeFileSync(
    setup.policyPath,
    JSON.stringify({ ...setup.policy, manual: { ...setup.manual, extra: true } }),
  );
  expect(inspect(setup).stderr.toString()).toContain('extra');
  const call = Bun.spawnSync([process.execPath, 'run', cli, 'inspect-manual', setup.root], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('usage: twilight-burokrat inspect-manual');
});

test('inspect-manual refuses aliases of one external report pin', () => {
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
  expect(inspect(setup).stderr.toString()).toContain('not canonical absolute');
});

test('inspect-manual refuses unknown fields on Manual pins and nested step records', () => {
  const setup = fixture();
  writeFileSync(
    setup.policyPath,
    JSON.stringify({
      ...setup.policy,
      manual: { ...setup.manual, reports: [{ ...setup.manual.reports[0], extra: true }] },
    }),
  );
  expect(inspect(setup).stderr.toString()).toContain('extra');
  writeFileSync(
    setup.policyPath,
    JSON.stringify({
      ...setup.policy,
      manual: { ...setup.manual, dispositions: [{ ...setup.manual.dispositions[0], extra: true }] },
    }),
  );
  expect(inspect(setup).stderr.toString()).toContain('extra');
  writeFileSync(setup.policyPath, JSON.stringify(setup.policy));
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, steps: [{ ...setup.procedure.steps[0], extra: true }] }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'extra step field']);
  expect(
    inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) }).stderr.toString(),
  ).toContain('extra');
});

test('inspect-manual refuses unknown fields in reviewed scope and report step records', () => {
  const setup = fixture();
  const module = { ...setup.records.report.reviewedScope.modules[0], extra: true };
  writeFileSync(
    setup.reportPath,
    JSON.stringify({
      ...setup.records.report,
      reviewedScope: { ...setup.records.report.reviewedScope, modules: [module] },
    }),
  );
  expect(inspect(setup).stderr.toString()).toContain('extra');
  const scope = { ...setup.records.report.reviewedScope, extra: true };
  writeFileSync(
    setup.reportPath,
    JSON.stringify({ ...setup.records.report, reviewedScope: scope }),
  );
  expect(inspect(setup).stderr.toString()).toContain('extra');
  writeFileSync(
    setup.reportPath,
    JSON.stringify({
      ...setup.records.report,
      steps: [{ ...setup.records.report.steps[0], extra: true }],
    }),
  );
  expect(inspect(setup).stderr.toString()).toContain('extra');
});

test('inspect-manual refuses a symlink before a parent segment in the report path', () => {
  const setup = fixture();
  mkdirSync(join(setup.base, 'other', 'deep'), { recursive: true });
  symlinkSync(join(setup.base, 'other', 'deep'), join(setup.base, 'jump'));
  writeFileSync(setup.reportPath, '{');
  writeFileSync(join(setup.base, 'other', 'report.json'), JSON.stringify(setup.records.report));
  const path = `${setup.base}/jump/../report.json`;
  const call = inspect({ ...setup, reportPath: path });
  expect(call.exitCode, call.stdout.toString()).toBe(1);
  expect(call.stderr.toString()).toContain('not canonical absolute');
});

test('inspect-manual refuses an unreadable regular report with EACCES', () => {
  const setup = fixture();
  chmodSync(setup.reportPath, 0o000);
  const call = inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('cannot open manual report');
  expect(call.stderr.toString()).toContain('EACCES');
});

test('inspect-manual names EACCES while inspecting an unreadable path component', () => {
  const setup = fixture();
  const protectedDirectory = join(setup.base, 'protected');
  mkdirSync(protectedDirectory);
  const path = join(protectedDirectory, 'report.json');
  writeFileSync(path, JSON.stringify(setup.records.report));
  chmodSync(protectedDirectory, 0o000);
  try {
    const call = inspect({ ...setup, reportPath: path });
    expect(call.exitCode).toBe(1);
    expect(call.stderr.toString()).toContain('cannot inspect manual report');
    expect(call.stderr.toString()).toContain('EACCES');
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

test('inspect-manual resolves the committed scenario through B3', () => {
  const setup = fixture();
  const call = inspect(setup);
  expect(call.exitCode, call.stderr.toString()).toBe(0);
  const finding = JSON.parse(call.stdout.toString()) as Record<string, unknown>;
  expect(finding['selectedScenario']).toEqual({ id: 'EXAMPLE-001', title: 'Example' });
});

test('inspect-manual names a missing or blank disposition reason', () => {
  for (const reason of [undefined, '   ']) {
    const setup = fixture();
    const call = inspect(commitDisposition(setup, { reason }));
    expect(call.exitCode).toBe(1);
    expect(call.stderr.toString()).toContain('Manual disposition reason');
  }
});

test('inspect-manual names a procedure with no ordered steps', () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, steps: [] }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'empty steps']);
  const call = inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('Manual procedure needs ordered steps');
});

test('inspect-manual names a mismatched procedure scenario', () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, scenarioId: 'EXAMPLE-002' }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'mismatch procedure']);
  const call = inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('Manual procedure scenario differs');
});

test('inspect-manual refuses an unknown scenario ID', () => {
  const setup = fixture();
  const changed = commitDisposition(setup, { scenarioId: 'EXAMPLE-999' });
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, scenarioId: 'EXAMPLE-999' }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'same unknown procedure']);
  const call = inspect({ ...changed, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('Manual scenario is not active: EXAMPLE-999');
});

test('inspect-manual refuses a retired scenario ID', () => {
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
  const call = inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('Manual scenario is not active: EXAMPLE-001');
});

test('inspect-manual refuses unresolved active specification conflict', () => {
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
  const call = inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('competing');
});

test('inspect-manual refuses an empty or repeated touched-module set', () => {
  for (const touchedModules of [[], ['module-one', 'module-one'], ['   ']]) {
    const setup = fixture();
    const call = inspect(commitDisposition(setup, { touchedModules }));
    expect(call.exitCode).toBe(1);
    expect(call.stderr.toString()).toContain('Manual touched modules');
  }
});

test('inspect-manual refuses blank instructions and expected observations', () => {
  for (const changes of [{ instruction: ' ' }, { expectedObservation: ' ' }, { stepId: ' ' }]) {
    const setup = fixture();
    writeFileSync(
      join(setup.root, 'manual/procedure.json'),
      JSON.stringify({ ...setup.procedure, steps: [{ ...setup.procedure.steps[0], ...changes }] }),
    );
    git(setup.root, ['add', '.']);
    git(setup.root, ['commit', '-m', 'blank step']);
    const call = inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
    expect(call.exitCode).toBe(1);
    expect(call.stderr.toString()).toContain('Manual procedure step is blank');
  }
});

test('inspect-manual refuses a disposition title that differs from B3', () => {
  const setup = fixture();
  const changed = commitDisposition(setup, { title: 'Other title' });
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, title: 'Other title' }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'matching procedure title']);
  const call = inspect({ ...changed, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain(
    'Manual scenario title differs from effective specification',
  );
});

test('inspect-manual names an unreadable committed procedure object', () => {
  const setup = fixture();
  const blob = git(setup.root, ['rev-parse', 'HEAD:manual/procedure.json']);
  rmSync(join(setup.root, '.git/objects', blob.slice(0, 2), blob.slice(2)));
  const call = inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('cannot read selected blob');
  expect(call.stderr.toString()).toContain('manual/procedure.json');
});

test('inspect-manual names malformed committed procedure JSON', () => {
  const setup = fixture();
  writeFileSync(join(setup.root, 'manual/procedure.json'), '{');
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'malformed procedure JSON']);
  const call = inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('malformed manual procedure JSON');
});

test('inspect-manual requires external B3 scenarios authority', () => {
  const setup = fixture();
  writeFileSync(setup.policyPath, JSON.stringify({ ...setup.policy, scenarios: undefined }));
  const call = inspect(setup);
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('policy.scenarios');
});

test('inspect-manual requires procedure title to match the disposition', () => {
  const setup = fixture();
  writeFileSync(
    join(setup.root, 'manual/procedure.json'),
    JSON.stringify({ ...setup.procedure, title: 'Other title' }),
  );
  git(setup.root, ['add', '.']);
  git(setup.root, ['commit', '-m', 'mismatched procedure title']);
  const call = inspect({ ...setup, revision: git(setup.root, ['rev-parse', 'HEAD']) });
  expect(call.exitCode).toBe(1);
  expect(call.stderr.toString()).toContain('Manual procedure scenario differs');
});
