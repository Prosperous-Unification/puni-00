import { decodePerformanceCases, digestPerformanceDeclaration } from '@shared/test-evidence';
import { classifyDeclaredTest, type DeclaredTestLevel } from '@shared/test-levels';

import { readSelectedBlob } from '../inventory/read-blob';
import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { compareCanonicalText, hashBytes, hashCanonical } from './content-manifest';
import { inspectLevelFacts } from './level-facts';
import { inspectPerformanceBundle } from './performance-bundle';

type Isolation =
  | { kind: 'isolated'; level: 'performance' }
  | {
      kind: 'wrong-level';
      level: 'performance';
      files: { fixture: string; actual: Exclude<DeclaredTestLevel, 'performance'> }[];
    };

/**
 * Joins complete declared level facts with one inspected Performance publication.
 * Only the earlier table rows are resolved; source ownership and coverage remain separate.
 * @throws when any committed selection, source, declaration or recorded collection join differs.
 */
export function inspectPerformanceLevels(
  repository: string,
  revision: string,
  authorityPath: string,
  policyPath: string,
) {
  const root = resolveCandidateRoot(repository);
  const facts = inspectLevelFacts(root, revision, authorityPath);
  const publication = inspectPerformanceBundle(root, revision, policyPath);
  // Proof: removing this join made [TEST-AXES-088] accept either inspector's changed revision.
  if (facts.revision !== revision || publication.revision !== revision)
    throw new Error('Performance levels revision differs from requested SHA');
  // Proof: removing this join made [TEST-AXES-088] accept a foreign publication candidate.
  if (facts.candidate !== publication.candidate)
    throw new Error('Performance levels candidate differs between facts and publication');
  // Proof: removing this join made [TEST-AXES-088] accept a foreign declaration path.
  if (facts.scope.declaration.path !== publication.selection.declarationPath)
    throw new Error('Performance levels declaration path differs from publication');
  // Proof: removing this join made [TEST-AXES-088] accept a foreign publication config path.
  if (facts.scope.config.path !== publication.selection.config)
    throw new Error('Performance levels config path differs from publication');
  // Proof: removing this join made [TEST-AXES-088] accept the publication's webkit project.
  if (facts.scope.project !== publication.selection.project)
    throw new Error('Performance levels project differs from publication');
  // Proof: [TEST-AXES-088] changed each publication config digest independently; removing
  // either comparison emitted facts for that changed digest.
  if (
    facts.scope.config.digest !== publication.configDigest ||
    facts.scope.config.digest !== publication.selection.configDigest
  )
    throw new Error('Performance levels config digest differs from publication');

  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: removing this full-snapshot join made [TEST-AXES-088] accept a third reader's
  // staged, changed-revision or changed-untracked snapshot. Selection is part of this hash.
  if (
    hashCanonical({
      selection: selected.selection,
      entries: selected.entries,
      untracked: selected.untracked,
    }) !== facts.candidate
  )
    throw new Error('Performance levels declaration selection differs from facts');
  const entry = selected.entries.find((source) => source.path === facts.scope.declaration.path);
  // Proof: separately removing absence and mode checks failed [TEST-AXES-088] with an
  // unnamed TypeError or success for the injected nonregular declaration entry.
  if (entry === undefined || (entry.mode !== '100644' && entry.mode !== '100755'))
    throw new Error('Performance levels declaration source is not a selected regular blob');
  const bytes = readSelectedBlob(root, selected.entries, entry.blob, entry.path);
  // Proof: removing this check made [TEST-AXES-088] accept a changed raw declaration pin.
  if (hashBytes(bytes) !== facts.scope.declaration.digest)
    throw new Error('Performance levels declaration byte digest differs from facts');
  // Proof: [TEST-AXES-088] injects malformed third-reader bytes with a matching raw pin;
  // disabling fatal UTF-8, JSON parsing or shared schema decoding lost each named refusal.
  const declaration = decodePerformanceCases(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown,
  );
  // Proof: removing this check accepted coherently substituted config paths in both
  // real inspector outputs in [TEST-AXES-088], despite the selected declaration.
  if (declaration.config !== facts.scope.config.path)
    throw new Error('Performance levels config path differs from selected declaration');
  // Proof: removing this check accepted coherently substituted projects in [TEST-AXES-088].
  if (declaration.project !== facts.scope.project)
    throw new Error('Performance levels project differs from selected declaration');
  // Proof: removing this join accepted [TEST-AXES-088]'s changed semantic declaration digest.
  if (digestPerformanceDeclaration(declaration) !== publication.declarationDigest)
    throw new Error('Performance levels declaration digest differs from publication');
  // Proof: removing either case sort failed [TEST-AXES-087]'s reversed declaration or
  // recorded enumeration; raw byte identity and declaration semantics remain distinct.
  const declaredCases = declaration.cases
    .map(({ caseId, fixture }) => ({ caseId, fixture }))
    .sort((left, right) => compareCanonicalText(left.caseId, right.caseId));
  const recordedCases = publication.observedCases
    .map(({ caseId, fixture }) => ({ caseId, fixture }))
    .sort((left, right) => compareCanonicalText(left.caseId, right.caseId));
  // Proof: removing fixture sort or deduplication failed [TEST-AXES-087]'s multi-fixture
  // canonical order or two distinct cases sharing one fixture.
  const fixtures = [
    ...new Set(declaration.cases.map((performanceCase) => performanceCase.fixture)),
  ].sort(compareCanonicalText);
  // Proof: removing each comparison failed [TEST-AXES-088]'s missing/extra/duplicate
  // recorded cases, changed membership or changed authority fixture scope respectively.
  if (
    JSON.stringify(declaredCases) !== JSON.stringify(recordedCases) ||
    JSON.stringify(fixtures) !== JSON.stringify(facts.memberships.performance) ||
    JSON.stringify(fixtures) !== JSON.stringify(facts.scope.fixtures)
  )
    throw new Error('Performance levels collection differs from complete declaration and facts');
  const expectedSources = fixtures.map((path) =>
    facts.sources.find((source) => source.path === path),
  );
  // Proof: removing this source sort failed [TEST-AXES-087]'s reversed recorded enumeration.
  const recordedSources = publication.sources
    .map(({ path, mode, digest }) => ({ path, mode, contentDigest: digest }))
    .sort((left, right) => compareCanonicalText(left.path, right.path));
  // Proof: removing this join accepted missing/duplicate source tuples or changed modes
  // and byte identities from the real inspector dependency in [TEST-AXES-088].
  if (JSON.stringify(expectedSources) !== JSON.stringify(recordedSources))
    throw new Error('Performance levels source tuples differ from facts');
  const memberships = {
    // The real facts contract requires an explicit reviewed-empty Manual authority.
    manualProcedures: new Set<string>(),
    conformanceFiles: new Set(
      facts.memberships.conformance.kind === 'committed' ? facts.memberships.conformance.files : [],
    ),
    architectureFixtures: new Set(
      facts.memberships.architecture.kind === 'committed'
        ? facts.memberships.architecture.files
        : [],
    ),
    performanceFiles: new Set(facts.memberships.performance),
    browserFiles: new Set(recordedCases.map((performanceCase) => performanceCase.fixture)),
  };
  const bindings = fixtures.map((fixture) => {
    const level = classifyDeclaredTest(fixture, memberships);
    // Proof: removing this refusal let [TEST-AXES-088]'s broken shared classifier emit JSON.
    if (level === undefined)
      throw new Error(`Performance levels fixture has no declared level: ${fixture}`);
    return { fixture, level };
  });
  const files = bindings.flatMap(({ fixture, level }) =>
    level === 'performance' ? [] : [{ fixture, actual: level }],
  );
  // Proof: forcing isolated made [TEST-AXES-089]'s higher-row fixtures exit zero.
  const isolation: Isolation =
    files.length === 0
      ? { kind: 'isolated', level: 'performance' }
      : { kind: 'wrong-level', level: 'performance', files };
  const observation = {
    schemaVersion: 1 as const,
    kind: 'performance-levels' as const,
    revision,
    candidate: facts.candidate,
    // Proof: replacing either upstream digest failed [TEST-AXES-087]'s real-inspector join.
    factsObservationDigest: facts.observationDigest,
    publicationObservationDigest: publication.observationDigest,
    bindings,
    isolation,
    // Proof: promoting authentication or certification failed [TEST-AXES-087]'s CLI assertions.
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  // Proof: hashing an empty payload failed [TEST-AXES-087]'s independent full-payload digest.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
