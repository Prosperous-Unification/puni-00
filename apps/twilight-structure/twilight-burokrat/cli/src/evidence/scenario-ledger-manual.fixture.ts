import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { readCandidate } from '../inventory/read-candidate';
import { hashBytes, hashCanonical } from './content-manifest';
import { inspectManualObservation } from './manual-observation';
import { inspectPerformanceScenarios } from './performance-scenarios';
import { createPerformanceFixture } from './performance-scenarios.fixture';

function index(moduleId: string, memberships: unknown[]) {
  return `# Fixture\n<!-- module-index ${JSON.stringify({
    schemaVersion: 1,
    moduleId,
    memberships,
    relationshipSelectors: [],
    applicableChecks: [],
    inapplicableSections: [
      { section: 'relationships', reason: 'No relationships.' },
      { section: 'invariants', reason: 'No invariants.' },
      { section: 'checks', reason: 'Manual fixture.' },
    ],
    externalConsumers: { kind: 'none-known', knowledgeLimit: 'Fixture only.' },
  })} -->\n`;
}
const digest = (record: unknown) => hashBytes(Buffer.from(JSON.stringify(record)));
/** Builds real Performance and Manual observations over the same committed candidate and policy. */
export function createLedgerManualFixture(
  outcome: 'passed' | 'failed' | 'skipped' = 'passed',
  overdue = false,
  stale = false,
) {
  const disposition = {
    schemaVersion: 1,
    scenarioId: 'EXAMPLE-001',
    title: 'renders cells',
    reason: 'Physical control',
    procedurePath: 'manual/procedure.json',
    touchedModules: ['module-one'],
  };
  const procedure = {
    schemaVersion: 1,
    scenarioId: 'EXAMPLE-001',
    title: 'renders cells',
    steps: [{ stepId: 'one', instruction: 'Press control', expectedObservation: 'Lamp lights' }],
  };
  const setup = createPerformanceFixture('none', false, false, '[EXAMPLE-001] renders cells', '', {
    'README.md': index('module-root', [
      { kind: 'directory-prefix', prefix: 'apps', exclusions: [] },
      { kind: 'directory-prefix', prefix: 'openspec', exclusions: [] },
      { kind: 'directory-prefix', prefix: 'manual', exclusions: [] },
      { kind: 'path', path: 'source/README.md' },
    ]),
    'source/README.md': index('module-one', [{ kind: 'path', path: 'module.ts' }]),
    'source/module.ts': 'export const lamp = true;\n',
    'manual/disposition.json': JSON.stringify(disposition),
    'manual/procedure.json': JSON.stringify(procedure),
  });
  const now = '2026-10-15T00:00:00.000Z';
  const base = dirname(setup.policyPath);
  const before = inspectPerformanceScenarios(
    setup.root,
    setup.revision,
    setup.policyPath,
    setup.authorityPath,
    'example',
  );
  const selected = readCandidate(setup.root, { kind: 'committed', revision: setup.revision });
  const entries = selected.entries
    .filter((entry) => entry.path === 'source/README.md' || entry.path === 'source/module.ts')
    .map(({ path, mode, blob }) => ({ path, mode, blob }));
  const requirement = before.specifications.selection.effective.find(
    (requirement) => requirement.capability === 'example',
  );
  if (requirement === undefined) throw new Error('Fixture requirement absent');
  const scope = {
    requirementDigest: requirement.digest,
    modules: [
      {
        moduleId: 'module-one',
        digest: hashCanonical({
          schemaVersion: 1,
          moduleId: 'module-one',
          indexPath: 'source/README.md',
          entries,
        }),
      },
    ],
  };
  const environment = {
    schemaVersion: 1,
    observationId: 'one',
    environmentId: 'bench',
    observedAt: '2026-10-08T10:00:00.000Z',
    sourceRevision: setup.revision,
    attributes: { host: 'bench' },
  };
  const report = {
    schemaVersion: 1,
    runId: 'one',
    scenarioId: 'EXAMPLE-001',
    title: 'renders cells',
    dispositionPath: 'manual/disposition.json',
    dispositionDigest: digest(disposition),
    procedureDigest: digest(procedure),
    sourceRevision: setup.revision,
    reviewedScope: scope,
    operator: 'operator',
    startedAt: '2026-10-08T10:01:00.000Z',
    completedAt: '2026-10-08T10:02:00.000Z',
    environmentPath: join(base, 'environment.json'),
    environmentDigest: digest(environment),
    reviewApprovalPath: join(base, 'review.json'),
    acceptanceApprovalPath: join(base, 'acceptance.json'),
    steps: [{ stepId: 'one', outcome, observation: 'Lamp observed' }],
    outcome,
  };
  const review = {
    schemaVersion: 1,
    kind: 'disposition-review',
    scenarioId: 'EXAMPLE-001',
    dispositionDigest: digest(disposition),
    procedureDigest: digest(procedure),
    reviewedScope: scope,
    reviewer: 'reviewer-one',
    reference: 'ticket',
    reviewedAt: '2026-10-07T10:00:00.000Z',
    reviewBy: overdue ? '2026-10-09' : '9999-12-31',
  };
  const acceptance = {
    schemaVersion: 1,
    kind: 'report-acceptance',
    runId: 'one',
    reportDigest: digest(report),
    environmentDigest: digest(environment),
    operator: 'operator',
    startedAt: report.startedAt,
    completedAt: report.completedAt,
    reviewer: 'reviewer-two',
    reference: 'ticket',
    acceptedAt: '2026-10-08T10:03:00.000Z',
  };
  for (const [name, record] of Object.entries({ environment, report, review, acceptance }))
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
  const policy = { ...setup.policy, manual };
  writeFileSync(setup.policyPath, JSON.stringify(policy));
  // The publication and Manual authority pin the same exact external policy bytes.
  if (stale) {
    writeFileSync(join(setup.root, 'source/module.ts'), 'export const lamp = false;\n');
    for (const args of [
      ['add', 'source/module.ts'],
      ['commit', '-m', 'source changed'],
    ]) {
      const invocation = Bun.spawnSync(['git', '-C', setup.root, ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
    }
    const revisionCall = Bun.spawnSync(['git', '-C', setup.root, 'rev-parse', 'HEAD'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (revisionCall.exitCode !== 0) throw new Error(revisionCall.stderr.toString());
    setup.revision = revisionCall.stdout.toString().trim();
    const snapshot = readCandidate(setup.root, { kind: 'committed', revision: setup.revision });
    const candidate = hashCanonical({
      selection: snapshot.selection,
      entries: snapshot.entries,
      untracked: snapshot.untracked,
    });
    setup.factsAuthority.revision = setup.revision;
    setup.factsAuthority.candidate = candidate;
    writeFileSync(setup.authorityPath, JSON.stringify(setup.factsAuthority));
    setup.evidence.candidate = candidate;
    setup.manifest['candidate'] = candidate;
    setup.manifest['revision'] = setup.revision;
  }
  const policyDigest = hashBytes(readFileSync(setup.policyPath));
  setup.evidence.policyDigest = policyDigest;
  const evidenceBytes = JSON.stringify(setup.evidence);
  writeFileSync(join(setup.bundle, 'evidence.json'), evidenceBytes);
  setup.manifest['policyDigest'] = policyDigest;
  setup.manifest['evidence'] = {
    path: 'evidence.json',
    digest: hashBytes(Buffer.from(evidenceBytes)),
  };
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  const performance = inspectPerformanceScenarios(
    setup.root,
    setup.revision,
    setup.policyPath,
    setup.authorityPath,
    'example',
  );
  const reportPath = join(base, 'report.json');
  const observation = inspectManualObservation(
    setup.root,
    setup.revision,
    setup.policyPath,
    reportPath,
    new Date(now),
  );
  const ledgerPath = join(base, 'ledger.json');
  const authority = {
    schemaVersion: 1,
    revision: setup.revision,
    candidate: performance.candidate,
    capability: 'example',
    performanceObservationDigest: performance.observationDigest,
    obligations: [
      {
        scenarioId: 'EXAMPLE-001',
        disposition: {
          kind: 'manual',
          reportPath,
          observationDigest: observation.observationDigest,
        },
      },
      {
        scenarioId: 'EXAMPLE-002',
        disposition: { kind: 'inapplicable', reason: 'No second physical control.' },
      },
    ],
  };
  writeFileSync(ledgerPath, JSON.stringify(authority));
  return { ...setup, performance, ledgerPath, authority, observation, reportPath, policy, now };
}
