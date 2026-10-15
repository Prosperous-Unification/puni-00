import { parseOrThrow, type } from '@shared/validation';

import {
  decodeArchitecturePolicy,
  validateArchitectureDiscovery,
  validateArchitectureMapping,
} from '../architecture-policy';
import { RelativePath } from '../contracts/records';
import { readSelectedBlob } from '../inventory/read-blob';
import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { readExternalArtifact } from '../policy/trust';
import { compareCanonicalText, hashBytes, hashCanonical } from './content-manifest';
import { inspectTestReports } from './test-reports';

const Authority = type({
  schemaVersion: '1',
  revision: /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/,
  candidate: /^[0-9a-f]{64}$/,
  mode: "'ordinary'|'packaged'|'portable'",
  reportObservationDigest: /^[0-9a-f]{64}$/,
  architecture: type({ kind: "'reviewed-empty'" })
    .onUndeclaredKey('reject')
    .or(
      type({ kind: "'committed'", path: RelativePath, digest: /^[0-9a-f]{64}$/ }).onUndeclaredKey(
        'reject',
      ),
    ),
  projectRoot: RelativePath,
  projectManifest: type({ path: RelativePath, digest: /^[0-9a-f]{64}$/ }).onUndeclaredKey('reject'),
}).onUndeclaredKey('reject');

function decodeJson(bytes: Uint8Array, subject: string): unknown {
  let text: string;
  try {
    // Proof: nonfatal decoding lost TEST-AXES-109's invalid-authority UTF-8 refusal.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`${subject} is not UTF-8`, { cause });
  }
  try {
    // Proof: substituting an empty record lost TEST-AXES-109's named malformed-JSON refusal.
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new Error(`${subject} JSON is malformed`, { cause });
  }
}

/**
 * Joins a real complete Browser report to one pinned project's explicit reviewed-empty or committed Architecture selection.
 * Reads selected Git bytes without executing candidate code. Other memberships remain unknown;
 * overlap or its absence establishes no classification, isolation, execution, coverage or admission.
 * @throws when authority, report, selected sources or the declared policy cannot be joined exactly.
 */
export function inspectBrowserArchitecture(
  repository: string,
  revision: string,
  policyPath: string,
  mode: 'ordinary' | 'packaged' | 'portable',
  authorityPath: string,
) {
  // Proof: removing the SHA guard lost TEST-AXES-111's symbolic-selection production refusal.
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(revision))
    throw new Error('Browser Architecture selection requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: removing this guard accepted TEST-AXES-109's broken-reader staged selection.
  if (selected.selection.kind !== 'committed')
    throw new Error('Browser Architecture selection is not committed');
  // Proof: removing exact equality lost TEST-AXES-111's named annotated tag-object refusal.
  if (selected.selection.revision !== revision)
    throw new Error('Browser Architecture selected revision differs from requested SHA');
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const report = inspectTestReports(root, revision, policyPath, mode);
  // Proof: each omitted report identity join accepted TEST-AXES-109's coherent report/authority substitutions.
  if (report.revision !== revision)
    throw new Error('Browser Architecture report revision differs from selected candidate');
  // Proof: removing this join accepted TEST-AXES-109's coherent candidate substitution.
  if (report.candidate !== candidate)
    throw new Error('Browser Architecture report candidate differs from selected candidate');
  // Proof: removing this join accepted TEST-AXES-109's coherent mode substitution.
  if (report.mode !== mode)
    throw new Error('Browser Architecture report mode differs from requested mode');
  // Proof: absent authority and an unreadable directory refuse separately in TEST-AXES-109.
  const artifact = readExternalArtifact(root, authorityPath, 'Browser Architecture authority');
  let authority: typeof Authority.infer;
  try {
    // Proof: bypassing schema decoding accepted TEST-AXES-109's unsupported version and keys.
    authority = parseOrThrow(
      Authority,
      decodeJson(artifact.bytes, 'Browser Architecture authority'),
    );
  } catch (cause) {
    throw new Error(
      `Browser Architecture authority is invalid: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  // Proof: independently omitted revision, candidate, mode and report digest joins failed TEST-AXES-109's pin substitutions.
  if (authority.revision !== report.revision)
    throw new Error('Browser Architecture authority revision differs from report');
  // Proof: removing this join accepted TEST-AXES-109's changed candidate pin.
  if (authority.candidate !== report.candidate)
    throw new Error('Browser Architecture authority candidate differs from report');
  // Proof: removing this join accepted TEST-AXES-109's changed mode pin.
  if (authority.mode !== report.mode)
    throw new Error('Browser Architecture authority mode differs from report');
  // Proof: removing this join accepted TEST-AXES-109's changed report digest.
  if (authority.reportObservationDigest !== report.observationDigest)
    throw new Error('Browser Architecture authority report digest differs from report');
  // Proof: removing this join lost TEST-AXES-109's named foreign manifest/root refusal.
  if (authority.projectManifest.path !== `${authority.projectRoot}/project.json`)
    throw new Error('Browser Architecture project manifest differs from scope root');
  // Proof: reversal, duplication and truncation independently failed TEST-AXES-111's complete collection assertions.
  const collection = [...new Set(report.cases.map((browserCase) => browserCase.file))].sort(
    compareCanonicalText,
  );
  // Proof: removing this guard accepted TEST-AXES-109's empty-report dependency fault.
  if (collection.length === 0) throw new Error('Browser Architecture collection is empty');
  // Proof: disabling containment accepted TEST-AXES-109's coherent foreign-root authority.
  if (
    !collection.every(
      (path) => RelativePath.allows(path) && path.startsWith(`${authority.projectRoot}/`),
    )
  )
    throw new Error('Browser Architecture collection escapes declared project scope');
  const sources = new Map<
    string,
    { path: string; mode: '100644' | '100755'; contentDigest: string }
  >();
  const readSource = (path: string) => {
    const entry = selected.entries.find((entry) => entry.path === path);
    // Proof: guard removal lost TEST-AXES-110's missing/nonregular disjoint-source refusal despite working repairs.
    if (entry === undefined || (entry.mode !== '100644' && entry.mode !== '100755'))
      throw new Error(`Browser Architecture source is not a selected regular blob: ${path}`);
    let bytes: Uint8Array;
    try {
      // Proof: TEST-AXES-110 injects unreadable selected manifest, policy and disjoint fixture dependencies; working replacements do not repair them.
      bytes = readSelectedBlob(root, selected.entries, entry.blob, path);
    } catch (cause) {
      throw new Error(`Browser Architecture cannot read selected blob: ${path}`, { cause });
    }
    const source = { path, mode: entry.mode, contentDigest: hashBytes(bytes) };
    const previous = sources.get(path);
    // Proof: disabling digest or mode agreement accepted TEST-AXES-111's later same-path selected-byte/mode substitution.
    if (
      previous !== undefined &&
      (previous.mode !== source.mode || previous.contentDigest !== source.contentDigest)
    )
      throw new Error(`Browser Architecture same-path source disagreement: ${path}`);
    // Proof: duplicating source tuples failed TEST-AXES-108's complete deduplicated union assertion.
    sources.set(path, source);
    return { ...source, bytes };
  };
  for (const browserCase of report.cases) {
    const source = readSource(browserCase.file);
    // Proof: independently omitting mode or digest equality accepted TEST-AXES-109's broken-report source tuples.
    if (
      source.mode !== browserCase.source.mode ||
      source.contentDigest !== browserCase.source.contentDigest
    )
      throw new Error(
        `Browser Architecture report source differs from selected blob: ${browserCase.file}`,
      );
  }
  const manifestSource = readSource(authority.projectManifest.path);
  // Proof: removing the byte pin accepted TEST-AXES-109's changed manifest digest.
  if (manifestSource.contentDigest !== authority.projectManifest.digest)
    throw new Error('Browser Architecture project manifest digest differs from selected blob');
  const manifest = decodeJson(manifestSource.bytes, 'Browser Architecture project manifest');
  // Proof: disabling structure or the targets-array condition lost TEST-AXES-110's malformed selected-manifest refusal.
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    Array.isArray(manifest) ||
    !('targets' in manifest) ||
    typeof manifest.targets !== 'object' ||
    manifest.targets === null ||
    Array.isArray(manifest.targets)
  )
    throw new Error('Browser Architecture project manifest is malformed');
  const fixedPolicyPath = `${authority.projectRoot}/src/architecture-fixtures.json`;
  const architecture = (() => {
    if (authority.architecture.kind === 'reviewed-empty') {
      // Proof: independently dropping fixed-policy, descendant or target detection accepted TEST-AXES-110's reviewed-empty contradictions.
      if (
        selected.entries.some(
          (entry) => entry.path === fixedPolicyPath || entry.path.startsWith(`${fixedPolicyPath}/`),
        ) ||
        Object.hasOwn(manifest.targets, 'test:architecture:level')
      )
        throw new Error(
          'Browser Architecture reviewed-empty contradicts committed policy or target',
        );
      return authority.architecture;
    }
    // Proof: removing this join lost TEST-AXES-110's fixed runner-path refusal.
    if (authority.architecture.path !== fixedPolicyPath)
      throw new Error('Browser Architecture policy pin differs from fixed runner path');
    const policySource = readSource(fixedPolicyPath);
    // Proof: removing this join accepted TEST-AXES-110's changed policy digest.
    if (policySource.contentDigest !== authority.architecture.digest)
      throw new Error('Browser Architecture policy pin digest differs from selected blob');
    // Proof: bypassing shared decoding accepted TEST-AXES-110's unsupported policy schema.
    const policy = decodeArchitecturePolicy(
      decodeJson(policySource.bytes, 'Browser Architecture policy'),
    );
    const architectureRoot = `${authority.projectRoot}/src/architecture/`;
    // Proof: dropping immediate-child projection lost TEST-AXES-110's suffix-directory refusal; widening suffix discovery rejected its ordinary nested file.
    const discovered = [
      ...new Set(
        selected.entries
          .filter((entry) => entry.path.startsWith(architectureRoot))
          .map((entry) => entry.path.slice(architectureRoot.length).split('/')[0]),
      ),
    ]
      .filter((name) => name.endsWith('.architecture.test.ts'))
      .map((name) => `src/architecture/${name}`);
    const rules = new Set<string>();
    const files = new Set<string>();
    for (const fixture of policy.fixtures) {
      // Proof: omitting shared mapping validation lost TEST-AXES-110's rule-specific malformed-mapping refusals.
      validateArchitectureMapping(fixture, rules);
      // Proof: omitting complete reads accepted TEST-AXES-110's disjoint missing/nonregular/unreadable fixture.
      readSource(`${authority.projectRoot}/${fixture.file}`);
      files.add(fixture.file);
    }
    // Proof: omitting shared discovery accepted TEST-AXES-110's unmapped immediate suffix file and directory child.
    validateArchitectureDiscovery(discovered, files);
    // Proof: omitting sorting reversed TEST-AXES-108's complete committed selection.
    const selectedFiles = [...files]
      .map((file) => `${authority.projectRoot}/${file}`)
      .sort(compareCanonicalText);
    return {
      ...authority.architecture,
      // Proof: truncating complete selectedFiles failed TEST-AXES-108's explicit selection assertion.
      selectedFiles,
      // Proof: returning the full selection populated TEST-AXES-108's disjoint intersection.
      files: selectedFiles.filter((path) => collection.includes(path)),
    };
  })();
  const observation = {
    schemaVersion: 1 as const,
    kind: 'browser-architecture' as const,
    // Proof: replacing the real nested report failed TEST-AXES-108's complete upstream identity assertion.
    report,
    // Proof: replacing raw authority failed TEST-AXES-108's exact external-authority assertion.
    authority,
    // Proof: zeroing this digest failed TEST-AXES-108's independently computed byte identity.
    authorityDigest: hashBytes(artifact.bytes),
    projectRoot: authority.projectRoot,
    projectManifest: authority.projectManifest,
    collection,
    // Proof: reversal or manifest omission failed TEST-AXES-108's complete sorted source union.
    sources: [...sources.values()].sort((left, right) =>
      compareCanonicalText(left.path, right.path),
    ),
    memberships: {
      architecture,
      // Proof: independently promoting any unknown row to reviewed-empty failed TEST-AXES-108.
      manual: { kind: 'unknown' as const },
      conformance: { kind: 'unknown' as const },
      performance: { kind: 'unknown' as const },
    },
    // Proof: promoting authentication or certification independently failed TEST-AXES-108's noncertifying invariants.
    authentication: { kind: 'absent' as const },
    // Proof: changing certification to true independently failed TEST-AXES-108.
    certifies: false as const,
  };
  // Proof: hashing an empty payload failed TEST-AXES-108's independently recomputed full-envelope digest.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
