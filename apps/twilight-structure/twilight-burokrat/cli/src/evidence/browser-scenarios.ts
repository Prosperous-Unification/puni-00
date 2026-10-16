import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { loadRulePolicyWithIdentity } from '../rules/rule-policy';
import { evaluateSpecifications } from '../rules/specifications';
import { inspectBrowserLevels } from './browser-levels';
import { compareCanonicalText, hashCanonical } from './content-manifest';
import type { inspectTestReports, ReportCase } from './test-reports';

interface CitationFinding {
  caseId: string;
  kind: 'missing' | 'malformed' | 'inactive';
  title: string;
  status: ReportCase['status'];
}

type BrowserMode = 'ordinary' | 'packaged' | 'portable';
interface ScenarioObservation {
  id: string;
  title: string;
  observation: { kind: 'unobserved-in-selection' } | { kind: 'observed'; cases: ReportCase[] };
}
interface BrowserScenariosObservation {
  schemaVersion: 1;
  kind: 'browser-scenarios';
  revision: string;
  candidate: string;
  mode: BrowserMode;
  capability: string;
  scope: { kind: 'selected-browser-publication'; mode: BrowserMode; invocationId: string };
  policyId: string;
  policyDigest: string;
  levelsObservationDigest: string;
  reportObservationDigest: string;
  levels: ReturnType<typeof inspectBrowserLevels>;
  report: ReturnType<typeof inspectTestReports>;
  specifications: ReturnType<typeof evaluateSpecifications>;
  scenarios: ScenarioObservation[];
  citations: { id: string; cases: ReportCase[] }[];
  citationFindings: CitationFinding[];
  authentication: { kind: 'absent' };
  certifies: false;
  observationDigest: string;
}

function assertDigest(observation: { observationDigest: string }, subject: string): void {
  const { observationDigest, ...payload } = observation;
  // Proof: disabling verification lost TEST-AXES-130 WATCH_levels-digest and WATCH_report-digest refusals.
  if (hashCanonical(payload) !== observationDigest)
    throw new Error(`Browser scenarios ${subject} digest is invalid`);
}

/**
 * Joins the real isolated Browser collection with complete B3 active specifications before
 * filtering a capability. Terminal citations retain complete cases and their recorded outcomes;
 * unobserved rows describe this selection alone. Reads Git blobs without executing candidate code.
 * @throws when authority, selected identity, canonical digests, isolation or adopted requested
 * scenario identities cannot be joined. No coverage, authentication or admission follows.
 */
export function inspectBrowserScenarios(
  repository: string,
  revision: string,
  policyPath: string,
  mode: BrowserMode,
  reviewPath: string,
  conformancePath: string,
  architecturePath: string,
  performancePath: string,
  capability: string,
): BrowserScenariosObservation {
  // Proof: removing this guard lost TEST-AXES-130's named symbolic-selection refusal.
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(revision))
    throw new Error('Browser scenarios selection requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: removal lost TEST-AXES-130 WATCH_committed's broken-reader refusal.
  if (selected.selection.kind !== 'committed')
    throw new Error('Browser scenarios selection is not committed');
  // Proof: removal lost TEST-AXES-130's named annotated tag-object refusal.
  if (selected.selection.revision !== revision)
    throw new Error('Browser scenarios selected revision differs from requested SHA');
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const levels = inspectBrowserLevels(
    root,
    revision,
    policyPath,
    mode,
    reviewPath,
    conformancePath,
    architecturePath,
    performancePath,
  );
  const report = levels.review.report;
  for (const observation of [levels, report]) {
    // Proof: removal accepted TEST-AXES-130 WATCH_levels-revision and WATCH_report-revision coherent faults.
    if (observation.revision !== revision)
      throw new Error('Browser scenarios revision differs from selected candidate');
    // Proof: removal accepted TEST-AXES-130 WATCH_levels-candidate and WATCH_report-candidate coherent faults.
    if (observation.candidate !== candidate)
      throw new Error('Browser scenarios candidate differs from selected snapshot');
    // Proof: removal accepted TEST-AXES-130 WATCH_levels-mode and WATCH_report-mode coherent faults.
    if (observation.mode !== mode)
      throw new Error('Browser scenarios mode differs from requested mode');
  }
  assertDigest(levels, 'levels');
  assertDigest(report, 'report');
  // Proof: removal accepted TEST-AXES-130's real overlapping Performance selection.
  if (levels.isolation.kind !== 'isolated')
    throw new Error('Browser scenarios requires isolated Browser classification');
  const authority = loadRulePolicyWithIdentity(root, policyPath);
  // Proof: removal accepted TEST-AXES-130 WATCH_policy's coherently resealed foreign report policy digest.
  if (authority.digest !== report.policyDigest)
    throw new Error('Browser scenarios policy differs from publication');
  const scenariosAuthority = authority.policy.scenarios;
  // Proof: removal lost TEST-AXES-130's named missing policy.scenarios refusal.
  if (scenariosAuthority === undefined)
    throw new Error('Browser scenarios needs external policy.scenarios');
  // Proof: filtering change entries before B3 accepted TEST-AXES-130's unrelated competing overlays.
  const specifications = evaluateSpecifications(
    root,
    selected,
    scenariosAuthority,
    authority.digest,
    candidate,
  );
  const requirements = specifications.selection.effective.filter(
    (requirement) => requirement.capability === capability,
  );
  // Proof: removal emitted empty success for TEST-AXES-131's absent capability.
  if (requirements.length === 0)
    throw new Error(`Browser scenarios capability is absent: ${capability}`);
  // Proof: limiting active IDs to the request failed TEST-AXES-128's other-capability citation assertion.
  const active = new Set(
    specifications.selection.effective.flatMap((requirement) =>
      requirement.scenarios.flatMap((scenario) => (scenario.id === undefined ? [] : [scenario.id])),
    ),
  );
  const citationFindings: CitationFinding[] = [];
  const citations = new Map<string, ReportCase[]>();
  // Proof: reversing canonical case order failed TEST-AXES-131's complete observed-case assertion.
  for (const browserCase of [...report.cases].sort((left, right) =>
    compareCanonicalText(left.caseId, right.caseId),
  )) {
    // Proof: selecting the parent title failed TEST-AXES-129's real nested-suite terminal assertions.
    const title = browserCase.titlePath.at(-1);
    // Proof: removal lost TEST-AXES-130 WATCH_terminal's named broken-context refusal.
    if (title === undefined) throw new Error('Browser scenarios terminal test title is absent');
    // Proof: admitting short ordinals changed TEST-AXES-129's malformed citation into inactive.
    const match = /^\[([A-Z][A-Z0-9-]*-\d{3,})\] /.exec(title);
    // Proof: substituting inactive for missing failed TEST-AXES-129's missing-terminal finding assertion.
    if (match === null) {
      citationFindings.push({
        caseId: browserCase.caseId,
        kind: title.startsWith('[') ? 'malformed' : 'missing',
        title,
        status: browserCase.status,
      });
      continue;
    }
    const id = match[1];
    // Proof: removal accepted TEST-AXES-129's unknown and retired citations.
    if (!active.has(id)) {
      citationFindings.push({
        caseId: browserCase.caseId,
        kind: 'inactive',
        title,
        status: browserCase.status,
      });
      continue;
    }
    const cases = citations.get(id) ?? [];
    cases.push(browserCase);
    citations.set(id, cases);
  }
  // Proof: truncating adopted rows failed TEST-AXES-128's complete scenario inventory assertion.
  const scenarios = requirements
    .flatMap((requirement) => requirement.scenarios)
    .map((scenario) => {
      const id = scenario.id;
      // Proof: removal emitted unidentified requested rows in TEST-AXES-130.
      if (id === undefined)
        throw new Error(
          `Browser scenarios requested capability has unidentified scenarios: ${capability}`,
        );
      const cases = citations.get(id);
      return {
        id,
        title: scenario.title,
        observation:
          cases === undefined
            ? { kind: 'unobserved-in-selection' as const }
            : { kind: 'observed' as const, cases },
      };
    })
    .sort((left, right) => compareCanonicalText(left.id, right.id));
  const observation = {
    schemaVersion: 1 as const,
    kind: 'browser-scenarios' as const,
    revision,
    candidate,
    mode,
    capability,
    scope: {
      kind: 'selected-browser-publication' as const,
      mode,
      invocationId: report.invocationId,
    },
    policyId: authority.policy.policyId,
    policyDigest: authority.digest,
    levelsObservationDigest: levels.observationDigest,
    reportObservationDigest: report.observationDigest,
    levels,
    report,
    specifications,
    scenarios,
    citations: [...citations]
      .map(([id, cases]) => ({ id, cases }))
      .sort((left, right) => compareCanonicalText(left.id, right.id)),
    citationFindings,
    // Proof: independently promoting either marker failed TEST-AXES-128's production envelope assertions.
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  // Proof: hashing an empty payload failed TEST-AXES-128's independently recomputed complete-envelope digest.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
