import { checkIndexes } from '../indexes/check-indexes';
import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { compareCanonicalText, hashCanonical } from './content-manifest';
import { inspectTestReports } from './test-reports';

type BrowserMode = 'ordinary' | 'packaged' | 'portable';

interface TestSourcesObservation {
  readonly schemaVersion: 1;
  readonly revision: string;
  readonly candidate: string;
  readonly reportObservationDigest: string;
  readonly indexIdentity: string;
  readonly indexReviewDebt: readonly { indexPath: string; directEntries: number; limit: number }[];
  readonly bindings: readonly {
    caseId: string;
    file: string;
    status: 'passed' | 'failed' | 'skipped';
    source: { mode: '100644' | '100755'; contentDigest: string };
    owner: { moduleId: string; indexPath: string; indexIdentity: string };
    level: { kind: 'unresolved'; reason: 'complete-level-membership-unavailable' };
  }[];
  readonly authentication: { kind: 'absent' };
  readonly certifies: false;
  readonly observationDigest: string;
}

/**
 * Bind Browser case sources to validated indexes in the same committed candidate.
 * Refuses inherited Browser/index failures, mismatched selections and nonunique ownership.
 * A source owner does not establish test level, tested behavior, authentication or coverage.
 */
export function inspectTestSources(
  repository: string,
  revision: string,
  policyPath: string,
  mode: BrowserMode,
): TestSourcesObservation {
  // Proof: removing this guard let HEAD pass the production symbolic-revision CLI negative.
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(revision))
    throw new Error('test source selection requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: a staged selection injected through the real reader wrapper lost this named refusal
  // when the guard was removed; the report inspector later refused the missing full SHA.
  if (selected.selection.kind !== 'committed')
    throw new Error('test source selection is not committed');
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  // Proof: bypassing the real inspector moved the missing-source/invalid-policy production CLI
  // negative to an unrelated index error, failing its inherited-refusal assertion.
  const reports = inspectTestReports(root, selected.selection.revision, policyPath, mode);
  // Proof: a test-only report-reader fault changed only revision; removing this comparison let
  // the production mismatch CLI return success instead of its named refusal.
  if (reports.revision !== selected.selection.revision)
    throw new Error('test source report revision differs from selected candidate');
  // Proof: a test-only report-reader fault changed only candidate; removing this comparison let
  // the production mismatch CLI return success instead of its named refusal.
  if (reports.candidate !== candidate)
    throw new Error('test source report candidate differs from selected candidate');
  // Proof: bypassing the checker made the malformed committed-index production CLI call succeed.
  // Substituting a working candidate let a valid staged replacement repair missing committed
  // ownership, failing the production CLI's required refusal.
  const checked = checkIndexes(root, selected);
  const bindings = reports.cases.map((reportCase) => {
    const owners = checked.indexes.filter((index) => index.members.includes(reportCase.file));
    // Proof: removing this guard changed the real unowned-case refusal to a later undefined-owner
    // error and let a test-only two-owner checker fault return a successful first-owner binding.
    if (owners.length !== 1)
      throw new Error(`test source has no unique validated index owner: ${reportCase.file}`);
    const owner = owners[0];
    return {
      caseId: reportCase.caseId,
      file: reportCase.file,
      // Proof: promoting a failed/skipped case to passed failed the production retained-outcome
      // assertion; changing source mode to 100755 failed the exact nested-source assertion.
      status: reportCase.status,
      source: reportCase.source,
      owner: {
        // Proof: substituting the outer module ID failed the exact nested-owner CLI assertion.
        moduleId: owner.moduleId,
        indexPath: owner.indexPath,
        indexIdentity: owner.identity,
      },
      level: {
        // Proof: promoting this to Browser failed the production unresolved-level assertion.
        kind: 'unresolved' as const,
        reason: 'complete-level-membership-unavailable' as const,
      },
    };
  });
  // Proof: removing this sort made a test-only reversal of real report cases change the
  // production CLI observation instead of preserving its canonical case order and digest.
  bindings.sort((left, right) => compareCanonicalText(left.caseId, right.caseId));
  const observation = {
    schemaVersion: 1 as const,
    revision: selected.selection.revision,
    candidate,
    reportObservationDigest: reports.observationDigest,
    indexIdentity: checked.identity,
    // Proof: removing this sort made a test-only reversal of two real checker debt entries
    // change the production CLI observation; dropping debt failed the 41-entry debt assertion.
    indexReviewDebt: [...checked.reviewDebt].sort((left, right) =>
      compareCanonicalText(left.indexPath, right.indexPath),
    ),
    bindings,
    // Proof: promoting authentication failed the exact production CLI absent-state assertion.
    authentication: { kind: 'absent' as const },
    // Proof: promoting certification failed the exact production CLI false assertion.
    certifies: false as const,
  };
  // Proof: independently omitting revision, candidate, report identity, index identity, debt,
  // bindings, authentication or certification from this hash failed the canonical-payload CLI
  // assertion; dropping nested ownership or retained outcomes also failed their exact assertions.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
