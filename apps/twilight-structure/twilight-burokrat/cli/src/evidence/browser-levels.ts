import { classifyDeclaredTest, type DeclaredTestLevel } from '@shared/test-levels';

import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { inspectBrowserArchitecture } from './browser-architecture';
import { inspectBrowserConformance } from './browser-conformance';
import { inspectBrowserMemberships } from './browser-memberships';
import { inspectBrowserPerformance } from './browser-performance';
import { compareCanonicalText, hashCanonical } from './content-manifest';
import { inspectTestReports } from './test-reports';

interface Source {
  path: string;
  mode: '100644' | '100755';
  contentDigest: string;
}
type Selection =
  { kind: 'reviewed-empty' } | { kind: 'committed'; selectedFiles: string[]; files: string[] };
type Isolation =
  | { kind: 'isolated'; level: 'browser' }
  | {
      kind: 'wrong-level';
      level: 'browser';
      files: { fixture: string; actual: DeclaredTestLevel }[];
    };

function assertDigest(observation: { observationDigest: string }, subject: string): void {
  const { observationDigest, ...payload } = observation;
  // Proof: removing verification failed TEST-AXES-121's WATCH_observation-digest/report-digest refusals.
  if (hashCanonical(payload) !== observationDigest)
    throw new Error(`Browser levels ${subject} digest is invalid`);
}

function selectMembership(selection: Selection, collection: readonly string[]): string[] {
  if (selection.kind === 'reviewed-empty') return [];
  const complete = [...new Set(selection.selectedFiles)].sort(compareCanonicalText);
  // Proof: removal accepted TEST-AXES-121's WATCH_complete-membership duplicate selectors.
  if (JSON.stringify(selection.selectedFiles) !== JSON.stringify(complete))
    throw new Error('Browser levels complete membership is not sorted and unique');
  const intersection = complete.filter((path) => collection.includes(path));
  // Proof: removal accepted TEST-AXES-121's WATCH_intersection omission despite complete selectedFiles.
  if (JSON.stringify(selection.files) !== JSON.stringify(intersection))
    throw new Error('Browser levels membership differs from complete intersection');
  return intersection;
}

/**
 * Joins {@link inspectBrowserMemberships}, {@link inspectBrowserConformance},
 * {@link inspectBrowserArchitecture} and {@link inspectBrowserPerformance} for one committed collection.
 * Only admitted collection members without earlier matches become Browser. Full upstream outcomes and
 * identities remain diagnostic; isolation grants no T2, coverage, admission or authentication authority.
 * @throws when selected identity, review state, report, collection, pins, sources or publication drift prevents an exact join.
 */
export function inspectBrowserLevels(
  repository: string,
  revision: string,
  policyPath: string,
  mode: 'ordinary' | 'packaged' | 'portable',
  reviewPath: string,
  conformancePath: string,
  architecturePath: string,
  performancePath: string,
) {
  // Proof: removing the SHA guard lost TEST-AXES-121's WATCH_sha symbolic-selection refusal.
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(revision))
    throw new Error('Browser levels selection requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: removal lost TEST-AXES-121's WATCH_committed broken-reader selection refusal.
  if (selected.selection.kind !== 'committed')
    throw new Error('Browser levels selection is not committed');
  // Proof: removal lost TEST-AXES-121's WATCH_selected-revision annotated tag-object refusal.
  if (selected.selection.revision !== revision)
    throw new Error('Browser levels selected revision differs from requested SHA');
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const review = inspectBrowserMemberships(root, revision, policyPath, mode, reviewPath);
  const conformance = inspectBrowserConformance(root, revision, policyPath, mode, conformancePath);
  const architecture = inspectBrowserArchitecture(
    root,
    revision,
    policyPath,
    mode,
    architecturePath,
  );
  const performanceObservation = inspectBrowserPerformance(
    root,
    revision,
    policyPath,
    mode,
    performancePath,
  );
  const collection = [...new Set(review.report.cases.map((browserCase) => browserCase.file))].sort(
    compareCanonicalText,
  );
  // Proof: removal lost TEST-AXES-121's WATCH_empty named refusal for an empty real-reader projection.
  if (collection.length === 0) throw new Error('Browser levels collection is empty');
  for (const observation of [review, conformance, architecture, performanceObservation]) {
    const report = observation.report;
    // Proof: independently removing these joins lost WATCH_revision/candidate/mode's named production refusals in TEST-AXES-121.
    if (report.revision !== revision)
      throw new Error('Browser levels report revision differs from requested SHA');
    if (report.candidate !== candidate)
      throw new Error('Browser levels report candidate differs from selected snapshot');
    if (report.mode !== mode)
      throw new Error('Browser levels report mode differs from requested mode');
    assertDigest(report, 'report');
    assertDigest(observation, 'observation');
    // Proof: removal accepted TEST-AXES-121's WATCH_report-join changed invocation with valid digests.
    if (report.observationDigest !== review.report.observationDigest)
      throw new Error('Browser levels report differs between observations');
    // Proof: removal accepted TEST-AXES-121's WATCH_collection duplicate paths; permanent tests also omit/add paths.
    if (JSON.stringify(observation.collection) !== JSON.stringify(collection))
      throw new Error('Browser levels collection differs from complete report');
  }
  // Proof: removal accepted TEST-AXES-122's unknown Manual review in WATCH_review.
  if (
    hashCanonical(review.memberships) !==
    hashCanonical([
      { level: 'architecture', kind: 'unknown' },
      { level: 'conformance', kind: 'unknown' },
      { level: 'manual', kind: 'reviewed-empty' },
      { level: 'performance', kind: 'unknown' },
    ])
  )
    throw new Error('Browser levels requires Manual reviewed-empty and other review rows unknown');
  for (const membership of [
    conformance.memberships.manual,
    conformance.memberships.architecture,
    conformance.memberships.performance,
    architecture.memberships.manual,
    architecture.memberships.conformance,
    architecture.memberships.performance,
    performanceObservation.memberships.manual,
    performanceObservation.memberships.conformance,
    performanceObservation.memberships.architecture,
  ]) {
    // Proof: removal accepted TEST-AXES-122's promoted unrelated row in WATCH_unknown.
    if (hashCanonical(membership) !== hashCanonical({ kind: 'unknown' }))
      throw new Error('Browser levels unrelated adapter membership is not unknown');
  }
  const sources = new Map<string, Source>();
  const addSource = (source: Source) => {
    const previous = sources.get(source.path);
    // Proof: removal accepted TEST-AXES-121's WATCH_source/source-mode digest and mode substitutions.
    if (
      previous !== undefined &&
      (previous.mode !== source.mode || previous.contentDigest !== source.contentDigest)
    )
      throw new Error(`Browser levels source disagreement: ${source.path}`);
    sources.set(source.path, source);
  };
  for (const browserCase of review.report.cases)
    addSource({ path: browserCase.file, ...browserCase.source });
  for (const observation of [conformance, architecture, performanceObservation]) {
    // Proof: independent removal failed TEST-AXES-121's WATCH_root/manifest-pin named scope and pin assertions.
    if (observation.projectRoot !== conformance.projectRoot)
      throw new Error('Browser levels project root differs between adapters');
    if (hashCanonical(observation.projectManifest) !== hashCanonical(conformance.projectManifest))
      throw new Error('Browser levels project manifest differs between adapters');
  }
  for (const observation of [conformance, architecture, performanceObservation]) {
    const paths = new Set<string>();
    for (const source of observation.sources) {
      // Proof: removal accepted TEST-AXES-121's WATCH_duplicate repeated source identity.
      if (paths.has(source.path))
        throw new Error(`Browser levels duplicate source: ${source.path}`);
      paths.add(source.path);
      addSource(source);
    }
    // Proof: removal accepted TEST-AXES-121's WATCH_missing-browser omitted reported tuple.
    if (!collection.every((path) => paths.has(path)))
      throw new Error('Browser levels missing Browser source in adapter');
    // Proof: removal lost TEST-AXES-121's WATCH_missing-manifest named absence refusal.
    if (!paths.has(observation.projectManifest.path))
      throw new Error('Browser levels missing project manifest source in adapter');
    const manifest = sources.get(observation.projectManifest.path);
    // Proof: removal lost TEST-AXES-121's WATCH_manifest-source byte-pin disagreement refusal.
    if (manifest?.contentDigest !== observation.projectManifest.digest)
      throw new Error('Browser levels project manifest source differs from pin');
  }
  // Proof: skipping this real read accepted WATCH_physical's corrupted publication after the last adapter (TEST-AXES-122).
  const finalReport = inspectTestReports(root, revision, policyPath, mode);
  assertDigest(finalReport, 'report');
  const finalCollection = [
    ...new Set(finalReport.cases.map((browserCase) => browserCase.file)),
  ].sort(compareCanonicalText);
  // Proof: removing this join accepted TEST-AXES-122's WATCH_drift changed fifth report identity.
  if (
    finalReport.observationDigest !== review.report.observationDigest ||
    JSON.stringify(finalCollection) !== JSON.stringify(collection)
  )
    throw new Error('Browser levels publication changed during composition');
  const memberships = {
    // Proof: individually emptying each earlier set failed TEST-AXES-123's three-way precedence assertions.
    manualProcedures: new Set<string>(),
    conformanceFiles: new Set(selectMembership(conformance.memberships.conformance, collection)),
    architectureFixtures: new Set(
      selectMembership(architecture.memberships.architecture, collection),
    ),
    performanceFiles: new Set(
      selectMembership(performanceObservation.memberships.performance, collection),
    ),
    browserFiles: new Set(collection),
  };
  const bindings = collection.map((fixture) => {
    const declared = classifyDeclaredTest(fixture, memberships);
    // Proof: removing this guard accepted TEST-AXES-123's classifier fault that deleted admitted membership.
    if (declared === undefined && !memberships.browserFiles.has(fixture))
      throw new Error(`Browser levels fixture is not in admitted collection: ${fixture}`);
    return { fixture, level: declared ?? ('browser' as const) };
  });
  const files = bindings.flatMap(({ fixture, level }) =>
    level === 'browser' ? [] : [{ fixture, actual: level }],
  );
  // Proof: forcing isolated failed TEST-AXES-123's production wrong-level exit and complete findings assertions.
  const isolation: Isolation =
    files.length === 0
      ? { kind: 'isolated', level: 'browser' }
      : { kind: 'wrong-level', level: 'browser', files };
  const observation = {
    schemaVersion: 1 as const,
    kind: 'browser-levels' as const,
    revision,
    candidate,
    mode,
    // Proof: a substituted upstream digest failed TEST-AXES-120; omitted nested outcomes failed TEST-AXES-124.
    reviewObservationDigest: review.observationDigest,
    conformanceObservationDigest: conformance.observationDigest,
    architectureObservationDigest: architecture.observationDigest,
    performanceObservationDigest: performanceObservation.observationDigest,
    review,
    conformance,
    architecture,
    performance: performanceObservation,
    collection,
    // Proof: reversed union order or duplicated tuples failed TEST-AXES-120's complete sorted source assertion.
    sources: [...sources.values()].sort((left, right) =>
      compareCanonicalText(left.path, right.path),
    ),
    bindings,
    isolation,
    // Proof: independently promoting either marker failed TEST-AXES-120's production assertions.
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  // Proof: hashing an empty payload failed TEST-AXES-120's independently recomputed envelope digest.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
