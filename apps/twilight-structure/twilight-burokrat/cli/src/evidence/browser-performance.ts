import { decodePerformanceCases, digestPerformanceDeclaration } from '@shared/test-evidence';
import { parseOrThrow, type } from '@shared/validation';

import { RelativePath } from '../contracts/records';
import { readSelectedBlob } from '../inventory/read-blob';
import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { readExternalArtifact } from '../policy/trust';
import { compareCanonicalText, hashBytes, hashCanonical } from './content-manifest';
import { inspectTestReports } from './test-reports';

const Identity = {
  revision: /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/,
  candidate: /^[0-9a-f]{64}$/,
  mode: "'ordinary'|'packaged'|'portable'",
  reportObservationDigest: /^[0-9a-f]{64}$/,
  projectRoot: RelativePath,
  projectManifest: type({ path: RelativePath, digest: /^[0-9a-f]{64}$/ }).onUndeclaredKey('reject'),
} as const;
const Declaration = {
  declaration: type({ path: RelativePath, digest: /^[0-9a-f]{64}$/ }).onUndeclaredKey('reject'),
  config: type({ path: RelativePath, digest: /^[0-9a-f]{64}$/ }).onUndeclaredKey('reject'),
  project: 'string>=1',
} as const;
// Proof: making disposition or empty kind optional failed TEST-AXES-126's named production schema refusals.
// Proof: widening v2 version/disposition or removing outer/empty/committed closure failed TEST-AXES-126/127's production schema refusals.
const Authority = type({ schemaVersion: '1', ...Identity, ...Declaration })
  .onUndeclaredKey('reject')
  .or(
    type({
      schemaVersion: '2',
      ...Identity,
      performance: type({ kind: "'reviewed-empty'" })
        .onUndeclaredKey('reject')
        .or(type({ kind: "'committed'", ...Declaration }).onUndeclaredKey('reject')),
    }).onUndeclaredKey('reject'),
  );

function decodeJson(bytes: Uint8Array, subject: string): unknown {
  let text: string;
  try {
    // Proof: nonfatal decoding lost TEST-AXES-113's named invalid-UTF-8 authority refusal.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`${subject} is not UTF-8`, { cause });
  }
  try {
    // Proof: substituting an empty record lost TEST-AXES-113's malformed-JSON refusal.
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new Error(`${subject} JSON is malformed`, { cause });
  }
}

/**
 * Joins a complete Browser report to one pinned project's committed or explicitly reviewed-empty Performance membership.
 * Version 1 retains committed behavior; version 2 requires a closed explicit disposition.
 * Reads selected Git bytes without executing candidate code. Other memberships remain unknown;
 * overlap or its absence establishes no classification, isolation, execution, coverage or admission.
 * @throws when authority, report, selected sources or the Performance declaration cannot be joined exactly.
 */
export function inspectBrowserPerformance(
  repository: string,
  revision: string,
  policyPath: string,
  mode: 'ordinary' | 'packaged' | 'portable',
  authorityPath: string,
) {
  // Proof: removing this guard lost TEST-AXES-115's symbolic-SHA refusal.
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(revision))
    throw new Error('Browser Performance selection requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: removing this guard lost TEST-AXES-113's staged-reader refusal.
  if (selected.selection.kind !== 'committed')
    throw new Error('Browser Performance selection is not committed');
  // Proof: removing this guard lost TEST-AXES-115's annotated tag-object refusal.
  if (selected.selection.revision !== revision)
    throw new Error('Browser Performance selected revision differs from requested SHA');
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const report = inspectTestReports(root, revision, policyPath, mode);
  // Proof: removing this guard lost TEST-AXES-113's coherent report revision substitution.
  if (report.revision !== revision)
    throw new Error('Browser Performance report revision differs from selected candidate');
  // Proof: removing this guard lost TEST-AXES-113's coherent report candidate substitution.
  if (report.candidate !== candidate)
    throw new Error('Browser Performance report candidate differs from selected candidate');
  // Proof: removing this guard lost TEST-AXES-113's coherent report mode substitution.
  if (report.mode !== mode)
    throw new Error('Browser Performance report mode differs from requested mode');
  // Proof: TEST-AXES-113 separately deletes authority and replaces it with an unreadable directory.
  const artifact = readExternalArtifact(root, authorityPath, 'Browser Performance authority');
  let authority: typeof Authority.infer;
  try {
    // Proof: bypassing the closed schema accepted TEST-AXES-113's unsupported version and keys.
    authority = parseOrThrow(
      Authority,
      decodeJson(artifact.bytes, 'Browser Performance authority'),
    );
  } catch (cause) {
    throw new Error(
      `Browser Performance authority is invalid: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  // Proof: removing this guard lost TEST-AXES-113's authority revision pin refusal.
  if (authority.revision !== report.revision)
    throw new Error('Browser Performance authority revision differs from report');
  // Proof: removing this guard lost TEST-AXES-113's authority candidate pin refusal.
  if (authority.candidate !== report.candidate)
    throw new Error('Browser Performance authority candidate differs from report');
  // Proof: removing this guard lost TEST-AXES-113's authority mode pin refusal.
  if (authority.mode !== report.mode)
    throw new Error('Browser Performance authority mode differs from report');
  // Proof: removing this guard lost TEST-AXES-113's authority report digest refusal.
  if (authority.reportObservationDigest !== report.observationDigest)
    throw new Error('Browser Performance authority report digest differs from report');
  // Proof: removing this guard lost TEST-AXES-113's manifest/root mismatch refusal.
  if (authority.projectManifest.path !== `${authority.projectRoot}/project.json`)
    throw new Error('Browser Performance project manifest differs from scope root');
  const collection = [...new Set(report.cases.map((browserCase) => browserCase.file))].sort(
    compareCanonicalText,
  );
  // Proof: removing this guard lost TEST-AXES-113's empty-report dependency refusal.
  if (collection.length === 0) throw new Error('Browser Performance collection is empty');
  // Proof: removing this guard lost TEST-AXES-113's foreign-root collection refusal.
  if (
    !collection.every(
      (path) => RelativePath.allows(path) && path.startsWith(`${authority.projectRoot}/`),
    )
  )
    throw new Error('Browser Performance collection escapes declared project scope');
  const membership =
    authority.schemaVersion === 1
      ? { kind: 'committed' as const, ...authority }
      : authority.performance;
  // Proof: removing this guard lost TEST-AXES-113's duplicate pinned-path refusal.
  if (
    membership.kind === 'committed' &&
    new Set([authority.projectManifest.path, membership.declaration.path, membership.config.path])
      .size !== 3
  )
    throw new Error('Browser Performance pinned paths must be distinct');
  const sources = new Map<
    string,
    { path: string; mode: '100644' | '100755'; contentDigest: string }
  >();
  const readSource = (path: string) => {
    // Proof: removing this guard lost TEST-AXES-114's coherent outside-root selected config refusal.
    if (!RelativePath.allows(path) || !path.startsWith(`${authority.projectRoot}/`))
      throw new Error(`Browser Performance source escapes declared project scope: ${path}`);
    const entry = selected.entries.find((entry) => entry.path === path);
    // Proof: removing this guard lost TEST-AXES-114's missing/nonregular disjoint-source refusal despite working repairs.
    if (entry === undefined || (entry.mode !== '100644' && entry.mode !== '100755'))
      throw new Error(`Browser Performance source is not a selected regular blob: ${path}`);
    let bytes: Uint8Array;
    try {
      // Proof: TEST-AXES-114 injects unreadable selected manifest, declaration, config and disjoint fixture readers.
      bytes = readSelectedBlob(root, selected.entries, entry.blob, path);
    } catch (cause) {
      throw new Error(`Browser Performance cannot read selected blob: ${path}`, { cause });
    }
    const source = { path, mode: entry.mode, contentDigest: hashBytes(bytes) };
    const previous = sources.get(path);
    // Proof: removing this guard lost TEST-AXES-115's later shared-path byte and mode substitution refusals.
    if (
      previous !== undefined &&
      (previous.mode !== source.mode || previous.contentDigest !== source.contentDigest)
    )
      throw new Error(`Browser Performance same-path source disagreement: ${path}`);
    // Proof: retaining repeated tuples failed TEST-AXES-112's complete deduplicated union assertion.
    sources.set(path, source);
    return { ...source, bytes };
  };
  for (const browserCase of report.cases) {
    const source = readSource(browserCase.file);
    // Proof: removing this guard lost TEST-AXES-113's upstream source mode and digest substitution refusals.
    if (
      source.mode !== browserCase.source.mode ||
      source.contentDigest !== browserCase.source.contentDigest
    )
      throw new Error(
        `Browser Performance report source differs from selected blob: ${browserCase.file}`,
      );
  }
  const manifestSource = readSource(authority.projectManifest.path);
  // Proof: removing this guard lost TEST-AXES-113's manifest byte-pin refusal.
  if (manifestSource.contentDigest !== authority.projectManifest.digest)
    throw new Error('Browser Performance project manifest digest differs from selected blob');
  const manifest = decodeJson(manifestSource.bytes, 'Browser Performance project manifest');
  // Proof: removing this guard lost TEST-AXES-114's malformed selected manifest refusals.
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    Array.isArray(manifest) ||
    !('targets' in manifest) ||
    typeof manifest.targets !== 'object' ||
    manifest.targets === null ||
    Array.isArray(manifest.targets)
  )
    throw new Error('Browser Performance project manifest is malformed');
  const performanceMembership = (() => {
    // Proof: treating every v2 authority as empty failed TEST-AXES-127's committed parity assertion.
    if (membership.kind === 'reviewed-empty') {
      // Proof: independently removing either target check failed TEST-AXES-126 despite a working manifest repair.
      if (
        Object.hasOwn(manifest.targets, 'test:performance') ||
        Object.hasOwn(manifest.targets, 'test:performance:level')
      )
        throw new Error(
          'Browser Performance reviewed-empty contradicts committed Performance target',
        );
      const declarationPath = `${authority.projectRoot}/performance-cases.json`;
      // Proof: independently dropping exact-file or descendant matching failed TEST-AXES-126's selected declaration contradictions.
      if (
        selected.entries.some(
          (entry) => entry.path === declarationPath || entry.path.startsWith(`${declarationPath}/`),
        )
      )
        throw new Error(
          'Browser Performance reviewed-empty contradicts committed Performance declaration',
        );
      // Proof: emitting unknown failed TEST-AXES-125's exact reviewed-empty membership assertion.
      return { kind: 'reviewed-empty' as const };
    }
    const declarationSource = readSource(membership.declaration.path);
    // Proof: removing this guard lost TEST-AXES-113's declaration byte-pin refusal.
    if (declarationSource.contentDigest !== membership.declaration.digest)
      throw new Error('Browser Performance declaration digest differs from selected blob');
    // Proof: bypassing shared decoding lost TEST-AXES-114's malformed declaration refusals.
    const declaration = decodePerformanceCases(
      decodeJson(declarationSource.bytes, 'Browser Performance declaration'),
    );
    // Proof: substituting its digest failed TEST-AXES-112; TEST-AXES-114 also refuses a negative-zero threshold.
    const declarationDigest = digestPerformanceDeclaration(declaration);
    // Proof: removing this guard lost TEST-AXES-114's declaration/config mismatch refusal.
    if (declaration.config !== membership.config.path)
      throw new Error('Browser Performance declaration config differs from authority');
    // Proof: removing this guard lost TEST-AXES-113's declaration/project mismatch refusal.
    if (declaration.project !== membership.project)
      throw new Error('Browser Performance declaration project differs from authority');
    const configSource = readSource(membership.config.path);
    // Proof: removing this guard lost TEST-AXES-113's config byte-pin refusal.
    if (configSource.contentDigest !== membership.config.digest)
      throw new Error('Browser Performance config digest differs from selected blob');
    // Proof: removing this guard lost TEST-AXES-114's empty-fixture selection refusal.
    if (declaration.cases.length === 0)
      throw new Error('Browser Performance fixture selection is empty');
    // Proof: omitting complete reads accepted TEST-AXES-114's missing disjoint fixture despite working repair.
    for (const performanceCase of declaration.cases) readSource(performanceCase.fixture);
    // Proof: reversing fixtures or retaining duplicates failed TEST-AXES-112's complete fixture-set assertion.
    const selectedFiles = [
      ...new Set(declaration.cases.map((performanceCase) => performanceCase.fixture)),
    ].sort(compareCanonicalText);
    return {
      kind: 'committed' as const,
      ...membership.declaration,
      declaration,
      declarationDigest,
      config: membership.config,
      project: membership.project,
      selectedFiles,
      // Proof: returning all fixtures populated TEST-AXES-112's disjoint intersection.
      files: selectedFiles.filter((path) => collection.includes(path)),
    };
  })();
  const observation = {
    schemaVersion: 1 as const,
    kind: 'browser-performance' as const,
    // Proof: replacing the report failed TEST-AXES-112's exact complete upstream assertion.
    report,
    // Proof: replacing authority or its raw digest failed TEST-AXES-112's exact identity assertions.
    authority,
    authorityDigest: hashBytes(artifact.bytes),
    projectRoot: authority.projectRoot,
    projectManifest: authority.projectManifest,
    // Proof: truncation or reversal failed TEST-AXES-115's complete multiple-file collection assertion.
    collection,
    // Proof: reversing the source union failed TEST-AXES-112's complete sorted tuple assertion.
    sources: [...sources.values()].sort((left, right) =>
      compareCanonicalText(left.path, right.path),
    ),
    // Proof: promoting any unknown row failed TEST-AXES-112's explicit membership assertions.
    memberships: {
      performance: performanceMembership,
      manual: { kind: 'unknown' as const },
      conformance: { kind: 'unknown' as const },
      architecture: { kind: 'unknown' as const },
    },
    // Proof: promoting authentication or certification independently failed TEST-AXES-112.
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  // Proof: hashing an empty payload failed TEST-AXES-112's independently recomputed full-envelope digest.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
