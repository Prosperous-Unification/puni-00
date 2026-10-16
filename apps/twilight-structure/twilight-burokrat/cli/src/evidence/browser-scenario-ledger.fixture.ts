import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { digestEvidenceBytes } from '@shared/test-evidence';

import { inspectBrowserScenarios } from './browser-scenarios';
import { hashBytes } from './content-manifest';
import { inspectManualObservation } from './manual-observation';
import { createPerformanceFixture } from './performance-scenarios.fixture';
import { createLedgerManualFixture } from './scenario-ledger-manual.fixture';
import { inspectTestReports } from './test-reports';
const config = 'apps/example/playwright.browser.config.ts';
const file = 'apps/example/src/browser.test.ts';
const projectRoot = 'apps/example';
const manifestPath = `${projectRoot}/project.json`;
const invocationId = '33333333-3333-4333-8333-333333333333';
const owner = '44444444-4444-4444-8444-444444444444';

/** Creates a real Browser publication and four membership authorities without Performance execution evidence. */
export function createBrowserLedgerFixture(
  extraFiles: Record<string, string> = {},
  terminal = '[EXAMPLE-001] renders cells',
) {
  const setup = createPerformanceFixture('none', false, false, terminal, '', {
    [config]: 'export default {}\n',
    [file]: 'throw new Error("Browser fixture executed");\n',
    ...extraFiles,
  });
  return attachBrowserLedgerFixture(setup);
}
function attachBrowserLedgerFixture(setup: ReturnType<typeof createPerformanceFixture>) {
  const policy = {
    ...setup.policy,
    browser: {
      modes: [
        {
          mode: 'ordinary',
          config,
          configDigest: digestEvidenceBytes('export default {}\n'),
          projects: ['chromium'],
        },
      ],
    },
  };
  writeFileSync(setup.policyPath, JSON.stringify(policy));
  const policyDigest = hashBytes(readFileSync(setup.policyPath));
  setup.evidence.policyDigest = policyDigest;
  const evidenceBytes = JSON.stringify(setup.evidence);
  writeFileSync(join(setup.bundle, 'evidence.json'), evidenceBytes);
  setup.manifest['policyDigest'] = policyDigest;
  setup.manifest['evidence'] = {
    path: 'evidence.json',
    digest: digestEvidenceBytes(evidenceBytes),
  };
  writeFileSync(join(setup.bundle, 'manifest.json'), JSON.stringify(setup.manifest));
  const browserRoot = join(setup.root, 'tmp/junit/browser');
  const browserBundle = join(browserRoot, invocationId);
  mkdirSync(browserBundle, { recursive: true });
  writeFileSync(
    join(browserRoot, 'ordinary.current.json'),
    JSON.stringify({
      schemaVersion: 2,
      invocationId,
      mode: 'ordinary',
      bundle: `tmp/junit/browser/${invocationId}`,
      owner,
    }),
  );
  writeFileSync(join(browserRoot, 'ordinary.owner'), owner);
  writeFileSync(join(browserRoot, 'ordinary.latest-request'), owner);
  const relative = `tmp/junit/browser/${invocationId}`;
  const browserManifest: Record<string, unknown> = {
    schemaVersion: 1,
    certifies: false,
    invocationId,
    mode: 'ordinary',
    revision: setup.revision,
    candidate: setup.evidence.candidate,
    config,
    configDigest: policy.browser.modes[0].configDigest,
    runnerVersion: '1.63.0',
    environment: { CI: '1', E2E_PORT_SHIFT: '0' },
    raw: {
      discovery: { path: `${relative}/discovery.json` },
      execution: { path: `${relative}/execution.json` },
      junit: { path: `${relative}/playwright.xml` },
    },
    report: `${relative}/report.xml`,
  };
  const base = dirname(setup.policyPath);
  const paths = {
    review: join(base, 'browser-review.json'),
    conformance: join(base, 'browser-conformance.json'),
    architecture: join(base, 'browser-architecture.json'),
    performance: join(base, 'browser-performance.json'),
  };
  const ledgerPath = join(base, 'ledger.json');
  const fixture = { ...setup, browserBundle, browserManifest, paths, ledgerPath };
  publishBrowserLedgerCases(fixture, [
    { title: '[EXAMPLE-001] Browser passing', status: 'passed' },
  ]);
  rmSync(join(setup.root, 'tmp/junit/performance'), { recursive: true });
  rmSync(join(setup.root, 'tmp/junit/wbs-fe-01.performance.current.json'));
  rmSync(setup.authorityPath);
  repinBrowserLedger(fixture);
  return fixture;
}
export type BrowserLedgerFixture = ReturnType<typeof createPerformanceFixture> & {
  browserBundle: string;
  browserManifest: Record<string, unknown>;
  paths: { review: string; conformance: string; architecture: string; performance: string };
  ledgerPath: string;
};
/** Rebuilds all external pins from real upstream observations after changing publication bytes. */
export function repinBrowserLedger(setup: BrowserLedgerFixture): {
  browser: ReturnType<typeof inspectBrowserScenarios>;
} {
  const report = inspectTestReports(setup.root, setup.revision, setup.policyPath, 'ordinary');
  const identity = {
    revision: setup.revision,
    candidate: report.candidate,
    mode: 'ordinary',
    reportObservationDigest: report.observationDigest,
  };
  const pin = (path: string) => ({ path, digest: hashBytes(readFileSync(join(setup.root, path))) });
  const scope = { ...identity, projectRoot, projectManifest: pin(manifestPath) };
  const authorities = {
    review: {
      schemaVersion: 1,
      ...identity,
      memberships: [
        { level: 'manual', kind: 'reviewed-empty' },
        { level: 'conformance', kind: 'unknown' },
        { level: 'architecture', kind: 'unknown' },
        { level: 'performance', kind: 'unknown' },
      ],
    },
    conformance: { schemaVersion: 2, ...scope, conformance: { kind: 'reviewed-empty' } },
    architecture: { schemaVersion: 1, ...scope, architecture: { kind: 'reviewed-empty' } },
    performance: {
      schemaVersion: 1,
      ...scope,
      declaration: pin(setup.policy.performance.declarationPath),
      config: pin(setup.policy.performance.config),
      project: 'chromium',
    },
  };
  for (const name of ['review', 'conformance', 'architecture', 'performance'] as const)
    writeFileSync(setup.paths[name], JSON.stringify(authorities[name]));
  const browser = inspectBrowserScenarios(
    setup.root,
    setup.revision,
    setup.policyPath,
    'ordinary',
    setup.paths.review,
    setup.paths.conformance,
    setup.paths.architecture,
    setup.paths.performance,
    'example',
  );
  const authority = {
    schemaVersion: 1,
    revision: setup.revision,
    candidate: browser.candidate,
    capability: 'example',
    browser: {
      mode: 'ordinary',
      reviewAuthorityPath: setup.paths.review,
      conformanceAuthorityPath: setup.paths.conformance,
      architectureAuthorityPath: setup.paths.architecture,
      performanceAuthorityPath: setup.paths.performance,
      observationDigest: browser.observationDigest,
    },
    obligations: [
      {
        scenarioId: 'EXAMPLE-001',
        disposition: { kind: 'automated', lowestSufficientLevel: 'browser' },
      },
      {
        scenarioId: 'EXAMPLE-002',
        disposition: { kind: 'inapplicable', reason: 'No second control.' },
      },
    ],
  };
  writeFileSync(setup.ledgerPath, JSON.stringify(authority));
  return { browser };
}
export function publishBrowserLedgerCases(
  setup: BrowserLedgerFixture,
  observations: readonly { title: string; status: 'passed' | 'failed' | 'skipped' }[],
  caseFile = file,
  parentTitle = '',
): void {
  const raw = (phase: 'list' | 'run') => ({
    config: {
      configFile: join(setup.root, config),
      version: '1.63.0',
      rootDir: setup.root,
      projects: [{ name: 'chromium' }],
    },
    errors: [],
    suites: [
      {
        file: caseFile,
        title: caseFile,
        specs: observations.map((observation) => ({
          file: caseFile,
          title: observation.title,
          tests: [
            {
              projectName: 'chromium',
              status: phase === 'list' || observation.status === 'skipped' ? 'skipped' : 'expected',
              results:
                phase === 'list' || observation.status === 'skipped'
                  ? []
                  : [{ status: observation.status }],
            },
          ],
        })),
      },
    ],
  });
  const rawWithParent = (phase: 'list' | 'run') => {
    const publication = raw(phase);
    if (parentTitle === '') return publication;
    return {
      ...publication,
      suites: publication.suites.map((suite) => ({
        ...suite,
        specs: [],
        suites: [{ title: parentTitle, file: caseFile, specs: suite.specs }],
      })),
    };
  };
  const fullTitle = (terminal: string) =>
    parentTitle === '' ? terminal : `${parentTitle} › ${terminal}`;
  const failureCount = observations.filter((observation) => observation.status === 'failed').length;
  const skippedCount = observations.filter(
    (observation) => observation.status === 'skipped',
  ).length;
  const outcomeXml = (status: 'passed' | 'failed' | 'skipped') =>
    status === 'passed' ? '' : status === 'failed' ? '<failure/>' : '<skipped/>';
  const discovery = JSON.stringify(rawWithParent('list'));
  const execution = JSON.stringify(rawWithParent('run'));
  const total = String(observations.length);
  const failures = String(failureCount);
  const skipped = String(skippedCount);
  const playwright = `<testsuites tests="${total}" failures="${failures}" errors="0" skipped="${skipped}"><testsuite name="${basename(caseFile)}" hostname="chromium">${observations.map((observation) => `<testcase name="${fullTitle(observation.title)}" classname="${basename(caseFile)}">${outcomeXml(observation.status)}</testcase>`).join('')}</testsuite></testsuites>`;
  const report = `<testsuite name="browser.ordinary" tests="${total}" failures="${failures}" errors="0" skipped="${skipped}">${observations.map((observation) => `<testcase classname="chromium" name="${fullTitle(observation.title)}" file="${caseFile}">${outcomeXml(observation.status)}</testcase>`).join('')}</testsuite>`;
  for (const [name, source] of [
    ['discovery.json', discovery],
    ['execution.json', execution],
    ['playwright.xml', playwright],
    ['report.xml', report],
  ] as const)
    writeFileSync(join(setup.browserBundle, name), source);
  // Fixture construction owns this raw-pin shape; publication mutation only replaces its digests.
  const bindings = setup.browserManifest['raw'] as {
    discovery: { digest: string };
    execution: { digest: string };
    junit: { digest: string };
  };
  bindings.discovery.digest = digestEvidenceBytes(discovery);
  bindings.execution.digest = digestEvidenceBytes(execution);
  bindings.junit.digest = digestEvidenceBytes(playwright);
  setup.browserManifest['reportDigest'] = digestEvidenceBytes(report);
  setup.browserManifest['cases'] = observations.map((observation) => ({
    config,
    project: 'chromium',
    file: caseFile,
    titlePath: parentTitle === '' ? [observation.title] : [parentTitle, observation.title],
    status: observation.status,
  }));
  setup.browserManifest['coverage'] = {
    passingCases: observations.filter((observation) => observation.status === 'passed').length,
    skippedDebt: skippedCount,
  };
  writeFileSync(join(setup.browserBundle, 'manifest.json'), JSON.stringify(setup.browserManifest));
}

/** Joins real Manual reports and Browser evidence over one committed selection without Performance execution. */
export function createBrowserLedgerManualFixture(
  outcome: 'passed' | 'failed' | 'skipped' = 'passed',
  overdue = false,
  stale = false,
) {
  const manual = createLedgerManualFixture(outcome, overdue, stale, {
    [config]: 'export default {}\n',
    [file]: 'throw new Error("Browser fixture executed");\n',
  });
  const setup = attachBrowserLedgerFixture(manual);
  const observation = inspectManualObservation(
    setup.root,
    setup.revision,
    setup.policyPath,
    manual.reportPath,
    new Date(manual.now),
  );
  // The fixture just wrote this closed authority; only its first known obligation is replaced.
  const authority = JSON.parse(readFileSync(setup.ledgerPath, 'utf8')) as {
    obligations: unknown[];
  };
  authority.obligations[0] = {
    scenarioId: 'EXAMPLE-001',
    disposition: {
      kind: 'manual',
      reportPath: manual.reportPath,
      observationDigest: observation.observationDigest,
    },
  };
  writeFileSync(setup.ledgerPath, JSON.stringify(authority));
  return { ...setup, observation, reportPath: manual.reportPath };
}
