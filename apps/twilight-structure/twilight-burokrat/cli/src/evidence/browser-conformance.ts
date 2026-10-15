import { parseOrThrow, type } from '@shared/validation';

import { RelativePath } from '../contracts/records';
import { readSelectedBlob } from '../inventory/read-blob';
import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { readExternalArtifact } from '../policy/trust';
import { decodeConformanceSelection } from './conformance-selection';
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
// Proof: widening v2 to version 3 or unknown disposition lost TEST-AXES-117's named production schema refusal.
// Proof: removing either v2 closure or making disposition optional lost TEST-AXES-117's named field refusals.
const Authority = type({ schemaVersion: '1', ...Identity })
  .onUndeclaredKey('reject')
  .or(
    type({
      schemaVersion: '2',
      ...Identity,
      conformance: type({ kind: "'committed'|'reviewed-empty'" }).onUndeclaredKey('reject'),
    }).onUndeclaredKey('reject'),
  );

function decodeJson(bytes: Uint8Array, subject: string): unknown {
  let text: string;
  try {
    // Proof: nonfatal decoding lost TEST-AXES-101's named invalid-UTF-8 production refusal.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`${subject} is not UTF-8`, { cause });
  }
  try {
    // Proof: replacing parsing with an empty record lost TEST-AXES-101's malformed-JSON refusal.
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new Error(`${subject} JSON is malformed`, { cause });
  }
}

/**
 * Joins a real complete Browser report to one pinned project's committed or explicitly reviewed-empty Conformance selection.
 * Version-1 authority retains committed behavior; version 2 requires a closed disposition.
 * Reads selected Git bytes without executing candidate code. Other memberships remain unknown;
 * overlap or its absence establishes no classification, isolation, execution, coverage or admission.
 * @throws when authority, report, selected sources or the bounded target cannot be joined exactly.
 */
export function inspectBrowserConformance(
  repository: string,
  revision: string,
  policyPath: string,
  mode: 'ordinary' | 'packaged' | 'portable',
  authorityPath: string,
) {
  // Proof: removing this guard lost TEST-AXES-103's symbolic-selection CLI refusal.
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(revision))
    throw new Error('Browser Conformance selection requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: removing this guard lost TEST-AXES-101's broken-reader noncommitted refusal.
  if (selected.selection.kind !== 'committed')
    throw new Error('Browser Conformance selection is not committed');
  // Proof: removal let an annotated tag reach the upstream inspector, losing TEST-AXES-103's local refusal.
  if (selected.selection.revision !== revision)
    throw new Error('Browser Conformance selected revision differs from requested SHA');
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const report = inspectTestReports(root, revision, policyPath, mode);
  // Proof: independently removing these joins accepted TEST-AXES-101's coherent report/authority substitutions.
  if (report.revision !== revision)
    throw new Error('Browser Conformance report revision differs from selected candidate');
  if (report.candidate !== candidate)
    throw new Error('Browser Conformance report candidate differs from selected candidate');
  if (report.mode !== mode)
    throw new Error('Browser Conformance report mode differs from requested mode');
  const artifact = readExternalArtifact(root, authorityPath, 'Browser Conformance authority');
  let authority: typeof Authority.infer;
  try {
    // Proof: bypassing decoding accepted TEST-AXES-101's unsupported authority version and keys.
    authority = parseOrThrow(
      Authority,
      decodeJson(artifact.bytes, 'Browser Conformance authority'),
    );
  } catch (cause) {
    throw new Error(
      `Browser Conformance authority is invalid: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  // Proof: each disabled authority pin join failed TEST-AXES-101; disabling candidate equality also failed v2 TEST-AXES-119.
  if (authority.revision !== report.revision)
    throw new Error('Browser Conformance authority revision differs from report');
  if (authority.candidate !== report.candidate)
    throw new Error('Browser Conformance authority candidate differs from report');
  if (authority.mode !== report.mode)
    throw new Error('Browser Conformance authority mode differs from report');
  if (authority.reportObservationDigest !== report.observationDigest)
    throw new Error('Browser Conformance authority report digest differs from report');
  // Proof: removing this join lost TEST-AXES-101's named foreign manifest/root refusal.
  if (authority.projectManifest.path !== `${authority.projectRoot}/project.json`)
    throw new Error('Browser Conformance project manifest differs from scope root');
  // Proof: reversed, truncated or duplicate collection paths failed TEST-AXES-103's real publication assertions.
  const collection = [...new Set(report.cases.map((browserCase) => browserCase.file))].sort(
    compareCanonicalText,
  );
  // Proof: removing this guard accepted TEST-AXES-101's broken-inspector empty collection.
  if (collection.length === 0) throw new Error('Browser Conformance collection is empty');
  // Proof: dropping root containment accepted TEST-AXES-101's foreign-root authority.
  if (
    !collection.every(
      (path) => RelativePath.allows(path) && path.startsWith(`${authority.projectRoot}/`),
    )
  )
    throw new Error('Browser Conformance collection escapes declared project scope');
  const sources = new Map<
    string,
    { path: string; mode: '100644' | '100755'; contentDigest: string }
  >();
  const readSource = (path: string) => {
    const entry = selected.entries.find((entry) => entry.path === path);
    // Proof: removal lost TEST-AXES-102's named missing/symlink/disjoint selected-source refusals.
    if (entry === undefined || (entry.mode !== '100644' && entry.mode !== '100755'))
      throw new Error(`Browser Conformance source is not a selected regular blob: ${path}`);
    let bytes: Uint8Array;
    try {
      // Proof: injected unreadable manifest and disjoint source objects refused in TEST-AXES-102 despite working repairs.
      bytes = readSelectedBlob(root, selected.entries, entry.blob, path);
    } catch (cause) {
      throw new Error(`Browser Conformance cannot read selected blob: ${path}`, { cause });
    }
    const source = { path, mode: entry.mode, contentDigest: hashBytes(bytes) };
    const previous = sources.get(path);
    // Proof: removing this guard accepted TEST-AXES-103's later same-path selected-byte substitution.
    if (
      previous !== undefined &&
      (previous.mode !== source.mode || previous.contentDigest !== source.contentDigest)
    )
      throw new Error(`Browser Conformance same-path source disagreement: ${path}`);
    // Proof: duplicating or omitting emitted source tuples failed TEST-AXES-100/103's complete union assertions.
    sources.set(path, source);
    return { ...source, bytes };
  };
  for (const browserCase of report.cases) {
    const source = readSource(browserCase.file);
    // Proof: independently omitting mode or digest equality accepted TEST-AXES-101's broken-report source tuples.
    if (
      source.mode !== browserCase.source.mode ||
      source.contentDigest !== browserCase.source.contentDigest
    )
      throw new Error(
        `Browser Conformance report source differs from selected blob: ${browserCase.file}`,
      );
  }
  const manifestSource = readSource(authority.projectManifest.path);
  // Proof: removing the byte-pin join accepted TEST-AXES-101's substituted manifest digest.
  if (manifestSource.contentDigest !== authority.projectManifest.digest)
    throw new Error('Browser Conformance project manifest digest differs from selected blob');
  const manifest = decodeJson(manifestSource.bytes, 'Browser Conformance project manifest');
  // Proof: dropping the targets-array check lost TEST-AXES-102 and reviewed-empty TEST-AXES-117's malformed-manifest refusal.
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    Array.isArray(manifest) ||
    !('targets' in manifest) ||
    typeof manifest.targets !== 'object' ||
    manifest.targets === null ||
    Array.isArray(manifest.targets)
  )
    throw new Error('Browser Conformance project manifest is malformed');
  const conformance = (() => {
    // Proof: treating every v2 disposition as empty failed TEST-AXES-118's committed disjoint production success.
    // Proof: removing version dispatch failed TEST-AXES-118's legacy byte-preservation assertion.
    if (authority.schemaVersion === 2 && authority.conformance.kind === 'reviewed-empty') {
      // Proof: removing this check made TEST-AXES-117 emit success for a committed null target under empty authority.
      if (Object.hasOwn(manifest.targets, 'test:conformance'))
        throw new Error('Browser Conformance reviewed-empty contradicts committed target');
      return { kind: 'reviewed-empty' as const };
    }
    const selectedFiles = decodeConformanceSelection(manifest.targets, authority.projectRoot);
    // Proof: omitting this loop accepted TEST-AXES-102's missing, nonregular and unreadable disjoint sources.
    for (const path of selectedFiles) readSource(path);
    return {
      kind: 'committed' as const,
      target: 'test:conformance' as const,
      // Proof: dropping complete selectedFiles failed TEST-AXES-100; unfiltered files failed disjoint membership.
      selectedFiles,
      files: selectedFiles.filter((path) => collection.includes(path)),
    };
  })();
  const observation = {
    schemaVersion: 1 as const,
    kind: 'browser-conformance' as const,
    // Proof: omitting the real nested report failed TEST-AXES-100's complete identity assertion.
    report,
    // Proof: zeroing this pin failed TEST-AXES-100's independent raw-byte digest assertion.
    authorityDigest: hashBytes(artifact.bytes),
    projectRoot: authority.projectRoot,
    projectManifest: authority.projectManifest,
    collection,
    // Proof: reverse ordering, duplicates and manifest omission failed TEST-AXES-100/103's union assertions.
    sources: [...sources.values()].sort((left, right) =>
      compareCanonicalText(left.path, right.path),
    ),
    memberships: {
      conformance,
      // Proof: independently converting any unknown row to reviewed-empty failed TEST-AXES-100.
      manual: { kind: 'unknown' as const },
      architecture: { kind: 'unknown' as const },
      performance: { kind: 'unknown' as const },
    },
    // Proof: promoting authentication or certification independently failed TEST-AXES-100.
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  // Proof: hashing an empty payload failed TEST-AXES-100's independently recomputed full-envelope digest.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
