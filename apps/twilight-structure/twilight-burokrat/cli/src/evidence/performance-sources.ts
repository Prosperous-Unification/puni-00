import { checkIndexes } from '../indexes/check-indexes';
import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { compareCanonicalText, hashCanonical } from './content-manifest';
import { inspectPerformanceBundle } from './performance-bundle';

/**
 * Bind inspected Performance cases to their unique committed module-index owner.
 * This diagnostic observes source ownership; complete test-level facts and trusted receipts
 * remain unavailable, so it cannot certify coverage or admission.
 */
export function inspectPerformanceSources(
  repository: string,
  revision: string,
  policyPath: string,
) {
  // Proof: replacing this guard with a truthy check made the symbolic-HEAD CLI negative exit 0.
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(revision))
    throw new Error('Performance source selection requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: a staged-selection reader fault was refused; disabling this guard made its
  // production CLI assertion fail with a later publication error.
  if (selected.selection.kind !== 'committed')
    throw new Error('Performance source selection is not committed');
  // Proof: removing exact equality made an annotated tag-object SHA peel to its commit and
  // pass the production CLI tag-object refusal test with success JSON and exit zero.
  if (selected.selection.revision !== revision)
    throw new Error('Performance source selected revision differs from requested SHA');
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const publication = inspectPerformanceBundle(root, selected.selection.revision, policyPath);
  // Proof: a test-only publication-reader fault changed the revision; removing this guard
  // made the production CLI accept ownership from a different selected revision.
  if (publication.revision !== selected.selection.revision)
    throw new Error('Performance source publication revision differs from selected candidate');
  // Proof: a test-only publication-reader fault changed the candidate; removing this guard
  // made the production CLI accept the mismatched publication.
  if (publication.candidate !== candidate)
    throw new Error('Performance source publication candidate differs from selected candidate');
  const checked = checkIndexes(root, selected);
  const bindings = publication.observedCases.map((performanceCase) => {
    const source = publication.sources.find((entry) => entry.path === performanceCase.fixture);
    // Proof: a test-only source-tuple fault made this guard's production CLI assertion fail
    // when removed, instead of reporting the inconsistent publication-to-source join.
    if (source === undefined)
      throw new Error(
        `Performance case source differs from publication: ${performanceCase.fixture}`,
      );
    const owners = checked.indexes.filter((index) =>
      index.members.includes(performanceCase.fixture),
    );
    // Proof: a valid checked candidate with a root-level unowned fixture reached this guard;
    // disabling it failed the named CLI assertion with `owner.moduleId` undefined. A faulted
    // checker with two owners also reached the named refusal.
    if (owners.length !== 1)
      throw new Error(
        `Performance source has no unique validated index owner: ${performanceCase.fixture}`,
      );
    const owner = owners[0];
    return {
      caseId: performanceCase.caseId,
      fixture: performanceCase.fixture,
      status: performanceCase.status,
      judgment: {
        observed: performanceCase.observed,
        threshold: performanceCase.threshold,
        passed: performanceCase.passed,
      },
      // Proof: replacing this digest with `fault` failed the exact committed-source CLI
      // assertion; selected mode is asserted in the same production fixture.
      source: { mode: source.mode, contentDigest: source.digest },
      owner: {
        moduleId: owner.moduleId,
        indexPath: owner.indexPath,
        indexIdentity: owner.identity,
      },
      level: {
        kind: 'unresolved' as const,
        reason: 'complete-level-membership-unavailable' as const,
      },
    };
  });
  // Proof: reversing the sort failed the two-case production CLI canonical-order assertion.
  bindings.sort((left, right) => compareCanonicalText(left.caseId, right.caseId));
  const observation = {
    schemaVersion: 1 as const,
    revision: selected.selection.revision,
    candidate,
    publicationObservationDigest: publication.observationDigest,
    indexIdentity: checked.identity,
    // Proof: reversing this comparator failed the production CLI assertion requiring the
    // two debt paths in exact ascending order, `a` then `z`.
    indexReviewDebt: [...checked.reviewDebt].sort((left, right) =>
      compareCanonicalText(left.indexPath, right.indexPath),
    ),
    bindings,
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  // Proof: hashing an empty payload failed the independent complete-payload CLI assertion.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
