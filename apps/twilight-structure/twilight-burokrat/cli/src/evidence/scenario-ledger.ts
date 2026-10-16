import { lstatSync } from 'node:fs';
import { isAbsolute, parse, resolve, sep } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { resolveCandidateRoot } from '../inventory/read-candidate';
import { readExternalArtifact } from '../policy/trust';
import { inspectBrowserScenarios } from './browser-scenarios';
import { compareCanonicalText, hashCanonical } from './content-manifest';
import { readEvaluationInstant } from './manual';
import { inspectManualObservation } from './manual-observation';
import { inspectPerformanceScenarios } from './performance-scenarios';
import type { ReportCase } from './test-reports';

const Digest = type(/^[0-9a-f]{64}$/);
// Proof: widening the ID shape lost TEST-AXES-105's named malformed scenarioId schema refusal.
const ScenarioId = type(/^[A-Z][A-Z0-9-]*-\d{3,}$/);
// Proof: widening inapplicable.kind lost TEST-AXES-105's named unknown-disposition schema refusal; ignoring closed keys accepted its nested extra field.
const Disposition = type.or(
  type({
    kind: "'automated'",
    lowestSufficientLevel:
      "'manual'|'conformance'|'architecture'|'performance'|'browser'|'api'|'unit'",
  }).onUndeclaredKey('reject'),
  type({ kind: "'inapplicable'", reason: 'string>=1' }).onUndeclaredKey('reject'),
  type({ kind: "'manual'", reportPath: 'string>=1', observationDigest: Digest }).onUndeclaredKey(
    'reject',
  ),
);
// Proof: widening version and ignoring undeclared keys failed TEST-AXES-105 version/extra-field assertions.
const LedgerAuthorityV1 = type({
  schemaVersion: '1',
  revision: type(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/),
  candidate: Digest,
  capability: 'string>=1',
  performanceObservationDigest: Digest,
  obligations: type({ scenarioId: ScenarioId, disposition: Disposition })
    .onUndeclaredKey('reject')
    .array(),
}).onUndeclaredKey('reject');

// Proof: optional Browser, ignored outer/nested extra keys and widened mode each failed TEST-AXES-133 closed-authority assertions.
const LedgerAuthorityV2 = LedgerAuthorityV1.omit('schemaVersion')
  .merge({
    schemaVersion: '2',
    browser: type({
      mode: "'ordinary'|'packaged'|'portable'",
      reviewAuthorityPath: 'string>=1',
      conformanceAuthorityPath: 'string>=1',
      architectureAuthorityPath: 'string>=1',
      performanceAuthorityPath: 'string>=1',
      observationDigest: Digest,
    }).onUndeclaredKey('reject'),
  })
  .onUndeclaredKey('reject');
type LedgerAuthority = typeof LedgerAuthorityV1.infer | typeof LedgerAuthorityV2.infer;

type ManualObservation = ReturnType<typeof inspectManualObservation>;
type Verdict =
  | { kind: 'unassigned' }
  | { kind: 'inapplicable'; reason: string }
  | { kind: 'unsupported-level'; level: string }
  | { kind: 'unobserved-in-selection' }
  | { kind: 'passing-in-selection'; caseIds: string[] }
  | {
      kind: 'passing-in-selection' | 'failed-in-selection' | 'skipped-in-selection';
      cases: ReportCase[];
    }
  | { kind: 'manual'; observation: ManualObservation };
type Debt =
  | { kind: 'scenario'; scenarioId: string; verdict: string }
  | { kind: 'citation'; source?: 'performance' | 'browser'; caseId: string; finding: string }
  | { kind: 'unidentified'; path: string; title: string };

function assertAuthorityPath(path: string): void {
  // Proof: removing this condition failed TEST-AXES-105's noncanonical authority-path assertion.
  if (!isAbsolute(path) || path !== resolve(path))
    throw new Error('scenario ledger authority path must be canonical absolute');
  const pathRoot = parse(path).root;
  let cursor = pathRoot;
  for (const segment of path.slice(pathRoot.length).split(sep)) {
    if (segment.length === 0) continue;
    cursor = resolve(cursor, segment);
    // Proof: removing this check lost TEST-AXES-105's named symlink refusal.
    if (lstatSync(cursor).isSymbolicLink())
      throw new Error('scenario ledger authority contains a symlink');
  }
  // Proof: removing this check lost TEST-AXES-105's named nonregular-file refusal.
  if (!lstatSync(path).isFile()) throw new Error('scenario ledger authority is not a regular file');
}

function readAuthorityArtifact(root: string, path: string) {
  assertAuthorityPath(path);
  const artifact = readExternalArtifact(root, path, 'scenario ledger authority');
  // Proof: nonfatal decoding accepted TEST-AXES-105's invalid byte inside a valid JSON reason.
  const source = new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes);
  const input: unknown = JSON.parse(source);
  return input;
}

function readAuthority(root: string, path: string) {
  const input = readAuthorityArtifact(root, path);
  // Proof: ignoring v1 extra fields failed TEST-AXES-132 exact-refusal assertion; forcing schema 2 failed its v1 envelope assertion.
  if (
    typeof input === 'object' &&
    input !== null &&
    'schemaVersion' in input &&
    input.schemaVersion === 2
  )
    return parseOrThrow(LedgerAuthorityV2, input);
  return parseOrThrow(LedgerAuthorityV1, input);
}

function assertDigest(observation: { observationDigest: string }, subject: string): void {
  const { observationDigest, ...payload } = observation;
  // Proof: removing the complete-payload comparison accepted repinned broken Manual/Performance digests in TEST-AXES-105/107.
  if (observationDigest !== hashCanonical(payload))
    throw new Error(`${subject} observationDigest differs from complete payload`);
}

// Proof: replacing this predicate with true accepted TEST-AXES-107/105's outer/nested certification substitutions.
function isUncertified(observation: { certifies: boolean }): boolean {
  return !observation.certifies;
}

// Proof: dropping authentication comparison accepted TEST-AXES-107/105's repinned authentication substitutions.
function isDiagnostic(observation: {
  authentication: { kind: string };
  certifies: boolean;
}): boolean {
  return observation.authentication.kind === 'absent' && isUncertified(observation);
}

type BrowserObservation = ReturnType<typeof inspectBrowserScenarios>;
type PerformanceObservation = ReturnType<typeof inspectPerformanceScenarios>;

interface ScenarioLedgerObservation {
  schemaVersion: 1 | 2;
  kind: 'scenario-ledger';
  revision: string;
  candidate: string;
  capability: string;
  evaluatedAt: string;
  authority: LedgerAuthority;
  authorityDigest: string;
  performance: PerformanceObservation;
  browser?: BrowserObservation;
  scenarios: { id: string; title: string; verdict: Verdict }[];
  debt: Debt[];
  authentication: { kind: 'absent' };
  certifies: false;
  observationDigest: string;
}

function assertBrowserJoin(
  browser: BrowserObservation,
  performance: PerformanceObservation,
  authority: LedgerAuthority & { schemaVersion: 2 },
): void {
  // Proof: removing this digest verification failed TEST-AXES-133 WATCH_outer/levels/report digest assertions after coherent repinning.
  for (const [subject, observation] of [
    ['scenarios', browser],
    ['levels', browser.levels],
    ['report', browser.report],
  ] as const) {
    assertDigest(observation, `scenario ledger Browser ${subject}`);
    // Proof: each removed identity/diagnostic predicate failed its TEST-AXES-133 WATCH revision/candidate/mode/authentication/certification assertions.
    if (
      observation.revision !== performance.revision ||
      observation.candidate !== performance.candidate ||
      observation.mode !== authority.browser.mode ||
      !isDiagnostic(observation)
    )
      throw new Error(`scenario ledger Browser ${subject} identity or diagnostic boundary differs`);
  }
  // Proof: each removed capability/policy predicate failed its TEST-AXES-133 WATCH capability/policy/policy id/report policy assertion.
  if (
    browser.capability !== performance.capability ||
    browser.policyId !== performance.policyId ||
    browser.policyDigest !== performance.policyDigest ||
    browser.report.policyDigest !== performance.policyDigest
  )
    throw new Error('scenario ledger Browser capability or policy differs');
  // Proof: TEST-AXES-133 WATCH scope mode/invocation and isolation faults were accepted before this guard.
  if (
    browser.scope.mode !== authority.browser.mode ||
    browser.scope.invocationId !== browser.report.invocationId ||
    browser.levels.isolation.kind !== 'isolated'
  )
    throw new Error('scenario ledger Browser publication scope or isolation differs');
  // Proof: removing each pin/report predicate failed TEST-AXES-133 wrong-pin or WATCH_levels/report pin/nested report identity assertions.
  if (
    browser.observationDigest !== authority.browser.observationDigest ||
    browser.levelsObservationDigest !== browser.levels.observationDigest ||
    browser.reportObservationDigest !== browser.report.observationDigest ||
    hashCanonical(browser.levels.review.report) !== hashCanonical(browser.report)
  )
    throw new Error('scenario ledger Browser observation pins or nested report differ');
  // Proof: removing B3 equality or inventory equality failed TEST-AXES-133 WATCH_B3 report/scenario inventory/title assertions.
  if (
    hashCanonical(browser.specifications) !== hashCanonical(performance.specifications) ||
    hashCanonical(browser.scenarios.map(({ id, title }) => ({ id, title }))) !==
      hashCanonical(performance.scenarios.map(({ id, title }) => ({ id, title })))
  )
    throw new Error('scenario ledger Browser complete B3 report or scenario inventory differs');
}

/**
 * Enumerates adopted effective capability scenarios from the real whole-tree B3 observation.
 * External obligations assign diagnostic dispositions; they never establish the scenario set.
 * Version two always joins real Browser scenarios to the same complete B3 report before obligations.
 * Keeps complete upstream observations, Browser case outcomes and all debt, with no coverage or admission authority.
 * @throws when external authority, source selection, evidence or exact observation joins fail.
 */
export function inspectScenarioLedger(
  repository: string,
  revision: string,
  policyPath: string,
  levelAuthorityPath: string,
  capability: string,
  ledgerAuthorityPath: string,
  evaluatedAt: Date,
): ScenarioLedgerObservation {
  const evaluatedInstant = readEvaluationInstant(evaluatedAt.toISOString()).toISOString();
  const scenarioReport = inspectPerformanceScenarios(
    repository,
    revision,
    policyPath,
    levelAuthorityPath,
    capability,
  );
  // Proof: broken Performance digest and substituted scope/boundaries failed TEST-AXES-105 CLI assertions when guards were removed.
  assertDigest(scenarioReport, 'Performance');
  if (
    scenarioReport.revision !== revision ||
    scenarioReport.capability !== capability ||
    !isDiagnostic(scenarioReport)
  )
    throw new Error('scenario ledger Performance scope or diagnostic boundary differs');
  const authority = readAuthority(resolveCandidateRoot(repository), ledgerAuthorityPath);
  // Proof: removing these joins accepted TEST-AXES-105's exact revision/candidate/capability substitutions.
  for (const field of ['revision', 'candidate', 'capability'] as const)
    if (authority[field] !== scenarioReport[field])
      throw new Error(`scenario ledger authority ${field} differs`);
  // Proof: removing this join accepted TEST-AXES-105's foreign Performance observation pin.
  if (authority.performanceObservationDigest !== scenarioReport.observationDigest)
    throw new Error('scenario ledger authority performanceObservationDigest differs');
  let browser: BrowserObservation | undefined;
  if (authority.schemaVersion === 2) {
    // Proof: skipping this strict path check accepted noncanonical authority paths and failed TEST-AXES-133 Browser review authority-path assertion.
    for (const path of [
      authority.browser.reviewAuthorityPath,
      authority.browser.conformanceAuthorityPath,
      authority.browser.architectureAuthorityPath,
      authority.browser.performanceAuthorityPath,
    ])
      assertAuthorityPath(path);
    browser = inspectBrowserScenarios(
      repository,
      revision,
      policyPath,
      authority.browser.mode,
      authority.browser.reviewAuthorityPath,
      authority.browser.conformanceAuthorityPath,
      authority.browser.architectureAuthorityPath,
      authority.browser.performanceAuthorityPath,
      capability,
    );
    assertBrowserJoin(browser, scenarioReport, authority);
  }
  // Proof: disabling the comparator failed TEST-AXES-106's complete-envelope reorder assertion.
  const obligations = [...authority.obligations].sort((left, right) =>
    compareCanonicalText(left.scenarioId, right.scenarioId),
  );
  const active = new Set(scenarioReport.scenarios.map((scenario) => scenario.id));
  const assigned = new Map<string, (typeof obligations)[number]['disposition']>();
  for (const obligation of obligations) {
    // Proof: removing membership refusal accepted TEST-AXES-105's foreign and retired obligation IDs.
    if (!active.has(obligation.scenarioId))
      throw new Error(`scenario ledger foreign or retired scenario: ${obligation.scenarioId}`);
    // Proof: removing uniqueness accepted TEST-AXES-105's conflicting duplicate obligations.
    if (assigned.has(obligation.scenarioId))
      throw new Error(`scenario ledger duplicate obligation: ${obligation.scenarioId}`);
    // Proof: removing this predicate accepted TEST-AXES-105's whitespace-only inapplicability reason.
    if (
      obligation.disposition.kind === 'inapplicable' &&
      obligation.disposition.reason.trim().length === 0
    )
      throw new Error(`scenario ledger inapplicable reason is blank: ${obligation.scenarioId}`);
    assigned.set(obligation.scenarioId, obligation.disposition);
  }
  const debt: Debt[] = [];
  const scenarios = scenarioReport.scenarios.map((scenario, index) => {
    const disposition = assigned.get(scenario.id);
    let verdict: Verdict;
    // Proof: replacing unassigned with inapplicable failed TEST-AXES-104's missing obligation despite another passing row.
    if (disposition === undefined) verdict = { kind: 'unassigned' };
    else if (disposition.kind === 'inapplicable')
      verdict = { kind: 'inapplicable', reason: disposition.reason };
    else if (disposition.kind === 'automated') {
      // Proof: widening Browser credit to every automated level failed TEST-AXES-134's cross-level assertion; disabling the Performance comparison failed TEST-AXES-104's Unit guard.
      if (disposition.lowestSufficientLevel === 'browser' && browser !== undefined) {
        // The complete inventories were joined before assignments; index lookup follows that identity.
        const selected = browser.scenarios[index];
        // Proof: forcing failed/skipped cases or unobserved rows to pass failed TEST-AXES-134 outcome/debt assertions; complete cases remain in every observed verdict.
        if (selected.observation.kind === 'unobserved-in-selection')
          verdict = { kind: 'unobserved-in-selection' };
        else {
          const cases = selected.observation.cases;
          const kind = cases.some((entry) => entry.status === 'failed')
            ? 'failed-in-selection'
            : cases.some((entry) => entry.status === 'skipped')
              ? 'skipped-in-selection'
              : 'passing-in-selection';
          verdict = { kind, cases };
        }
      } else if (disposition.lowestSufficientLevel !== 'performance')
        verdict = { kind: 'unsupported-level', level: disposition.lowestSufficientLevel };
      else if (scenario.observation.kind === 'passing')
        verdict = { kind: 'passing-in-selection', caseIds: scenario.observation.caseIds };
      else verdict = { kind: 'unobserved-in-selection' };
    } else {
      const observation = inspectManualObservation(
        repository,
        revision,
        policyPath,
        disposition.reportPath,
        evaluatedAt,
      );
      // Proof: individual guard removals accepted repinned outer/nested revision, candidate, instant, policy, scenario, title and digest substitutions in TEST-AXES-107.
      assertDigest(observation, 'Manual');
      if (
        observation.revision !== revision ||
        observation.manual.revision !== revision ||
        observation.candidate !== scenarioReport.candidate ||
        observation.evaluatedAt !== evaluatedInstant ||
        observation.manual.policyDigest !== scenarioReport.policyDigest ||
        observation.manual.scenarioId !== scenario.id ||
        observation.manual.selectedScenario.id !== scenario.id ||
        observation.manual.selectedScenario.title !== scenario.title ||
        observation.observationDigest !== disposition.observationDigest ||
        !isDiagnostic(observation) ||
        !isUncertified(observation.manual)
      )
        throw new Error(`scenario ledger Manual observation join differs: ${scenario.id}`);
      verdict = { kind: 'manual', observation };
    }
    // Proof: suppressing failed/skipped Browser debt failed TEST-AXES-134 outcome/exit assertions; disabling noncurrent Manual debt made TEST-AXES-107's real stale/failed/skipped/overdue CLI verdict assertions fail.
    if (
      verdict.kind === 'unassigned' ||
      verdict.kind === 'unsupported-level' ||
      verdict.kind === 'unobserved-in-selection' ||
      verdict.kind === 'failed-in-selection' ||
      verdict.kind === 'skipped-in-selection' ||
      (verdict.kind === 'manual' && verdict.observation.manual.state !== 'current')
    )
      debt.push({
        kind: 'scenario',
        scenarioId: scenario.id,
        verdict: verdict.kind === 'manual' ? verdict.observation.manual.state : verdict.kind,
      });
    return { id: scenario.id, title: scenario.title, verdict };
  });
  // Proof: dropping citation or unidentified debt failed TEST-AXES-106's lost-citation/unrelated-B3 assertions.
  for (const finding of scenarioReport.citationFindings)
    debt.push({
      kind: 'citation',
      ...(authority.schemaVersion === 2 ? { source: 'performance' as const } : {}),
      caseId: finding.caseId,
      finding: finding.kind,
    });
  // Proof: removing either citation source label failed TEST-AXES-134 labelled-debt assertion; shared B3 debt remains once.
  if (browser !== undefined)
    for (const finding of browser.citationFindings)
      debt.push({
        kind: 'citation',
        source: 'browser',
        caseId: finding.caseId,
        finding: finding.kind,
      });
  for (const finding of scenarioReport.specifications.unidentified)
    debt.push({ kind: 'unidentified', ...finding });
  const observation = {
    schemaVersion: authority.schemaVersion,
    kind: 'scenario-ledger' as const,
    revision,
    candidate: scenarioReport.candidate,
    capability,
    evaluatedAt: evaluatedInstant,
    authority: { ...authority, obligations },
    authorityDigest: hashCanonical({ ...authority, obligations }),
    // Proof: dropping the upstream report or its B3 specifications failed TEST-AXES-106's complete-report assertion.
    performance: scenarioReport,
    // Proof: omitting Browser failed TEST-AXES-132 complete upstream-observation assertion.
    ...(browser === undefined ? {} : { browser }),
    scenarios,
    debt,
    // Proof: changing authentication or certification failed TEST-AXES-106's complete-envelope CLI assertions.
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  // Proof: hashing an empty payload failed TEST-AXES-106/132 independently recomputed complete-digest assertions.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
