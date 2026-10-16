import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  digestEvidenceBytes,
  digestPerformanceDeclaration,
  type PerformanceCases,
} from '@shared/test-evidence';

import { readCandidate } from '../inventory/read-candidate';
import { registeredRules } from '../rules/registry';
import { proposeScenarioAllocation } from '../rules/scenarios';
import { hashCanonical } from './content-manifest';
import { digestPerformanceCase } from './performance';

const scratch: string[] = [];
const invocationId = '11111111-1111-4111-8111-111111111111';
const projectRoot = 'apps/example';
const manifestPath = `${projectRoot}/project.json`;
const config = `${projectRoot}/playwright.performance.config.ts`;
const declarationPath = `${projectRoot}/playwright.performance.cases.json`;
const fixturePath = `${projectRoot}/src/architecture/f7.architecture.test.ts`;
const pointerPath = 'tmp/junit/wbs-fe-01.performance.current.json';
const baseDeclaration: PerformanceCases = {
  schemaVersion: 1,
  config,
  project: 'chromium',
  cases: [
    {
      caseId: 'cells',
      fixture: fixturePath,
      titlePath: ['[EXAMPLE-001] renders cells'],
      measurement: 'mounted-cells',
      unit: 'count',
      operator: 'lte',
      threshold: 20,
    },
  ],
};
function git(root: string, args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', root, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}
export function createPerformanceFixture(
  membership: 'none' | 'architecture' | 'conformance' | 'both' = 'none',
  multiple = false,
  shared = false,
  terminal = '[EXAMPLE-001] renders cells',
  extraSpec = '',
  extraFiles: Record<string, string> = {},
  retireSecond = false,
  includeScenarios = true,
  parentTitle = '',
) {
  const secondFixture = shared
    ? fixturePath
    : `${projectRoot}/src/architecture/mod-index.architecture.test.ts`;
  const declaration: PerformanceCases = {
    ...baseDeclaration,
    cases: multiple
      ? [
          {
            ...baseDeclaration.cases[0],
            caseId: 'zulu',
            fixture: secondFixture,
            titlePath:
              parentTitle === '' ? [terminal + ' second'] : [parentTitle, terminal + ' second'],
          },
          ...baseDeclaration.cases,
        ]
      : baseDeclaration.cases.map((entry) => ({
          ...entry,
          titlePath: parentTitle === '' ? [terminal] : [parentTitle, terminal],
        })),
  };
  const base = mkdtempSync(join(tmpdir(), 'burokrat-performance-'));
  scratch.push(base);
  const root = join(base, 'candidate');
  mkdirSync(root);
  git(root, ['init']);
  git(root, ['config', 'user.name', 'Performance Fixture']);
  git(root, ['config', 'user.email', 'performance@example.invalid']);
  mkdirSync(dirname(join(root, fixturePath)), { recursive: true });
  const targets =
    membership === 'conformance' || membership === 'both'
      ? {
          'test:conformance': {
            executor: 'nx:run-commands',
            cache: false,
            options: {
              command: 'bun test ./src/architecture/f7.architecture.test.ts --timeout=1000',
              cwd: projectRoot,
              forwardAllArgs: false,
            },
          },
        }
      : {};
  writeFileSync(join(root, manifestPath), JSON.stringify({ targets }));
  const architecturePath = `${projectRoot}/src/architecture-fixtures.json`;
  if (membership === 'architecture' || membership === 'both')
    writeFileSync(
      join(root, architecturePath),
      JSON.stringify({
        schemaVersion: 1,
        fixtures: [{ ruleId: 'F7', file: 'src/architecture/f7.architecture.test.ts' }],
      }),
    );
  writeFileSync(join(root, config), 'throw new Error("candidate config executed");\n');
  writeFileSync(join(root, declarationPath), JSON.stringify(declaration, null, 2));
  for (const performanceCase of declaration.cases)
    writeFileSync(
      join(root, performanceCase.fixture),
      'throw new Error("candidate fixture executed");\n',
    );
  mkdirSync(join(root, 'openspec/specs/example'), { recursive: true });
  writeFileSync(
    join(root, 'openspec/scenario-allocations.json'),
    JSON.stringify({ schemaVersion: 1, events: [] }),
  );
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'predecessor']);
  const baseRevision = git(root, ['rev-parse', 'HEAD']);
  const proposal = proposeScenarioAllocation(
    { schemaVersion: 1, events: [] },
    'openspec/specs/example/spec.md',
    '# Example\n\n## Requirements\n\n### Requirement: Rendering\n\n#### Scenario: renders cells\n- **WHEN** rendered\n- **THEN** bounded\n\n#### Scenario: second adopted case\n- **WHEN** rendered\n- **THEN** bounded\n',
  );
  writeFileSync(
    join(root, 'openspec/specs/example/spec.md'),
    (retireSecond
      ? proposal.specMarkdown.slice(
          0,
          proposal.specMarkdown.indexOf('#### Scenario: [EXAMPLE-002]'),
        )
      : proposal.specMarkdown) + extraSpec,
  );
  writeFileSync(
    join(root, 'openspec/scenario-allocations.json'),
    JSON.stringify(
      retireSecond
        ? {
            ...proposal.journal,
            events: [...proposal.journal.events, { kind: 'retire', id: 'EXAMPLE-002' }],
          }
        : proposal.journal,
    ),
  );
  for (const [path, content] of Object.entries(extraFiles)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'candidate']);
  const revision = git(root, ['rev-parse', 'HEAD']);
  const selected = readCandidate(root, { kind: 'committed', revision });
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const pin = (path: string) => ({
    path,
    digest: digestEvidenceBytes(readFileSync(join(root, path))),
  });
  const factsAuthority = {
    schemaVersion: 1,
    revision,
    candidate,
    scope: {
      projectRoot,
      projectManifest: pin(manifestPath),
      declaration: pin(declarationPath),
      config: pin(config),
      project: 'chromium',
      fixtures: [...new Set(declaration.cases.map((performanceCase) => performanceCase.fixture))],
    },
    manual: { kind: 'reviewed-empty' },
    conformance:
      membership === 'conformance' || membership === 'both'
        ? { kind: 'committed', ...pin(manifestPath) }
        : { kind: 'reviewed-empty' },
    architecture:
      membership === 'architecture' || membership === 'both'
        ? { kind: 'committed', ...pin(architecturePath) }
        : { kind: 'reviewed-empty' },
  };
  const authorityPath = join(base, 'facts-authority.json');
  writeFileSync(authorityPath, JSON.stringify(factsAuthority));
  const policyPath = join(base, 'rule-policy.json');
  const policy = {
    schemaVersion: 1,
    policyId: 'performance-fixture',
    ruleModes: registeredRules().map((rule) => ({ ruleId: rule.id, mode: 'observe' })),
    ...(includeScenarios ? { scenarios: { baseRevision } } : {}),
    performance: {
      acceptedDeclarationSchema: 1,
      declarationPath,
      config,
      configDigest: digestEvidenceBytes('throw new Error("candidate config executed");\n'),
      project: 'chromium',
      runnerVersion: '1.63.0',
      reviewedCases: declaration.cases.map((performanceCase) => ({
        caseId: performanceCase.caseId,
        caseDigest: digestPerformanceCase(performanceCase),
      })),
    },
  };
  writeFileSync(policyPath, JSON.stringify(policy));
  const policyDigest = digestEvidenceBytes(readFileSync(policyPath));
  const bundle = join(root, 'tmp/junit/performance', invocationId);
  mkdirSync(bundle, { recursive: true });
  const pointer = {
    schemaVersion: 1,
    certifies: false,
    invocationId,
    bundle: `tmp/junit/performance/${invocationId}`,
  };
  writeFileSync(join(root, pointerPath), JSON.stringify(pointer));
  const selection = {
    declarationPath,
    config,
    project: 'chromium',
    configDigest: policy.performance.configDigest,
    runnerVersion: '1.63.0',
    listArguments: [
      'test',
      '--config',
      config,
      '--project',
      'chromium',
      '--list',
      '--reporter=json',
    ],
    runArguments: ['test', '--config', config, '--project', 'chromium', '--reporter=json'],
    selectionEnvironment: { CI: '1', E2E_PORT_SHIFT: '6000' },
  };
  const run = {
    schemaVersion: 1,
    exitCode: 0,
    cases: declaration.cases.map((performanceCase) => ({
      caseId: performanceCase.caseId,
      status: 'passed',
      observations: [{ measurement: 'mounted-cells', unit: 'count', value: 10 }],
    })),
  };
  const evidence = {
    schemaVersion: 1,
    candidate,
    policyDigest,
    declarationDigest: digestPerformanceDeclaration(declaration),
    selection,
    run,
  };
  const raw = (phase: 'list' | 'run') => ({
    config: {
      configFile: `/historical/removed/candidate/${config}`,
      rootDir: '/historical/removed/candidate',
      version: '1.63.0',
      projects: [{ name: 'chromium' }],
    },
    errors: [],
    suites: declaration.cases.map((performanceCase) => {
      const specs = [
        {
          file: performanceCase.fixture,
          title: performanceCase.titlePath.at(-1),
          tests: [
            {
              projectName: 'chromium',
              status: phase === 'list' ? 'skipped' : 'expected',
              results:
                phase === 'list'
                  ? []
                  : [
                      {
                        status: 'passed',
                        attachments: [
                          {
                            name: 'puni.performance.observation.v1',
                            contentType: 'application/json',
                            body: Buffer.from(
                              JSON.stringify({
                                schemaVersion: 1,
                                caseId: performanceCase.caseId,
                                measurement: 'mounted-cells',
                                unit: 'count',
                                value: 10,
                              }),
                            ).toString('base64'),
                          },
                        ],
                      },
                    ],
            },
          ],
        },
      ];
      return parentTitle === ''
        ? { file: performanceCase.fixture, title: performanceCase.fixture, specs }
        : {
            file: performanceCase.fixture,
            title: performanceCase.fixture,
            specs: [],
            suites: [{ title: parentTitle, file: performanceCase.fixture, specs, suites: [] }],
          };
    }),
  });
  const report = `<testsuite name="wbs-fe-01.performance" tests="${String(declaration.cases.length)}" failures="0" errors="0" skipped="0">${declaration.cases.map((performanceCase) => `<testcase classname="${performanceCase.fixture}" file="${performanceCase.fixture}" name="${performanceCase.titlePath.join(' › ')}"/>`).join('')}</testsuite>`;
  const artifacts = {
    discovery: JSON.stringify(raw('list')),
    run: JSON.stringify(raw('run')),
    evidence: JSON.stringify(evidence),
    report,
  };
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    certifies: false,
    invocationId,
    candidate,
    revision,
    policyDigest,
    declarationDigest: evidence.declarationDigest,
    configDigest: selection.configDigest,
    selection,
    collected: declaration.cases.map(({ caseId, fixture, titlePath }) => ({
      caseId,
      fixture,
      titlePath,
    })),
  };
  for (const [field, source] of Object.entries(artifacts)) {
    const path = field === 'report' ? 'report.xml' : `${field === 'run' ? 'run' : field}.json`;
    writeFileSync(join(bundle, path), source);
    manifest[field] = { path, digest: digestEvidenceBytes(source) };
  }
  writeFileSync(join(bundle, 'manifest.json'), JSON.stringify(manifest));
  return {
    root,
    revision,
    policyPath,
    authorityPath,
    factsAuthority,
    bundle,
    manifest,
    policy,
    evidence,
  };
}
/** Removes each real candidate and external publication created by the current test. */
export function removePerformanceFixtures() {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
}
