import { isAbsolute, resolve } from 'node:path';

import { readBunJUnitReport } from '@shared/test-evidence';
import { parseOrThrow, type } from '@shared/validation';

import { RelativePath } from '../contracts/records';
import { readSelectedBlob } from '../inventory/read-blob';
import { readCandidate, resolveCandidateRoot } from '../inventory/read-candidate';
import { readExternalArtifact } from '../policy/trust';
import { compareCanonicalText, hashBytes, hashCanonical } from './content-manifest';

// Proof: accepting malformed digest pins lost TEST-AXES-151's closed-authority schema refusal.
const Digest = /^[0-9a-f]{64}$/;
// Proof: TEST-AXES-151 closed-schema faults accepted version/outer/nested-field substitutions; restored schemas refuse them.
const Authority = type({
  schemaVersion: '1',
  revision: /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/,
  candidate: Digest,
  projectRoot: RelativePath,
  projectManifest: type({ path: RelativePath, digest: Digest }).onUndeclaredKey('reject'),
  target: 'string>=1',
  junit: type({ path: 'string>=1', digest: Digest }).onUndeclaredKey('reject'),
}).onUndeclaredKey('reject');

function decodeText(bytes: Uint8Array, subject: string): string {
  try {
    // Proof: disabling fatal decoding lost TEST-AXES-151's authority/report UTF-8 refusal.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`${subject} is not UTF-8`, { cause });
  }
}

function decodeJson(bytes: Uint8Array, subject: string): unknown {
  const text = decodeText(bytes, subject);
  try {
    // Proof: substituting an empty record lost TEST-AXES-151's named malformed-JSON refusal.
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new Error(`${subject} JSON is malformed`, { cause });
  }
}

function readArtifact(root: string, path: string, subject: string) {
  // Proof: removing lexical canonicality lost TEST-AXES-151's relative and dot-alias path refusal.
  if (!isAbsolute(path) || resolve(path) !== path || path.includes('\0'))
    throw new Error(`${subject} path is not canonical`);
  // Proof: replacing failed required reads by empty bytes lost TEST-AXES-151's absent/unreadable artifact refusal.
  const artifact = readExternalArtifact(root, path, subject);
  // Proof: removing physical canonicality admitted TEST-AXES-151's authority symlink alias.
  if (artifact.path !== path) throw new Error(`${subject} path is not canonical`);
  return artifact;
}

function recordOf(input: unknown, subject: string): Record<string, unknown> {
  // Proof: removing record validation lost TEST-AXES-151's null/array target-map and target refusals.
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error(`${subject} is malformed`);
  // The boundary above admits only records; property values remain unknown until decoded.
  return input as Record<string, unknown>;
}

/**
 * Reads one externally pinned Bun JUnit report against exact committed manifest and source blobs.
 * Target naming is provenance only; level, isolation, collection completeness and execution
 * authenticity remain unresolved. Failed and skipped cases are valid diagnostic observations.
 * @throws when operands, external artifacts, selected blobs, target or report identities disagree.
 */
export function inspectBunTestReports(repository: string, revision: string, authorityPath: string) {
  // Proof: removing the SHA guard lost TEST-AXES-151's named symbolic-selection refusal.
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(revision))
    throw new Error('Bun report selection requires a full committed SHA');
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  // Proof: injecting staged reader selection lost TEST-AXES-151's production refusal with this guard removed.
  if (selected.selection.kind !== 'committed')
    throw new Error('Bun report selection is not committed');
  // Proof: reader revision substitution and annotated tag-object selection lost their named refusals without equality.
  if (selected.selection.revision !== revision)
    throw new Error('Bun report selected revision differs from requested SHA');
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const external = readArtifact(root, authorityPath, 'Bun report authority');
  const authority = parseOrThrow(Authority, decodeJson(external.bytes, 'Bun report authority'));
  // Proof: dropping authority revision equality accepted TEST-AXES-151's foreign revision pin.
  if (authority.revision !== revision) throw new Error('Bun report authority revision differs');
  // Proof: dropping candidate equality accepted TEST-AXES-151's foreign candidate digest.
  if (authority.candidate !== candidate) throw new Error('Bun report candidate digest differs');
  // Proof: removing the project-root join lost TEST-AXES-151's substituted manifest-path refusal.
  if (authority.projectManifest.path !== `${authority.projectRoot}/project.json`)
    throw new Error('Bun report manifest path differs from project root');
  const entries = new Map(selected.entries.map((entry) => [entry.path, entry]));
  const manifestEntry = entries.get(authority.projectManifest.path);
  // Proof: removing this guard lost TEST-AXES-151's absent/symlink selected-manifest refusal despite working repair.
  if (
    manifestEntry === undefined ||
    (manifestEntry.mode !== '100644' && manifestEntry.mode !== '100755')
  )
    throw new Error('Bun report manifest is not a regular committed blob');
  const manifestBytes = readSelectedBlob(
    root,
    selected.entries,
    manifestEntry.blob,
    manifestEntry.path,
  );
  // Proof: omitting the raw manifest pin accepted TEST-AXES-151's changed digest.
  if (hashBytes(manifestBytes) !== authority.projectManifest.digest)
    throw new Error('Bun report manifest digest differs');
  // Proof: permitting an absent name lost TEST-AXES-151's named malformed-manifest refusal; canonical serialization refused later.
  const manifest = parseOrThrow(
    type({ name: 'string>=1', targets: 'unknown' }),
    decodeJson(manifestBytes, 'Bun report manifest'),
  );
  const targets = recordOf(manifest.targets, 'Bun report manifest targets');
  // Proof: dropping own-target membership lost TEST-AXES-151's absent/inherited toString target refusal.
  if (!Object.hasOwn(targets, authority.target)) throw new Error('Bun report target is absent');
  // Proof: skipping target record validation accepted TEST-AXES-151's null selected target.
  recordOf(targets[authority.target], 'Bun report target');
  const report = readArtifact(root, authority.junit.path, 'Bun report report');
  // Proof: omitting the raw report pin accepted TEST-AXES-151's changed digest.
  if (hashBytes(report.bytes) !== authority.junit.digest)
    throw new Error('Bun report report digest differs');
  const identities = new Set<string>();
  const cases = readBunJUnitReport(decodeText(report.bytes, 'Bun report report')).map((entry) => {
    // Proof: removing canonical source validation lost TEST-AXES-151's traversal/absolute/dot-path refusals.
    if (!RelativePath.allows(entry.file))
      throw new Error('Bun report source is not a canonical project-relative path');
    const file = `${authority.projectRoot}/${entry.file}`;
    const sourceEntry = entries.get(file);
    // Proof: missing/symlink selected sources lost their named refusal with this guard removed, despite working repair.
    if (
      sourceEntry === undefined ||
      (sourceEntry.mode !== '100644' && sourceEntry.mode !== '100755')
    )
      throw new Error(`Bun report source is not a regular committed blob: ${file}`);
    // Proof: replacing title ancestry by the leaf collapsed TEST-AXES-150's real nested same-leaf identities.
    const caseId = hashCanonical([manifest.name, authority.target, file, entry.titlePath]);
    // Proof: removing uniqueness accepted TEST-AXES-152's equal and conflicting duplicate identities.
    if (identities.has(caseId)) throw new Error('Bun report duplicate case identity');
    identities.add(caseId);
    const source = readSelectedBlob(root, selected.entries, sourceEntry.blob, file);
    return {
      caseId,
      project: manifest.name,
      target: authority.target,
      file,
      titlePath: [...entry.titlePath],
      status: entry.outcome,
      source: { mode: sourceEntry.mode, blob: sourceEntry.blob, contentDigest: hashBytes(source) },
      level: { kind: 'unresolved' as const },
      isolation: { kind: 'unresolved' as const },
    };
  });
  // Proof: omitting sorting failed TEST-AXES-152's reordered-case equality assertion.
  cases.sort((left, right) =>
    compareCanonicalText(
      JSON.stringify([left.project, left.target, left.file, left.titlePath]),
      JSON.stringify([right.project, right.target, right.file, right.titlePath]),
    ),
  );
  const observation = {
    schemaVersion: 1 as const,
    revision,
    candidate,
    projectRoot: authority.projectRoot,
    project: manifest.name,
    target: authority.target,
    projectManifest: {
      path: manifestEntry.path,
      mode: manifestEntry.mode,
      blob: manifestEntry.blob,
      contentDigest: hashBytes(manifestBytes),
    },
    authority: { path: external.path, digest: hashBytes(external.bytes) },
    junit: { path: report.path, digest: hashBytes(report.bytes) },
    cases,
    // Proof: changing this marker failed TEST-AXES-150's diagnostic-only output assertion.
    authentication: { kind: 'absent' as const },
    // Proof: promoting certification failed TEST-AXES-150's explicit false assertion.
    certifies: false as const,
  };
  // Proof: hashing only revision failed TEST-AXES-150's exact complete-payload digest assertion.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
