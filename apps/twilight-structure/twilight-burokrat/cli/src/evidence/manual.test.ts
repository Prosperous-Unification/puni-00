import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
    reviewBy: '2026-11-07',
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
  };
  writeFileSync(policyPath, JSON.stringify(policy));
  return {
    base,
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

test('inspect-manual decodes exact committed and external identities into an incomplete noncertifying state', () => {
  const setup = fixture();
  const call = inspect(setup);
  expect(call.exitCode, call.stderr.toString()).toBe(0);
  const observation = JSON.parse(call.stdout.toString()) as Record<string, unknown>;
  expect(observation['state']).toBe('unevaluated');
  expect(observation['certifies']).toBe(false);
  expect(observation['scenarioId']).toBe('EXAMPLE-001');
  expect(observation['runId']).toBe('run-one');
  expect(observation['revision']).toBe(setup.revision);
  expect(observation['reportDigest']).toBe(digest(setup.records.report));
  expect(Object.hasOwn(observation, 'coverage')).toBe(false);
});

test('inspect-manual refuses absent and unreadable external report separately', () => {
  const setup = fixture();
  const absent = { ...setup, reportPath: join(setup.base, 'absent.json') };
  const missing = inspect(absent);
  expect(missing.exitCode).toBe(1);
  expect(missing.stderr.toString()).toContain('cannot open manual report');
  const directory = join(setup.base, 'directory-report');
  mkdirSync(directory);
  const unreadable = inspect({ ...setup, reportPath: directory });
  expect(unreadable.exitCode).toBe(1);
  expect(unreadable.stderr.toString()).toContain('manual report');
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
  expect(inspect(setup).stderr.toString()).toContain('duplicate Manual report pin');
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
