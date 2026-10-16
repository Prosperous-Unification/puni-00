import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { inspectBrowserLevels } from './browser-levels';
import { compareCanonicalText, hashCanonical } from './content-manifest';
import { inspectTestReports } from './test-reports';
import { inspectTestSources } from './test-sources';

type Sources = ReturnType<typeof inspectTestSources>;
type Levels = ReturnType<typeof inspectBrowserLevels>;

interface BrowserSourceLevelsObservation {
  schemaVersion: 1;
  kind: 'browser-source-levels';
  revision: string;
  candidate: string;
  mode: Levels['mode'];
  sourceObservationDigest: string;
  levelObservationDigest: string;
  sources: Sources;
  levels: Levels;
  indexIdentity: Sources['indexIdentity'];
  indexReviewDebt: Sources['indexReviewDebt'];
  bindings: (Omit<Sources['bindings'][number], 'level'> & {
    level: Levels['bindings'][number]['level'];
  })[];
  isolation: Levels['isolation'];
  authentication: { kind: 'absent' };
  certifies: false;
  observationDigest: string;
}

function assertObservation(observation: {
  observationDigest: string;
  authentication: { kind: string };
  certifies: unknown;
}): void {
  const { observationDigest, ...payload } = observation;
  // Proof: removing verification accepted TEST-AXES-145 WATCH_digest's zeroed source envelope digest.
  if (hashCanonical(payload) !== observationDigest)
    throw new Error('Browser source levels upstream digest is invalid');
  // Proof: removing either predicate accepted TEST-AXES-145 WATCH_authentication/certification; coercing false accepted WATCH_certification-coercion's null marker (TEST-AXES-147).
  if (observation.authentication.kind !== 'absent' || observation.certifies !== false)
    throw new Error('Browser source levels upstream diagnostic markers differ');
}

/**
 * Joins {@link inspectTestSources} and {@link inspectBrowserLevels} for one committed snapshot.
 * Full upstream observations retain index review debt and isolation; a source owner identifies the
 * test file's module and confers no tested-module, coverage, T2 or admission authority.
 * @throws when identities, complete case/source/level joins, diagnostic markers or publication drift disagree.
 */
export function inspectBrowserSourceLevels(
  repository: string,
  revision: string,
  policyPath: string,
  mode: 'ordinary' | 'packaged' | 'portable',
  reviewPath: string,
  conformancePath: string,
  architecturePath: string,
  performancePath: string,
): BrowserSourceLevelsObservation {
  // Proof: removal lost TEST-AXES-147 WATCH_sha's named symbolic-selection refusal.
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(revision))
    throw new Error('Browser source levels selection requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: independent removals lost TEST-AXES-147 WATCH_committed-kind/selected-revision's staged-reader and real tag-object refusals.
  if (selected.selection.kind !== 'committed' || selected.selection.revision !== revision)
    throw new Error('Browser source levels selected revision differs from requested SHA');
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const sources = inspectTestSources(root, revision, policyPath, mode);
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
  for (const observation of [sources, levels, report]) {
    assertObservation(observation);
    // Proof: independent removals accepted TEST-AXES-145 WATCH_snapshot-revision/candidate's resealed substitutions.
    if (observation.revision !== revision || observation.candidate !== candidate)
      throw new Error('Browser source levels upstream snapshot differs from selected candidate');
  }
  // Proof: independent removals accepted TEST-AXES-145 WATCH_mode-levels/report's resealed mode substitutions.
  if (levels.mode !== mode || report.mode !== mode)
    throw new Error('Browser source levels upstream mode differs from requested mode');
  const cases = new Map(report.cases.map((entry) => [entry.caseId, entry]));
  // Proof: independent removals lost TEST-AXES-145 WATCH_report-duplicate/empty's named complete-case refusals.
  if (cases.size !== report.cases.length || cases.size === 0)
    throw new Error('Browser source levels report case identities are not unique and nonempty');
  // Proof: removal accepted TEST-AXES-145 WATCH_report-pin's foreign source report identity.
  if (sources.reportObservationDigest !== report.observationDigest)
    throw new Error('Browser source levels report differs between observations');
  const collection = [...new Set(report.cases.map((entry) => entry.file))].sort(
    compareCanonicalText,
  );
  // Proof: removal accepted TEST-AXES-145 WATCH_collection's omitted recorded collection.
  if (hashCanonical(levels.collection) !== hashCanonical(collection))
    throw new Error('Browser source levels collection differs from complete report');
  const classifications = new Map(
    levels.bindings.map((binding) => [binding.fixture, binding.level]),
  );
  // Proof: independent removals lost TEST-AXES-145 WATCH_classification-duplicate/size's duplicate and missing level bindings.
  if (classifications.size !== levels.bindings.length || classifications.size !== collection.length)
    throw new Error('Browser source levels classification membership differs from complete report');
  const files = levels.bindings
    .flatMap(({ fixture, level }) => (level === 'browser' ? [] : [{ fixture, actual: level }]))
    .sort((left, right) => compareCanonicalText(left.fixture, right.fixture));
  const isolation =
    files.length === 0
      ? { kind: 'isolated' as const, level: 'browser' as const }
      : { kind: 'wrong-level' as const, level: 'browser' as const, files };
  // Proof: removal accepted TEST-AXES-145 WATCH_isolation's substituted classification with unchanged isolation.
  if (hashCanonical(isolation) !== hashCanonical(levels.isolation))
    throw new Error('Browser source levels isolation differs from classifications');
  const seen = new Set<string>();
  const bindings = sources.bindings
    .map((binding) => {
      const reportCase = cases.get(binding.caseId);
      // Proof: independent removals lost TEST-AXES-145 WATCH_case-duplicate/substitution's repeated and foreign case refusals.
      if (seen.has(binding.caseId) || reportCase === undefined)
        throw new Error('Browser source levels source case identities differ from complete report');
      seen.add(binding.caseId);
      // Proof: independent removals lost TEST-AXES-145 WATCH_case-file/outcome/source's selected tuple substitutions.
      if (
        binding.file !== reportCase.file ||
        binding.status !== reportCase.status ||
        hashCanonical(binding.source) !== hashCanonical(reportCase.source)
      )
        throw new Error('Browser source levels case file outcome or source differs from report');
      const level = classifications.get(binding.file);
      // Proof: removal lost TEST-AXES-145 WATCH_case-classification's substituted file membership refusal.
      if (level === undefined)
        throw new Error('Browser source levels case classification is absent');
      // Proof: forcing Browser failed TEST-AXES-147 WATCH_output-classification's retained real precedence assertion.
      return { ...binding, level };
    })
    // Proof: removing this sort failed TEST-AXES-147 WATCH_output-order's reversed real source-case assertion.
    .sort((left, right) => compareCanonicalText(left.caseId, right.caseId));
  // Proof: removal accepted TEST-AXES-145 WATCH_case-completeness's omitted source bindings.
  if (seen.size !== cases.size)
    throw new Error('Browser source levels source cases omit complete report cases');
  // Proof: bypassing this real read accepted TEST-AXES-146 WATCH_final-real-read's physical publication corruption.
  const finalReport = inspectTestReports(root, revision, policyPath, mode);
  assertObservation(finalReport);
  // Proof: removal accepted TEST-AXES-146 WATCH_publication-drift's resealed final invocation substitution.
  if (finalReport.observationDigest !== report.observationDigest)
    throw new Error('Browser source levels publication changed during composition');
  const observation = {
    schemaVersion: 1 as const,
    kind: 'browser-source-levels' as const,
    revision,
    candidate,
    mode,
    sourceObservationDigest: sources.observationDigest,
    levelObservationDigest: levels.observationDigest,
    // Proof: dropping nested bindings failed TEST-AXES-147 WATCH_output-upstreams's complete real-envelope equality.
    sources,
    levels,
    indexIdentity: sources.indexIdentity,
    // Proof: dropping debt failed TEST-AXES-147 WATCH_output-debt's real 45-entry index observation.
    indexReviewDebt: sources.indexReviewDebt,
    bindings,
    isolation,
    // Proof: independent marker promotions failed TEST-AXES-147 WATCH_output-authentication/certification's exact assertions.
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  // Proof: hashing an empty payload failed TEST-AXES-147 WATCH_output-digest's independently recomputed full digest.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
