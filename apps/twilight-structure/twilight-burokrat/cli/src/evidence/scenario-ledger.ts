import { lstatSync } from 'node:fs';
import { isAbsolute, parse, resolve, sep } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { resolveCandidateRoot } from '../inventory/read-candidate';
import { readExternalArtifact } from '../policy/trust';
import { compareCanonicalText, hashCanonical } from './content-manifest';
import { readEvaluationInstant } from './manual';
import { inspectManualObservation } from './manual-observation';
import { inspectPerformanceScenarios } from './performance-scenarios';

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
const LedgerAuthority = type({
  schemaVersion: '1',
  revision: type(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/),
  candidate: Digest,
  capability: 'string>=1',
  performanceObservationDigest: Digest,
  obligations: type({ scenarioId: ScenarioId, disposition: Disposition })
    .onUndeclaredKey('reject')
    .array(),
}).onUndeclaredKey('reject');

type ManualObservation = ReturnType<typeof inspectManualObservation>;
type Verdict =
  | { kind: 'unassigned' }
  | { kind: 'inapplicable'; reason: string }
  | { kind: 'unsupported-level'; level: string }
  | { kind: 'unobserved-in-selection' }
  | { kind: 'passing-in-selection'; caseIds: string[] }
  | { kind: 'manual'; observation: ManualObservation };
type Debt =
  | { kind: 'scenario'; scenarioId: string; verdict: string }
  | { kind: 'citation'; caseId: string; finding: string }
  | { kind: 'unidentified'; path: string; title: string };

function readAuthority(root: string, path: string) {
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
  const artifact = readExternalArtifact(root, path, 'scenario ledger authority');
  // Proof: nonfatal decoding accepted TEST-AXES-105's invalid byte inside a valid JSON reason.
  const source = new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes);
  const input: unknown = JSON.parse(source);
  return parseOrThrow(LedgerAuthority, input);
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

/**
 * Enumerates adopted effective capability scenarios from the real whole-tree B3 observation.
 * External obligations assign diagnostic dispositions; they never establish the scenario set.
 * Keeps complete upstream observations and all debt, with no coverage or admission authority.
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
) {
  const evaluatedInstant = readEvaluationInstant(evaluatedAt.toISOString()).toISOString();
  const performance = inspectPerformanceScenarios(
    repository,
    revision,
    policyPath,
    levelAuthorityPath,
    capability,
  );
  // Proof: broken Performance digest and substituted scope/boundaries failed TEST-AXES-105 CLI assertions when guards were removed.
  assertDigest(performance, 'Performance');
  if (
    performance.revision !== revision ||
    performance.capability !== capability ||
    !isDiagnostic(performance)
  )
    throw new Error('scenario ledger Performance scope or diagnostic boundary differs');
  const authority = readAuthority(resolveCandidateRoot(repository), ledgerAuthorityPath);
  // Proof: removing these joins accepted TEST-AXES-105's exact revision/candidate/capability substitutions.
  for (const field of ['revision', 'candidate', 'capability'] as const)
    if (authority[field] !== performance[field])
      throw new Error(`scenario ledger authority ${field} differs`);
  // Proof: removing this join accepted TEST-AXES-105's foreign Performance observation pin.
  if (authority.performanceObservationDigest !== performance.observationDigest)
    throw new Error('scenario ledger authority performanceObservationDigest differs');
  // Proof: disabling the comparator failed TEST-AXES-106's complete-envelope reorder assertion.
  const obligations = [...authority.obligations].sort((left, right) =>
    compareCanonicalText(left.scenarioId, right.scenarioId),
  );
  const active = new Set(performance.scenarios.map((scenario) => scenario.id));
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
  const scenarios = performance.scenarios.map((scenario) => {
    const disposition = assigned.get(scenario.id);
    let verdict: Verdict;
    // Proof: replacing unassigned with inapplicable failed TEST-AXES-104's missing obligation despite another passing row.
    if (disposition === undefined) verdict = { kind: 'unassigned' };
    else if (disposition.kind === 'inapplicable')
      verdict = { kind: 'inapplicable', reason: disposition.reason };
    else if (disposition.kind === 'automated') {
      // Proof: disabling this comparison credited TEST-AXES-104's Unit obligation with a Performance case.
      if (disposition.lowestSufficientLevel !== 'performance')
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
        observation.candidate !== performance.candidate ||
        observation.evaluatedAt !== evaluatedInstant ||
        observation.manual.policyDigest !== performance.policyDigest ||
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
    // Proof: disabling noncurrent Manual debt made TEST-AXES-107's real stale/failed/skipped/overdue CLI verdict assertions fail.
    if (
      verdict.kind === 'unassigned' ||
      verdict.kind === 'unsupported-level' ||
      verdict.kind === 'unobserved-in-selection' ||
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
  for (const finding of performance.citationFindings)
    debt.push({ kind: 'citation', caseId: finding.caseId, finding: finding.kind });
  for (const finding of performance.specifications.unidentified)
    debt.push({ kind: 'unidentified', ...finding });
  const observation = {
    schemaVersion: 1 as const,
    kind: 'scenario-ledger' as const,
    revision,
    candidate: performance.candidate,
    capability,
    evaluatedAt: evaluatedInstant,
    authority: { ...authority, obligations },
    authorityDigest: hashCanonical({ ...authority, obligations }),
    // Proof: dropping the upstream report or its B3 specifications failed TEST-AXES-106's complete-report assertion.
    performance,
    scenarios,
    debt,
    // Proof: changing authentication or certification failed TEST-AXES-106's complete-envelope CLI assertions.
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  // Proof: hashing an empty payload failed TEST-AXES-106's independently recomputed complete digest.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
