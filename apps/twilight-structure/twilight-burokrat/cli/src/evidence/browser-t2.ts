import { inspectBrowserScenarioLedger } from './browser-scenario-ledger';
import { compareCanonicalText, hashCanonical } from './content-manifest';
import { readEvaluationInstant } from './manual';
import type { ReportCase } from './test-reports';

type Ledger = ReturnType<typeof inspectBrowserScenarioLedger>;
type Citation =
  { kind: 'cited'; scenarioId: string } | { kind: 'missing' | 'malformed' | 'inactive' };

interface BrowserT2Observation {
  schemaVersion: 1;
  kind: 'browser-t2';
  revision: string;
  candidate: string;
  capability: string;
  evaluatedAt: string;
  scope: Ledger['browser']['scope'];
  policyId: string;
  policyDigest: string;
  ledgerObservationDigest: string;
  ledger: Ledger;
  cases: { case: ReportCase; citation: Citation }[];
  citationFindings: Ledger['browser']['citationFindings'];
  authentication: { kind: 'absent' };
  certifies: false;
  observationDigest: string;
}

function assertDigest(observation: { observationDigest: string }, subject: string): void {
  const { observationDigest, ...payload } = observation;
  // Proof: disabling full-payload hashing failed TEST-AXES-142's ledger-digest CLI negative.
  if (observationDigest !== hashCanonical(payload))
    throw new Error(`Browser T2 ${subject} digest differs from complete payload`);
}

/** Requires literal false without coercing malformed upstream certification markers. */
function isDiagnostic(observation: {
  authentication: { kind: string };
  certifies: unknown;
}): boolean {
  // Proof: removing authentication or coercing certification failed TEST-AXES-142's resealed marker negatives, including null/zero/empty.
  return observation.authentication.kind === 'absent' && observation.certifies === false;
}

function assertLedger(
  ledger: Ledger,
  revision: string,
  capability: string,
  evaluatedAt: string,
): void {
  const browser = ledger.browser;
  for (const [subject, observation] of [
    ['ledger', ledger],
    ['browser', browser],
    ['levels', browser.levels],
    ['report', browser.report],
  ] as const) {
    assertDigest(observation, subject);
    // Proof: each removed revision/candidate predicate failed its TEST-AXES-142 resealed dependency negative.
    if (
      observation.revision !== revision ||
      observation.candidate !== ledger.candidate ||
      !isDiagnostic(observation)
    )
      throw new Error(`Browser T2 ${subject} identity or diagnostic boundary differs`);
  }
  // Proof: independent ledger/Browser capability and instant removals failed their TEST-AXES-142 CLI negatives.
  if (
    ledger.capability !== capability ||
    browser.capability !== capability ||
    ledger.evaluatedAt !== evaluatedAt
  )
    throw new Error('Browser T2 capability or evaluation instant differs');
  // Proof: each removed mode/scope/policy predicate failed its TEST-AXES-142 coherently pinned CLI negative.
  if (
    browser.mode !== ledger.authority.browser.mode ||
    browser.report.mode !== browser.mode ||
    browser.levels.mode !== browser.mode ||
    browser.scope.mode !== browser.mode ||
    browser.scope.invocationId !== browser.report.invocationId ||
    browser.report.policyDigest !== browser.policyDigest
  )
    throw new Error('Browser T2 publication scope or policy differs');
  // Proof: each removed observation pin or nested-report equality failed its TEST-AXES-142 dependency negative.
  if (
    browser.observationDigest !== ledger.authority.browser.observationDigest ||
    browser.levelsObservationDigest !== browser.levels.observationDigest ||
    browser.reportObservationDigest !== browser.report.observationDigest ||
    hashCanonical(browser.levels.review.report) !== hashCanonical(browser.report)
  )
    throw new Error('Browser T2 Browser observation pins or nested report differ');
}

function readCitation(browserCase: ReportCase, active: ReadonlySet<string>): Citation {
  const title = browserCase.titlePath.at(-1);
  // Proof: guard removal lost TEST-AXES-142's named missing-terminal production refusal.
  if (title === undefined) throw new Error('Browser T2 terminal test title is absent');
  const match = /^\[([A-Z][A-Z0-9-]*-\d{3,})\] /.exec(title);
  if (match === null) return { kind: title.startsWith('[') ? 'malformed' : 'missing' };
  const scenarioId = match[1];
  // Proof: forcing membership true accepted TEST-AXES-142's inactive case moved into a complete cited partition.
  return active.has(scenarioId) ? { kind: 'cited', scenarioId } : { kind: 'inactive' };
}

function partitionCases(browser: Ledger['browser']) {
  const active = new Set(
    browser.specifications.selection.effective.flatMap((requirement) =>
      requirement.scenarios.flatMap((scenario) => (scenario.id === undefined ? [] : [scenario.id])),
    ),
  );
  const report = new Map<string, ReportCase>();
  for (const browserCase of browser.report.cases) {
    // Proof: guard removal accepted TEST-AXES-142's duplicated report case after complete digest resealing.
    if (report.has(browserCase.caseId))
      throw new Error(`Browser T2 duplicate report case: ${browserCase.caseId}`);
    report.set(browserCase.caseId, browserCase);
  }
  const citations = new Map<string, Citation>();
  const addCitation = (caseId: string, citation: Citation) => {
    // Proof: guard removal accepted TEST-AXES-142's duplicate cited case; duplicate findings use this same boundary.
    if (citations.has(caseId))
      throw new Error(`Browser T2 duplicate or conflicting citation case: ${caseId}`);
    citations.set(caseId, citation);
  };
  const groups = new Set<string>();
  for (const group of browser.citations) {
    // Proof: removing uniqueness or empty checks accepted TEST-AXES-142's disjoint duplicate groups or extra empty group.
    if (groups.has(group.id) || group.cases.length === 0)
      throw new Error(`Browser T2 duplicate or empty citation group: ${group.id}`);
    groups.add(group.id);
    for (const browserCase of group.cases) {
      const original = report.get(browserCase.caseId);
      // Proof: bypassing complete-case equality accepted TEST-AXES-142's altered cited outcome.
      if (original === undefined || hashCanonical(original) !== hashCanonical(browserCase))
        throw new Error(`Browser T2 cited case differs from report: ${browserCase.caseId}`);
      const citation = readCitation(original, active);
      // Proof: removal accepted TEST-AXES-142's active but mismatched scenario group.
      if (citation.kind !== 'cited' || citation.scenarioId !== group.id)
        throw new Error(
          `Browser T2 cited scenario differs from terminal title: ${browserCase.caseId}`,
        );
      addCitation(browserCase.caseId, citation);
    }
  }
  for (const finding of browser.citationFindings) {
    const original = report.get(finding.caseId);
    // Proof: removal lost TEST-AXES-142's named foreign-finding refusal.
    if (original === undefined)
      throw new Error(`Browser T2 finding case is absent from report: ${finding.caseId}`);
    const citation = readCitation(original, active);
    // Proof: individual kind/title/status removals accepted their TEST-AXES-142 coherently resealed finding faults.
    if (
      citation.kind !== finding.kind ||
      original.titlePath.at(-1) !== finding.title ||
      original.status !== finding.status
    )
      throw new Error(`Browser T2 citation finding differs from report: ${finding.caseId}`);
    addCitation(finding.caseId, citation);
  }
  // Proof: reversing order failed TEST-AXES-140's independently sorted complete-case assertion.
  return [...report.values()]
    .sort((left, right) => compareCanonicalText(left.caseId, right.caseId))
    .map((browserCase) => {
      const citation = citations.get(browserCase.caseId);
      // Proof: removal accepted TEST-AXES-142's omitted report case with an incomplete output row.
      if (citation === undefined)
        throw new Error(`Browser T2 citation partition omits report case: ${browserCase.caseId}`);
      return { case: browserCase, citation };
    });
}

/**
 * Consumes the real Browser-only scenario ledger as a noncertifying T2 citation diagnostic.
 * Retains every report case, original citation finding and complete ledger debt independently
 * of outcomes or obligations. A valid observation is successful even when it contains debt.
 * @throws when trusted input, ledger identities/digests or the complete citation partition differ.
 */
export function inspectBrowserT2(
  repository: string,
  revision: string,
  policyPath: string,
  capability: string,
  ledgerAuthorityPath: string,
  evaluatedAt: Date,
): BrowserT2Observation {
  const evaluatedInstant = readEvaluationInstant(evaluatedAt.toISOString()).toISOString();
  const ledger = inspectBrowserScenarioLedger(
    repository,
    revision,
    policyPath,
    capability,
    ledgerAuthorityPath,
    evaluatedAt,
  );
  assertLedger(ledger, revision, capability, evaluatedInstant);
  const cases = partitionCases(ledger.browser);
  const observation = {
    schemaVersion: 1 as const,
    kind: 'browser-t2' as const,
    revision,
    candidate: ledger.candidate,
    capability,
    evaluatedAt: evaluatedInstant,
    scope: ledger.browser.scope,
    policyId: ledger.browser.policyId,
    policyDigest: ledger.browser.policyDigest,
    ledgerObservationDigest: ledger.observationDigest,
    ledger,
    cases,
    citationFindings: ledger.browser.citationFindings,
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  return { ...observation, observationDigest: hashCanonical(observation) };
}
