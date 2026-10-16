import { lstatSync } from 'node:fs';
import { isAbsolute, parse, resolve, sep } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { readExternalArtifact } from '../policy/trust';
import { loadRulePolicyWithIdentity } from '../rules/rule-policy';
import { evaluateSpecifications } from '../rules/specifications';
import { inspectBrowserScenarios } from './browser-scenarios';
import { compareCanonicalText, hashCanonical } from './content-manifest';
import { readEvaluationInstant } from './manual';
import { inspectManualObservation } from './manual-observation';
import type { ReportCase } from './test-reports';

// Proof: widening Digest failed TEST-AXES-137's malformed candidate schema assertion.
const Digest = type(/^[0-9a-f]{64}$/);
// Proof: widening ScenarioId failed TEST-AXES-137's malformed scenarioId schema assertion.
const ScenarioId = type(/^[A-Z][A-Z0-9-]*-\d{3,}$/);
// Proof: opening disposition/level schemas or nested keys failed TEST-AXES-137 unknown-disposition/level/nested-key assertions.
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
// Proof: closed/required/version/revision/mode schema mutations failed TEST-AXES-137 authority shape assertions.
const LedgerAuthority = type({
  schemaVersion: '1',
  revision: type(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/),
  candidate: Digest,
  capability: 'string>=1',
  browser: type({
    mode: "'ordinary'|'packaged'|'portable'",
    reviewAuthorityPath: 'string>=1',
    conformanceAuthorityPath: 'string>=1',
    architectureAuthorityPath: 'string>=1',
    performanceAuthorityPath: 'string>=1',
    observationDigest: Digest,
  }).onUndeclaredKey('reject'),
  obligations: type({ scenarioId: ScenarioId, disposition: Disposition })
    .onUndeclaredKey('reject')
    .array(),
}).onUndeclaredKey('reject');
type LedgerAuthority = typeof LedgerAuthority.infer;

type ManualObservation = ReturnType<typeof inspectManualObservation>;
type Verdict =
  | { kind: 'unassigned' }
  | { kind: 'inapplicable'; reason: string }
  | { kind: 'unsupported-level'; level: string }
  | { kind: 'unobserved-in-selection' }
  | {
      kind: 'passing-in-selection' | 'failed-in-selection' | 'skipped-in-selection';
      cases: ReportCase[];
    }
  | { kind: 'manual'; observation: ManualObservation };
type Debt =
  | { kind: 'scenario'; scenarioId: string; verdict: string }
  | { kind: 'citation'; source: 'browser'; caseId: string; finding: string }
  | { kind: 'unidentified'; path: string; title: string };

function assertAuthorityPath(path: string): void {
  // Proof: removing canonical-path validation failed TEST-AXES-137 relative/noncanonical ledger authority assertions.
  if (!isAbsolute(path) || path !== resolve(path))
    throw new Error('scenario ledger authority path must be canonical absolute');
  const pathRoot = parse(path).root;
  let cursor = pathRoot;
  for (const segment of path.slice(pathRoot.length).split(sep)) {
    if (segment.length === 0) continue;
    cursor = resolve(cursor, segment);
    // Proof: removing the symlink guard failed TEST-AXES-137 final/ancestor symlink assertions.
    if (lstatSync(cursor).isSymbolicLink())
      throw new Error('scenario ledger authority contains a symlink');
  }
  // Proof: removing regular-file validation failed TEST-AXES-137 directory authority's named refusal.
  if (!lstatSync(path).isFile()) throw new Error('scenario ledger authority is not a regular file');
}

function readAuthorityArtifact(root: string, path: string) {
  assertAuthorityPath(path);
  const artifact = readExternalArtifact(root, path, 'scenario ledger authority');
  // Proof: nonfatal decoding accepted TEST-AXES-137's invalid UTF8 byte inside a valid JSON reason.
  const source = new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes);
  const input: unknown = JSON.parse(source);
  return input;
}

function readAuthority(root: string, path: string) {
  return parseOrThrow(LedgerAuthority, readAuthorityArtifact(root, path));
}

function assertDigest(observation: { observationDigest: string }, subject: string): void {
  const { observationDigest, ...payload } = observation;
  // Proof: disabling full-payload verification failed TEST-AXES-137 repinned Browser outer/levels/report and Manual digest fault assertions.
  if (observationDigest !== hashCanonical(payload))
    throw new Error(`${subject} observationDigest differs from complete payload`);
}

function isUncertified(observation: { certifies: boolean }): boolean {
  // Proof: accepting certification failed TEST-AXES-137 outer/nested Browser and Manual certification substitutions.
  return !observation.certifies;
}

function isDiagnostic(observation: {
  authentication: { kind: string };
  certifies: boolean;
}): boolean {
  // Proof: dropping authentication comparison failed TEST-AXES-137 Browser and Manual repinned authentication faults.
  return observation.authentication.kind === 'absent' && isUncertified(observation);
}

type BrowserObservation = ReturnType<typeof inspectBrowserScenarios>;
interface ScenarioSelection {
  revision: string;
  candidate: string;
  capability: string;
  policyId: string;
  policyDigest: string;
  specifications: ReturnType<typeof evaluateSpecifications>;
  scenarios: { id: string; title: string }[];
}

function readSelection(
  repository: string,
  revision: string,
  policyPath: string,
  capability: string,
): ScenarioSelection {
  // Proof: removing full-SHA validation failed TEST-AXES-137's HEAD selection assertion.
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(revision))
    throw new Error('Browser scenario ledger requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: removing each selected kind/revision predicate failed TEST-AXES-137 WATCH_selection broken-reader assertions.
  if (selected.selection.kind !== 'committed' || selected.selection.revision !== revision)
    throw new Error('Browser scenario ledger exact committed selection differs');
  // Proof: hashing an empty snapshot failed TEST-AXES-136's real committed positive command.
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const policy = loadRulePolicyWithIdentity(root, policyPath);
  // Proof: removing the missing-scenarios guard failed TEST-AXES-137's named policy.scenarios refusal.
  if (policy.policy.scenarios === undefined)
    throw new Error('Browser scenario ledger needs external policy.scenarios');
  // Proof: filtering change entries before the real B3 dependency failed TEST-AXES-139's unrelated competing-overlay assertion.
  const specifications = evaluateSpecifications(
    root,
    selected,
    policy.policy.scenarios,
    policy.digest,
    candidate,
  );
  const requirements = specifications.selection.effective.filter(
    (requirement) => requirement.capability === capability,
  );
  // Proof: removing the presence guard failed TEST-AXES-137's named absent-capability assertion.
  if (requirements.length === 0)
    throw new Error(`Browser scenario ledger capability is absent: ${capability}`);
  const scenarios = requirements
    .flatMap((requirement) => requirement.scenarios)
    .map((scenario) => {
      // Proof: removing the adopted-ID guard failed TEST-AXES-137's requested-unidentified assertion.
      if (scenario.id === undefined)
        throw new Error(
          `Browser scenario ledger requested capability has unidentified scenarios: ${capability}`,
        );
      return { id: scenario.id, title: scenario.title };
    })
    .sort((left, right) => compareCanonicalText(left.id, right.id));
  return {
    revision,
    candidate,
    capability,
    policyId: policy.policy.policyId,
    policyDigest: policy.digest,
    specifications,
    scenarios,
  };
}

interface ScenarioLedgerObservation {
  schemaVersion: 1;
  kind: 'browser-scenario-ledger';
  revision: string;
  candidate: string;
  capability: string;
  evaluatedAt: string;
  authority: LedgerAuthority;
  authorityDigest: string;
  browser: BrowserObservation;
  scenarios: { id: string; title: string; verdict: Verdict }[];
  debt: Debt[];
  authentication: { kind: 'absent' };
  certifies: false;
  observationDigest: string;
}

function assertBrowserJoin(
  browser: BrowserObservation,
  selection: ScenarioSelection,
  authority: LedgerAuthority,
): void {
  for (const [subject, observation] of [
    ['scenarios', browser],
    ['levels', browser.levels],
    ['report', browser.report],
  ] as const) {
    assertDigest(observation, `scenario ledger Browser ${subject}`);
    // Proof: removing each identity predicate failed TEST-AXES-137 WATCH outer/levels/report revision/candidate/mode faults.
    if (
      observation.revision !== selection.revision ||
      observation.candidate !== selection.candidate ||
      observation.mode !== authority.browser.mode ||
      !isDiagnostic(observation)
    )
      throw new Error(`scenario ledger Browser ${subject} identity or diagnostic boundary differs`);
  }
  // Proof: each removed capability/policy predicate failed its coherently repinned TEST-AXES-137 Browser dependency assertion.
  if (
    browser.capability !== selection.capability ||
    browser.policyId !== selection.policyId ||
    browser.policyDigest !== selection.policyDigest ||
    browser.report.policyDigest !== selection.policyDigest
  )
    throw new Error('scenario ledger Browser capability or policy differs');
  // Proof: scope mode/invocation and isolation predicate removals failed TEST-AXES-137 WATCH scope/isolation assertions.
  if (
    browser.scope.mode !== authority.browser.mode ||
    browser.scope.invocationId !== browser.report.invocationId ||
    browser.levels.isolation.kind !== 'isolated'
  )
    throw new Error('scenario ledger Browser publication scope or isolation differs');
  // Proof: removing outer/levels/report pins or nested report equality failed TEST-AXES-137 wrong-pin/WATCH dependency assertions.
  if (
    browser.observationDigest !== authority.browser.observationDigest ||
    browser.levelsObservationDigest !== browser.levels.observationDigest ||
    browser.reportObservationDigest !== browser.report.observationDigest ||
    hashCanonical(browser.levels.review.report) !== hashCanonical(browser.report)
  )
    throw new Error('scenario ledger Browser observation pins or nested report differ');
  // Proof: removing complete B3 or inventory equality accepted TEST-AXES-137 WATCH_B3 report/scenario inventory/title faults.
  if (
    hashCanonical(browser.specifications) !== hashCanonical(selection.specifications) ||
    hashCanonical(browser.scenarios.map(({ id, title }) => ({ id, title }))) !==
      hashCanonical(selection.scenarios.map(({ id, title }) => ({ id, title })))
  )
    throw new Error('scenario ledger Browser complete B3 report or scenario inventory differs');
}

/**
 * Applies external diagnostic obligations to real isolated Browser scenarios without Performance execution evidence.
 * Independently joins the exact committed B3 inventory, policy, report and levels before assigning every requested row.
 * Browser Performance membership remains mandatory. Manual dispositions use real pinned observations at the supplied instant.
 * Retains outcomes and whole-tree debt; never establishes coverage, authentication or admission.
 * @throws when trusted authorities, evidence or complete observation identities cannot be joined.
 */
export function inspectBrowserScenarioLedger(
  repository: string,
  revision: string,
  policyPath: string,
  capability: string,
  ledgerAuthorityPath: string,
  evaluatedAt: Date,
): ScenarioLedgerObservation {
  const evaluatedInstant = readEvaluationInstant(evaluatedAt.toISOString()).toISOString();
  const scenarioReport = readSelection(repository, revision, policyPath, capability);
  const authority = readAuthority(resolveCandidateRoot(repository), ledgerAuthorityPath);
  for (const field of ['revision', 'candidate', 'capability'] as const)
    // Proof: removing exact authority identity failed TEST-AXES-137 revision/candidate/capability substitution assertions.
    if (authority[field] !== scenarioReport[field])
      throw new Error(`scenario ledger authority ${field} differs`);
  // Proof: skipping these strict checks failed all four TEST-AXES-137 noncanonical Browser authority path assertions, including empty obligations.
  for (const path of [
    authority.browser.reviewAuthorityPath,
    authority.browser.conformanceAuthorityPath,
    authority.browser.architectureAuthorityPath,
    authority.browser.performanceAuthorityPath,
  ])
    assertAuthorityPath(path);
  // Proof: TEST-AXES-137 corrupts real Manual membership even without Browser obligations; the real inspector refuses.
  const browser = inspectBrowserScenarios(
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
  // Proof: disabling obligation sorting failed TEST-AXES-136's complete-envelope reorder assertion.
  const obligations = [...authority.obligations].sort((left, right) =>
    compareCanonicalText(left.scenarioId, right.scenarioId),
  );
  const active = new Set(scenarioReport.scenarios.map((scenario) => scenario.id));
  const assigned = new Map<string, (typeof obligations)[number]['disposition']>();
  for (const obligation of obligations) {
    // Proof: removing adopted membership failed TEST-AXES-137's foreign obligation refusal.
    if (!active.has(obligation.scenarioId))
      throw new Error(`scenario ledger foreign or retired scenario: ${obligation.scenarioId}`);
    // Proof: removing uniqueness failed TEST-AXES-137's duplicate obligation refusal.
    if (assigned.has(obligation.scenarioId))
      throw new Error(`scenario ledger duplicate obligation: ${obligation.scenarioId}`);
    // Proof: dropping the trimmed reason check accepted TEST-AXES-137's whitespace-only reason.
    if (
      obligation.disposition.kind === 'inapplicable' &&
      obligation.disposition.reason.trim().length === 0
    )
      throw new Error(`scenario ledger inapplicable reason is blank: ${obligation.scenarioId}`);
    assigned.set(obligation.scenarioId, obligation.disposition);
  }
  const debt: Debt[] = [];
  // Proof: truncating ledger rows failed TEST-AXES-138's complete omitted-obligation verdict inventory.
  const scenarios = scenarioReport.scenarios.map((scenario, index) => {
    const disposition = assigned.get(scenario.id);
    let verdict: Verdict;
    // Proof: inventing an inapplicable disposition failed TEST-AXES-138's named unassigned/debt assertion.
    if (disposition === undefined) verdict = { kind: 'unassigned' };
    else if (disposition.kind === 'inapplicable')
      verdict = { kind: 'inapplicable', reason: disposition.reason };
    else if (disposition.kind === 'automated') {
      // Proof: widening Browser credit failed TEST-AXES-138's six unsupported automated-level assertions.
      if (disposition.lowestSufficientLevel === 'browser') {
        // The complete inventories were joined before assignments; index lookup follows that identity.
        const selected = browser.scenarios[index];
        // Proof: promoting absence to passing failed TEST-AXES-138's unobserved/debt assertion.
        if (selected.observation.kind === 'unobserved-in-selection')
          verdict = { kind: 'unobserved-in-selection' };
        else {
          // Proof: truncating cases failed TEST-AXES-138's complete passed/passed observation assertion.
          const cases = selected.observation.cases;
          // Proof: removing failed/skipped outcome branches failed TEST-AXES-138's mixed-outcome precedence/debt assertions.
          const kind = cases.some((entry) => entry.status === 'failed')
            ? 'failed-in-selection'
            : cases.some((entry) => entry.status === 'skipped')
              ? 'skipped-in-selection'
              : 'passing-in-selection';
          verdict = { kind, cases };
        }
      } else verdict = { kind: 'unsupported-level', level: disposition.lowestSufficientLevel };
    } else {
      const observation = inspectManualObservation(
        repository,
        revision,
        policyPath,
        disposition.reportPath,
        evaluatedAt,
      );
      assertDigest(observation, 'Manual');
      // Proof: each removed identity/instant/policy/scenario/title/pin predicate failed TEST-AXES-137's repinned Manual substitution or foreign-pin assertion.
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
    // Proof: suppressing each Browser/unassigned/unsupported/absent debt kind or noncurrent Manual debt failed TEST-AXES-138 outcome/CLI assertions.
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
  // Proof: dropping citation debt or changing its source label failed TEST-AXES-138's exact once-labelled Browser debt assertion.
  for (const finding of browser.citationFindings)
    debt.push({
      kind: 'citation',
      source: 'browser',
      caseId: finding.caseId,
      finding: finding.kind,
    });
  // Proof: dropping whole-tree unidentified debt failed TEST-AXES-138's unrelated B3 debt assertion.
  for (const finding of scenarioReport.specifications.unidentified)
    debt.push({ kind: 'unidentified', ...finding });
  const observation = {
    schemaVersion: authority.schemaVersion,
    kind: 'browser-scenario-ledger' as const,
    revision,
    candidate: scenarioReport.candidate,
    capability,
    evaluatedAt: evaluatedInstant,
    authority: { ...authority, obligations },
    authorityDigest: hashCanonical({ ...authority, obligations }),
    // Proof: omitting the complete upstream Browser observation failed TEST-AXES-136's real-inspector equality assertion.
    browser,
    scenarios,
    debt,
    // Proof: independently promoting authentication or certification failed TEST-AXES-136's diagnostic envelope assertions.
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  // Proof: hashing an empty envelope failed TEST-AXES-136's independently recomputed complete digest.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
