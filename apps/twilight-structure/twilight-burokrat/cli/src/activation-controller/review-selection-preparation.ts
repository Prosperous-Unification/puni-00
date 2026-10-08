import { Buffer } from 'node:buffer';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { parseOrThrow } from '@shared/validation';

import { type ClassificationPolicy, RelativePath } from '../contracts/records';
import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { type ClassifiedEntry, classifyEntries } from '../inventory/classify-entries';
import { parseCommittedTreeEntries } from '../inventory/read-candidate';

const GitIdentity = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const Sha256 = /^[0-9a-f]{64}$/;
const compareText = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

export interface OwnedReviewCandidateInput {
  repositoryId: number;
  objectStorePath: string;
  gitExecutablePath: string;
  gitExecutableIdentity: string;
  headSha: string;
  baseSha: string;
  classificationPolicy: ClassificationPolicy;
  maximumPreparationMs: number;
  maximumCandidateEntries: number;
  maximumCandidateBytes: number;
}

export interface ReviewCandidateManifestV1 {
  schemaVersion: 1;
  kind: 'review-candidate';
  repositoryId: number;
  headSha: string;
  baseSha: string;
  tree: string;
  entries: {
    path: string;
    mode: ClassifiedEntry['mode'];
    gitObjectId: string;
    rawIdentity: string;
    classification: ClassifiedEntry['classification'];
  }[];
}

/**
 * Reads immutable Git objects with an explicit runtime pin and no inherited Git configuration.
 * The caller must supply an already acquired controller-owned object store and verified
 * repository binding; this reader does not perform remote acquisition or grant authority.
 */
export function readOwnedReviewCandidate(input: OwnedReviewCandidateInput): {
  manifest: ReviewCandidateManifestV1;
  manifestBytes: string;
  snapshotIdentity: string;
  rawBlobs: Map<string, Uint8Array>;
} {
  // Proof: omitting this guard let repository ID zero enter the canonical candidate manifest;
  // the real-object invalid-installed-input test failed.
  if (!Number.isSafeInteger(input.repositoryId) || input.repositoryId < 1) {
    throw new Error('review candidate repository ID must be a positive safe integer');
  }
  // Proof: omitting full-commit grammar let `HEAD` enter the canonical manifest as a mutable
  // revision label; the real-object revision-alias test failed.
  if (!GitIdentity.test(input.headSha) || !GitIdentity.test(input.baseSha)) {
    throw new Error('review candidate commit identity is malformed');
  }
  for (const [label, value] of [
    ['preparation deadline', input.maximumPreparationMs],
    ['candidate entry ceiling', input.maximumCandidateEntries],
    ['candidate byte ceiling', input.maximumCandidateBytes],
  ] as const) {
    // Proof: omitting this installed-bound grammar let a NaN entry ceiling disable the
    // count comparison and publish the full inventory; the production test failed.
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be positive`);
  }
  // Proof: omitting only the absolute-path arm let a relative path to correctly pinned real
  // Git publish the candidate manifest; the named relative-executable test failed.
  if (!isAbsolute(input.gitExecutablePath) || !Sha256.test(input.gitExecutableIdentity)) {
    throw new Error('review candidate Git runtime pin is malformed');
  }
  const executable = lstatSync(input.gitExecutablePath);
  // Proof: omitting only isFile let a symlink named git to correctly pinned real Git publish
  // the candidate manifest; the executable-symlink test failed.
  // Proof: deleting only the digest comparison made a wrong installed Git pin return the
  // complete real-candidate manifest; the changed-runtime production test failed.
  if (
    !executable.isFile() ||
    hashBytes(readFileSync(input.gitExecutablePath)) !== input.gitExecutableIdentity
  ) {
    throw new Error('review candidate Git runtime differs from installed pin');
  }
  // Proof: replacing lstat with stat followed an alias to the real object store and returned
  // a manifest; the production symlink-substitution test failed.
  // Proof: omitting only the absolute-path arm let a relative path to the same real object
  // store publish the candidate manifest; the relative-object-store test failed.
  if (!isAbsolute(input.objectStorePath) || !lstatSync(input.objectStorePath).isDirectory()) {
    throw new Error('review candidate object store must be an owned directory');
  }
  const deadline = performance.now() + input.maximumPreparationMs;
  const invokeGit = (args: string[]): Uint8Array => {
    const remaining = deadline - performance.now();
    // Proof: omitting this pre-spawn fence let a zero-ms remaining deadline run every Git
    // command and publish a manifest; the production exhausted-deadline test failed.
    if (remaining <= 0) throw new Error('review candidate preparation deadline exceeded');
    const call = Bun.spawnSync(
      [input.gitExecutablePath, `--git-dir=${input.objectStorePath}`, ...args],
      {
        // Proof: spreading the ambient environment here let GIT_OBJECT_DIRECTORY divert the
        // real-object reader to an empty store; the inherited-config test failed.
        env: {
          HOME: '/dev/null',
          LC_ALL: 'C',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
          GIT_NO_REPLACE_OBJECTS: '1',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_CONFIG_COUNT: '0',
        },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: Math.ceil(remaining),
        maxBuffer: input.maximumCandidateBytes,
      },
    );
    // Proof: omitting the exit-code arm converted a failed pinned ls-tree command with empty
    // stdout into a successful empty manifest; the production Git-failure test failed.
    // Proof: removing the explicit length arm let a pinned shell wrapper emit a >256-byte
    // tree response despite maxBuffer:256 and publish it; the oversize test failed.
    if (call.exitCode !== 0 || call.stdout.length > input.maximumCandidateBytes) {
      throw new Error('review candidate Git object read failed or exceeded output bound');
    }
    return call.stdout;
  };
  const readIdentity = (revision: string, type: 'commit' | 'tree'): string => {
    const bytes = invokeGit(['rev-parse', '--verify', '--end-of-options', `${revision}^{${type}}`]);
    const identity = new TextDecoder('utf-8').decode(bytes);
    // Proof: omitting this parser let a pinned Git process return `bad` for the tree and
    // publish that non-object identity in the candidate manifest; the response test failed.
    if (!identity.endsWith('\n') || !GitIdentity.test(identity.slice(0, -1))) {
      throw new Error('review candidate Git object identity is malformed');
    }
    return identity.slice(0, -1);
  };
  readIdentity(input.headSha, 'commit');
  readIdentity(input.baseSha, 'commit');
  const tree = readIdentity(input.headSha, 'tree');
  const entries = parseCommittedTreeEntries(
    invokeGit(['ls-tree', '-r', '-z', '--full-tree', tree]),
    tree,
  );
  // Proof: replacing this guard with false made the real two-entry candidate pass a one-entry
  // ceiling; the production reader's named test failed before raw-blob processing.
  if (entries.length > input.maximumCandidateEntries) {
    throw new Error('review candidate entry ceiling exceeded');
  }
  let candidateBytes = 0;
  const rawBlobs = new Map<string, Uint8Array>();
  const blobsByObject = new Map<string, Uint8Array>();
  let previousPath: string | undefined;
  for (const entry of entries) {
    // Proof: omitting this boundary let a pinned Git response with ../README.md publish a
    // candidate manifest outside the repository; the malformed-path test failed.
    parseOrThrow(RelativePath, entry.path);
    // Proof: removing this byte-order/uniqueness guard let a pinned Git response publish
    // duplicate README paths; the malformed-tree production test failed.
    if (previousPath !== undefined && compareText(previousPath, entry.path) >= 0) {
      throw new Error('review candidate paths are duplicate or not byte sorted');
    }
    previousPath = entry.path;
    // Proof: omitting this refusal let a declared mode-160000 entry whose object could be read
    // as a blob enter the retained manifest; the real Gitlink production test failed.
    if (entry.mode === '160000')
      throw new Error(`review candidate Gitlink is unresolved: ${entry.path}`);
    const raw = invokeGit(['cat-file', 'blob', entry.blob]);
    candidateBytes += raw.length;
    // Proof: deleting this aggregate bound let two individually bounded 157/154-byte blobs
    // pass a 256-byte candidate ceiling; the real-object production test failed.
    if (!Number.isSafeInteger(candidateBytes) || candidateBytes > input.maximumCandidateBytes) {
      throw new Error('review candidate byte ceiling exceeded');
    }
    const identity = hashBytes(raw);
    // Proof: omitting raw-blob retention left the descriptor and identity intact but the
    // source bytes absent; the real-candidate production test failed at the raw read.
    rawBlobs.set(identity, Uint8Array.from(raw));
    blobsByObject.set(entry.blob, raw);
  }
  const classified = classifyEntries(entries, input.classificationPolicy, (blob) => {
    const raw = blobsByObject.get(blob);
    if (raw === undefined) throw new Error('review candidate classified blob is absent');
    return raw;
  });
  const manifest: ReviewCandidateManifestV1 = {
    schemaVersion: 1,
    kind: 'review-candidate',
    repositoryId: input.repositoryId,
    headSha: input.headSha,
    baseSha: input.baseSha,
    tree,
    entries: classified.map(({ path, mode, blob, classification }) => {
      const raw = blobsByObject.get(blob);
      if (raw === undefined) throw new Error('review candidate raw blob is absent');
      return { path, mode, gitObjectId: blob, rawIdentity: hashBytes(raw), classification };
    }),
  };
  const manifestBytes = serializeCanonical(manifest);
  // Proof: omitting the final fence let a 10,001-ms monotonic advance after the last Git
  // invocation return a manifest; the production deadline-overrun test failed.
  if (performance.now() > deadline)
    throw new Error('review candidate preparation deadline exceeded');
  return { manifest, manifestBytes, snapshotIdentity: hashBytes(manifestBytes), rawBlobs };
}
