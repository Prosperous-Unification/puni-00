import { loadRulePolicyWithIdentity } from '../rules/rule-policy';
import { evaluateSpecifications } from '../rules/specifications';
import { compareCanonicalText, hashCanonical } from './content-manifest';
import { inspectPerformanceSelection } from './performance-levels';

interface CitationFinding {
  caseId: string;
  kind: 'missing' | 'malformed' | 'inactive';
  title: string;
}

/**
 * Observes scenario citations in one complete, isolated Performance publication selection.
 * B3 validates the entire selected active tree before the requested capability is filtered.
 * Unobserved rows describe this selection only; no coverage or authenticated claim is made.
 * @throws when source, publication, external policy, isolation or B3 authority cannot be joined.
 */
export function inspectPerformanceScenarios(
  repository: string,
  revision: string,
  policyPath: string,
  authorityPath: string,
  capability: string,
) {
  const { root, selected, declaration, publication, levels } = inspectPerformanceSelection(
    repository,
    revision,
    authorityPath,
    policyPath,
  );
  // Proof: disabling isolation accepted TEST-AXES-099's Architecture fixture.
  if (levels.isolation.kind !== 'isolated')
    throw new Error('Performance scenarios requires isolated Performance classification');
  const authority = loadRulePolicyWithIdentity(root, policyPath);
  // Proof: removing this join accepted TEST-AXES-099's foreign publication policy digest.
  if (authority.digest !== publication.policyDigest)
    throw new Error('Performance scenarios policy differs from publication');
  const scenariosAuthority = authority.policy.scenarios;
  // Proof: removal lost TEST-AXES-099's named missing policy.scenarios refusal.
  if (scenariosAuthority === undefined)
    throw new Error('Performance scenarios needs external policy.scenarios');
  // Proof: filtering unrelated entries before B3 accepted TEST-AXES-098's competing unrelated overlays.
  const specifications = evaluateSpecifications(
    root,
    selected,
    scenariosAuthority,
    authority.digest,
    levels.candidate,
  );
  const requirements = specifications.selection.effective.filter(
    (requirement) => requirement.capability === capability,
  );
  // Proof: disabling capability refusal emitted an empty success for TEST-AXES-098's absent capability.
  if (requirements.length === 0)
    throw new Error(`Performance scenarios capability is absent: ${capability}`);
  const active = new Set(
    specifications.selection.effective.flatMap((requirement) =>
      requirement.scenarios.flatMap((scenario) => (scenario.id === undefined ? [] : [scenario.id])),
    ),
  );
  const citationFindings: CitationFinding[] = [];
  const citations = new Map<string, string[]>();
  for (const performanceCase of [...declaration.cases].sort((left, right) =>
    compareCanonicalText(left.caseId, right.caseId),
  )) {
    const title = performanceCase.titlePath.at(-1);
    // Proof: removal lost TEST-AXES-099's named empty-terminal dependency refusal.
    if (title === undefined) throw new Error('Performance scenarios terminal test title is absent');
    // Proof: allowing one-digit ordinals changed TEST-AXES-097's malformed citation to inactive.
    const match = /^\[([A-Z][A-Z0-9-]*-\d{3,})\] /.exec(title);
    // Proof: changing missing to inactive failed TEST-AXES-097's missing-terminal finding.
    if (match === null) {
      citationFindings.push({
        caseId: performanceCase.caseId,
        kind: title.startsWith('[') ? 'malformed' : 'missing',
        title,
      });
      continue;
    }
    const id = match[1];
    // Proof: removing active lookup accepted TEST-AXES-097's unknown and retired citations.
    if (!active.has(id)) {
      citationFindings.push({ caseId: performanceCase.caseId, kind: 'inactive', title });
      continue;
    }
    const cases = citations.get(id) ?? [];
    cases.push(performanceCase.caseId);
    citations.set(id, cases);
  }
  const scenarios = requirements
    .flatMap((requirement) => requirement.scenarios)
    .map((scenario) => {
      const id = scenario.id;
      // Proof: disabling this refusal emits unidentified requested rows in TEST-AXES-098.
      if (id === undefined)
        throw new Error(
          `Performance scenarios requested capability has unidentified scenarios: ${capability}`,
        );
      const caseIds = citations.get(id);
      return {
        id,
        title: scenario.title,
        observation:
          caseIds === undefined
            ? { kind: 'unobserved-in-selection' as const }
            : { kind: 'passing' as const, caseIds },
      };
    })
    .sort((left, right) => compareCanonicalText(left.id, right.id));
  const observation = {
    schemaVersion: 1 as const,
    kind: 'performance-scenarios' as const,
    revision,
    candidate: levels.candidate,
    capability,
    scope: { kind: 'selected-performance-publication' as const, selection: publication.selection },
    policyId: authority.policy.policyId,
    policyDigest: authority.digest,
    declarationDigest: publication.declarationDigest,
    publicationObservationDigest: publication.observationDigest,
    levelsObservationDigest: levels.observationDigest,
    specifications,
    scenarios,
    citationFindings,
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  // Proof: hashing an empty payload failed TEST-AXES-096's independent complete-payload digest.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
