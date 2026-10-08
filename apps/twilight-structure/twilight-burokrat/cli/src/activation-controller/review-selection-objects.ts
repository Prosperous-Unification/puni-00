import { Buffer } from 'node:buffer';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import {
  ClassificationPolicy,
  ContentClass,
  EvidenceRecordKind,
  RelativePath,
} from '../contracts/records';
import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { type GitHubRepositoryBinding, validateGitHubRepositoryBinding } from './github-source';
import { type ActivationRequest, assertActivationRequest } from './request';
import { readOwnedReviewCandidate } from './review-selection-preparation';

const Sha256Pattern = /^[0-9a-f]{64}$/;
const GitIdentity = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const MaximumManifestBytes = 65_536;
const CandidateClassification = type({ kind: "'content'", contentClass: ContentClass })
  .onUndeclaredKey('reject')
  .or(
    type({
      kind: "'content'",
      contentClass: "'binary'",
      format: 'string>=1',
      consumer: 'string>=1',
      regenerationAuthority: type({ kind: "'source'", path: RelativePath })
        .onUndeclaredKey('reject')
        .or(type({ kind: "'external'", authority: 'string>=1' }).onUndeclaredKey('reject')),
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'content'",
      contentClass: "'symlink'",
      target: 'string>=1',
      resolvedTarget: RelativePath,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'content'",
      contentClass: "'gitlink'",
      boundaryId: 'string>=1',
      repository: 'string>=1',
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'evidence'",
      evidenceRoot: RelativePath,
      recordKind: EvidenceRecordKind,
    }).onUndeclaredKey('reject'),
  );
const CandidateManifest = type({
  schemaVersion: '1',
  kind: "'review-candidate'",
  repositoryId: 'number.integer>=1',
  headSha: GitIdentity,
  baseSha: GitIdentity,
  tree: GitIdentity,
  entries: type({
    path: RelativePath,
    mode: "'100644'|'100755'|'120000'",
    gitObjectId: GitIdentity,
    rawIdentity: Sha256Pattern,
    // Proof: a canonical digest-matched retained manifest with contentClass "foreign"
    // passed the old unknown decoder; the undeclared-classification test was RED.
    classification: CandidateClassification,
  })
    .onUndeclaredKey('reject')
    .array(),
}).onUndeclaredKey('reject');

export interface LocalReviewAcquisitionInput {
  readonly binding: GitHubRepositoryBinding;
  readonly sourceRepository: string;
  readonly storeBase: string;
  readonly gitExecutablePath: string;
  readonly gitExecutableIdentity: string;
  readonly classificationPolicy: ClassificationPolicy;
  readonly maximumPreparationMs: number;
  readonly maximumCandidateEntries: number;
  readonly maximumCandidateBytes: number;
}

const SourceOwnership = Symbol('installed local review source');

export interface InstalledLocalReviewSource {
  readonly [SourceOwnership]: true;
  prepare(request: ActivationRequest): ReturnType<typeof prepareRetainedLocalReviewCandidate>;
  read(snapshotIdentity: string): ReturnType<typeof readRetainedReviewCandidate>;
}

function freezeOwnedDocument<T extends object>(document: T): Readonly<T> {
  for (const field of Object.values(document)) {
    if (field !== null && typeof field === 'object') freezeOwnedDocument(field);
  }
  return Object.freeze(document);
}

/** Installs local repository/store paths at the controller configuration boundary, before requests arrive. */
export function installLocalReviewSource(
  configuration: LocalReviewAcquisitionInput,
): InstalledLocalReviewSource {
  // Proof: after installation, mutating the caller's nested repositoryId to 456 must
  // not authorize a 456 request; omitting the owned clone failed that production test.
  const binding = freezeOwnedDocument(
    validateGitHubRepositoryBinding(structuredClone(configuration.binding)),
  );
  // Proof: after installation, mutating a caller-owned source classification rule must
  // not change the retained candidate; omitting the owned clone failed that test.
  const classificationPolicy = freezeOwnedDocument(
    parseOrThrow(ClassificationPolicy, structuredClone(configuration.classificationPolicy)),
  );
  requirePrivateDirectory(configuration.storeBase, 'review object store');
  requireLocalSource(configuration.sourceRepository);
  const installed = Object.freeze({ ...configuration, binding, classificationPolicy });
  return Object.freeze({
    [SourceOwnership]: true,
    prepare: (request: ActivationRequest) =>
      prepareRetainedLocalReviewCandidate(installed, request),
    read: (snapshotIdentity: string) =>
      readRetainedReviewCandidate(
        installed.storeBase,
        snapshotIdentity,
        installed.maximumCandidateBytes,
      ),
  });
}

function requireLocalSource(sourceRepository: string): void {
  // Proof: omitting the source-directory arm admitted a symlink to the real repo;
  // omitting the .git-directory arm admitted a symlinked metadata directory.
  if (
    !isAbsolute(sourceRepository) ||
    !lstatSync(sourceRepository).isDirectory() ||
    !lstatSync(join(sourceRepository, '.git')).isDirectory()
  ) {
    throw new Error('review local source is not a configured Git repository');
  }
}

function requirePrivateDirectory(path: string, label: string): void {
  const entry = lstatSync(path);
  const uid = process.getuid?.();
  // Proof: spoofing a foreign owner in the installed store's lstat response refused
  // installation; omitting only the UID join failed that production test.
  // Proof: reporting the retained ready directory as a non-directory refused reread;
  // omitting only isDirectory failed the mounted ready-directory test.
  if (
    !isAbsolute(path) ||
    uid === undefined ||
    !entry.isDirectory() ||
    entry.uid !== uid ||
    (entry.mode & 0o777) !== 0o700
  ) {
    throw new Error(`${label} is not a private controller directory`);
  }
}

function useOwnedDescriptor<T>(
  path: string,
  flags: number,
  use: (descriptor: number) => T,
  mode?: number,
): T {
  const descriptor = mode === undefined ? openSync(path, flags) : openSync(path, flags, mode);
  let operation: { kind: 'returned'; value: T } | { kind: 'failed'; cause: unknown };
  try {
    operation = { kind: 'returned', value: use(descriptor) };
  } catch (cause) {
    operation = { kind: 'failed', cause };
  }
  let closure: { kind: 'closed' } | { kind: 'failed'; cause: unknown };
  try {
    closeSync(descriptor);
    closure = { kind: 'closed' };
  } catch (cause) {
    closure = { kind: 'failed', cause };
  }
  // Proof: separate mounted raw-write, raw-read and blob-directory primary+close faults
  // previously returned only close failure. Each now returns both causes; omitting this
  // aggregation independently failed its named production-path test.
  if (operation.kind === 'failed' && closure.kind === 'failed')
    throw new AggregateError(
      [operation.cause, closure.cause],
      'review object use and close failed',
      {
        cause: operation.cause,
      },
    );
  if (operation.kind === 'failed') {
    if (operation.cause instanceof Error) throw operation.cause;
    throw new Error('review object use failed', { cause: operation.cause });
  }
  if (closure.kind === 'failed') {
    if (closure.cause instanceof Error) throw closure.cause;
    throw new Error('review object close failed', { cause: closure.cause });
  }
  return operation.value;
}

function syncDirectory(path: string): void {
  useOwnedDescriptor(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    (descriptor) => {
      fsyncSync(descriptor);
    },
  );
}

function writeExclusive(path: string, bytes: Uint8Array): void {
  useOwnedDescriptor(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    (descriptor) => {
      let written = 0;
      while (written < bytes.length) {
        const length = writeSync(descriptor, bytes, written, bytes.length - written);
        // Proof: a mounted zero-byte write hung past a three-second watchdog; omitting
        // this progress check again made the short-write test fail to settle.
        if (length <= 0) throw new Error('retained review object short write');
        written += length;
      }
      // Proof: injected raw-blob fsync failure refused before ready publication;
      // omitting this file sync returned a ready snapshot in the mounted test.
      fsyncSync(descriptor);
    },
    0o600,
  );
}

function readProtected(path: string, identity: string, ceiling: number): Buffer {
  // Proof: removing O_NOFOLLOW accepted a same-byte private symlink target in the
  // retained-raw production test; removing O_NONBLOCK hung the empty-blob FIFO test
  // past a three-second watchdog rather than refusing promptly.
  return useOwnedDescriptor(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    (descriptor) => {
      const entry = fstatSync(descriptor);
      const uid = process.getuid?.();
      // Proof: removing isFile accepted a mode-0600 FIFO in place of an empty digest blob;
      // independently omitting nlink or private mode failed the hard-link and group-mode tests.
      // Proof: spoofing a foreign owner in the raw inode's fstat response refused reread;
      // omitting only the UID join failed that production test.
      if (
        uid === undefined ||
        !entry.isFile() ||
        entry.uid !== uid ||
        entry.nlink !== 1 ||
        (entry.mode & 0o077) !== 0 ||
        entry.size > ceiling
      ) {
        throw new Error('retained review object metadata differs');
      }
      const buffer = Buffer.alloc(ceiling + 1);
      let count = 0;
      while (count < buffer.length) {
        const length = readSync(descriptor, buffer, count, buffer.length - count, count);
        if (length === 0) break;
        count += length;
      }
      if (count > ceiling) throw new Error('retained review object exceeds bound');
      const bytes = buffer.subarray(0, count);
      // Proof: omitting this digest check returned altered retained source bytes and accepted
      // a different canonical manifest repository ID under the old snapshot digest; the
      // independent raw-mutation and manifest-binding production tests failed.
      if (hashBytes(bytes) !== identity) throw new Error('retained review object digest differs');
      return bytes;
    },
  );
}

/** Reopens every immutable manifest and raw blob by its pinned digest; absent or changed state refuses. */
function readRetainedReviewCandidate(
  storeBase: string,
  snapshotIdentity: string,
  maximumCandidateBytes: number,
) {
  if (
    !Sha256Pattern.test(snapshotIdentity) ||
    !Number.isSafeInteger(maximumCandidateBytes) ||
    maximumCandidateBytes < 1
  ) {
    throw new Error('retained review identity or bound malformed');
  }
  requirePrivateDirectory(storeBase, 'review object store');
  const readyDirectory = join(storeBase, `ready-${snapshotIdentity}`);
  requirePrivateDirectory(readyDirectory, 'retained review directory');
  const blobDirectory = join(readyDirectory, 'sha256');
  requirePrivateDirectory(blobDirectory, 'retained blob directory');
  const manifestBytes = readProtected(
    join(readyDirectory, 'manifest.json'),
    snapshotIdentity,
    MaximumManifestBytes,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes));
  } catch (cause) {
    throw new Error('retained review manifest malformed', { cause });
  }
  const manifest = parseOrThrow(CandidateManifest, parsed);
  // Proof: omitting canonical comparison accepted whitespace-reformatted retained
  // manifest bytes under their matching digest; the noncanonical-manifest test failed.
  if (serializeCanonical(manifest) !== manifestBytes.toString('utf8')) {
    throw new Error('retained review manifest is not canonical');
  }
  const rawBlobs = new Map<string, Uint8Array>();
  let total = 0;
  let priorPath: string | undefined;
  for (const entry of manifest.entries) {
    // Proof: canonical digest-matched manifests with independently duplicated or
    // reordered paths were refused; omitting the comparator returned each manifest.
    if (
      priorPath !== undefined &&
      Buffer.compare(Buffer.from(priorPath), Buffer.from(entry.path)) >= 0
    ) {
      throw new Error('retained review paths are duplicate or out of order');
    }
    priorPath = entry.path;
    if (rawBlobs.has(entry.rawIdentity)) continue;
    const raw = readProtected(
      join(blobDirectory, entry.rawIdentity),
      entry.rawIdentity,
      maximumCandidateBytes,
    );
    total += raw.length;
    // Proof: two individually fitting real blobs whose sum exceeded a 30-byte
    // installed ceiling were refused; omitting this aggregate check returned both.
    if (!Number.isSafeInteger(total) || total > maximumCandidateBytes)
      throw new Error('retained review byte ceiling exceeded');
    rawBlobs.set(entry.rawIdentity, raw);
  }
  return { readyDirectory, manifest, manifestBytes: manifestBytes.toString('utf8'), rawBlobs };
}

/** Acquires only a configured local repository into a private bare store; remote access is a separate adapter. */
function prepareRetainedLocalReviewCandidate(
  input: LocalReviewAcquisitionInput,
  rawRequest: ActivationRequest,
) {
  const request = assertActivationRequest(rawRequest);
  const binding = validateGitHubRepositoryBinding(input.binding);
  // Proof: omitting this use-time check published a ready snapshot after the installed
  // store became world-readable; the post-install public-store test failed.
  requirePrivateDirectory(input.storeBase, 'review object store');
  // Proof: omitting this use-time check acquired from a symlink substituted for the
  // installed local source; the post-install source-substitution test failed.
  requireLocalSource(input.sourceRepository);
  for (const [label, value] of [
    ['preparation deadline', input.maximumPreparationMs],
    ['candidate entry ceiling', input.maximumCandidateEntries],
    ['candidate byte ceiling', input.maximumCandidateBytes],
  ] as const) {
    // Proof: omitting this positive-safe-integer check let NaN reach Bun's timeout; the
    // malformed-installed-deadline production test failed on the wrong failure boundary.
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be positive`);
  }
  // Proof: omitting each comparator independently made its named foreign-installed-binding
  // production test fail after acquisition proceeded (repository ID, target ref, policy,
  // mapping and toolkit identities were each watched separately).
  if (
    request.repositoryId !== binding.repositoryId ||
    request.targetRef !== binding.targetRef ||
    request.policyIdentity !== binding.policyIdentity ||
    request.mappingIdentity !== binding.mappingIdentity ||
    request.toolkitIdentity !== binding.toolkitIdentity
  ) {
    throw new Error('review acquisition differs from installed repository binding');
  }
  // Proof: removing each runtime arm independently let relative or symlinked correctly
  // pinned Git reach acquisition; removing the digest arm executed a wrong-pinned script
  // (marker appeared) before the later reader could refuse it.
  if (
    !isAbsolute(input.gitExecutablePath) ||
    !Sha256Pattern.test(input.gitExecutableIdentity) ||
    !lstatSync(input.gitExecutablePath).isFile() ||
    hashBytes(readFileSync(input.gitExecutablePath)) !== input.gitExecutableIdentity
  ) {
    throw new Error('review acquisition Git runtime differs from installed pin');
  }
  const deadline = performance.now() + input.maximumPreparationMs;
  const invokeGit = (args: string[]) => {
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new Error('review acquisition deadline exceeded');
    const invocation = Bun.spawnSync([input.gitExecutablePath, ...args], {
      // Proof: inheriting process.env let GIT_OBJECT_DIRECTORY redirect the real local
      // acquisition; the ambient-Git-override production test failed.
      env: {
        HOME: '/dev/null',
        LC_ALL: 'C',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_NO_REPLACE_OBJECTS: '1',
        // Proof: a pinned Git wrapper requiring GIT_NO_LAZY_FETCH failed the real local
        // acquisition when this key was omitted; the lazy-fetch test then passed restored.
        GIT_NO_LAZY_FETCH: '1',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_CONFIG_COUNT: '0',
        GIT_TERMINAL_PROMPT: '0',
      },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: Math.ceil(remaining),
      maxBuffer: input.maximumCandidateBytes,
    });
    // Proof: a pinned fetch that copied real objects then exited 73 was refused; omitting
    // only exitCode published it. Independent 2048-byte stdout and stderr wrappers were
    // refused at a 1024-byte bound and each named test failed with its length arm removed.
    if (
      invocation.exitCode !== 0 ||
      invocation.stdout.length > input.maximumCandidateBytes ||
      invocation.stderr.length > input.maximumCandidateBytes ||
      performance.now() > deadline
    ) {
      throw new Error('review acquisition Git operation failed or exceeded bound');
    }
  };
  const pending = mkdtempSync(join(input.storeBase, '.pending-'));
  let prepared:
    | { readyDirectory: string; snapshotIdentity: string; manifest: typeof CandidateManifest.infer }
    | undefined;
  let primary: unknown;
  try {
    requirePrivateDirectory(pending, 'pending review directory');
    const gitDirectory = join(pending, 'git');
    mkdirSync(gitDirectory, { mode: 0o700 });
    invokeGit(['init', '--bare', '--quiet', gitDirectory]);
    invokeGit([
      `--git-dir=${gitDirectory}`,
      'fetch',
      '--quiet',
      '--no-tags',
      '--no-recurse-submodules',
      '--no-write-fetch-head',
      '--',
      input.sourceRepository,
      request.headSha,
      request.baseSha,
    ]);
    const candidate = readOwnedReviewCandidate({
      repositoryId: request.repositoryId,
      objectStorePath: gitDirectory,
      gitExecutablePath: input.gitExecutablePath,
      gitExecutableIdentity: input.gitExecutableIdentity,
      headSha: request.headSha,
      baseSha: request.baseSha,
      classificationPolicy: input.classificationPolicy,
      maximumPreparationMs: Math.max(1, Math.floor(deadline - performance.now())),
      maximumCandidateEntries: input.maximumCandidateEntries,
      maximumCandidateBytes: input.maximumCandidateBytes,
    });
    if (performance.now() > deadline) throw new Error('review acquisition deadline exceeded');
    rmSync(gitDirectory, { recursive: true });
    const blobDirectory = join(pending, 'sha256');
    mkdirSync(blobDirectory, { mode: 0o700 });
    for (const [identity, bytes] of candidate.rawBlobs) {
      if (hashBytes(bytes) !== identity) throw new Error('review acquired blob digest differs');
      writeExclusive(join(blobDirectory, identity), bytes);
    }
    // Proof: injected fsync failure on only the blob directory refused publication;
    // omitting this sync let the mounted test return a ready snapshot.
    syncDirectory(blobDirectory);
    const manifestBytes = Buffer.from(candidate.manifestBytes, 'utf8');
    // Proof: omitting this prepublication bound renamed a >64 KiB real-candidate manifest
    // into ready state before the protected reread refused; the oversized-manifest test failed.
    if (manifestBytes.length > MaximumManifestBytes)
      throw new Error('review candidate manifest exceeds retained bound');
    writeExclusive(join(pending, 'manifest.json'), manifestBytes);
    // Proof: injected fsync failure on only the pending directory refused publication;
    // omitting this sync let the mounted test return a ready snapshot.
    syncDirectory(pending);
    const readyDirectory = join(input.storeBase, `ready-${candidate.snapshotIdentity}`);
    const lockPath = join(input.storeBase, '.retain-lock');
    const lock = openSync(
      lockPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    let finalizationFailure: unknown;
    try {
      if (lstatIfExists(readyDirectory)) {
        const existing = readRetainedReviewCandidate(
          input.storeBase,
          candidate.snapshotIdentity,
          input.maximumCandidateBytes,
        );
        if (
          existing.manifestBytes !== candidate.manifestBytes ||
          existing.rawBlobs.size !== candidate.rawBlobs.size ||
          [...candidate.rawBlobs].some(
            ([identity, bytes]) =>
              !Buffer.from(existing.rawBlobs.get(identity) ?? []).equals(bytes),
          )
        ) {
          throw new Error('retained review candidate conflicts');
        }
        // Proof: after an injected store-base fsync failure following rename, replay
        // previously returned the ready snapshot while the same barrier still failed;
        // the mounted two-attempt test failed until this replay sync was added.
        syncDirectory(input.storeBase);
      } else {
        renameSync(pending, readyDirectory);
        // Proof: injected fsync failure on only the store base refused durable success;
        // omitting this sync let the mounted test return a ready snapshot.
        syncDirectory(input.storeBase);
        readRetainedReviewCandidate(
          input.storeBase,
          candidate.snapshotIdentity,
          input.maximumCandidateBytes,
        );
      }
    } catch (cause) {
      finalizationFailure = cause;
    }
    let lockFailure: unknown;
    try {
      const opened = fstatSync(lock);
      const current = lstatSync(lockPath);
      // Proof: a mounted rename substitution replaced the lock inode during finalization;
      // omitting this owner/inode join deleted the foreign lock and returned success.
      if (
        !current.isFile() ||
        current.uid !== opened.uid ||
        current.dev !== opened.dev ||
        current.ino !== opened.ino ||
        current.nlink !== 1
      ) {
        throw new Error('retention lock ownership changed');
      }
    } catch (cause) {
      lockFailure = cause;
    }
    try {
      closeSync(lock);
    } catch (cause) {
      lockFailure =
        lockFailure === undefined
          ? cause
          : new AggregateError([lockFailure, cause], 'retention lock close failed', {
              cause: lockFailure,
            });
    }
    if (lockFailure === undefined) {
      try {
        unlinkSync(lockPath);
      } catch (cause) {
        lockFailure = cause;
      }
    }
    // Proof: injecting unlink failure after a corrupt retained blob produced both causes;
    // replacing aggregation with the cleanup error failed the lock-cleanup production test.
    if (finalizationFailure !== undefined && lockFailure !== undefined)
      throw new AggregateError(
        [finalizationFailure, lockFailure],
        'review finalization and lock cleanup failed',
        { cause: finalizationFailure },
      );
    if (finalizationFailure !== undefined) {
      if (finalizationFailure instanceof Error) throw finalizationFailure;
      throw new Error('review finalization failed', { cause: finalizationFailure });
    }
    if (lockFailure !== undefined) {
      if (lockFailure instanceof Error) throw lockFailure;
      throw new Error('retention lock cleanup failed', { cause: lockFailure });
    }
    prepared = {
      readyDirectory,
      snapshotIdentity: candidate.snapshotIdentity,
      manifest: candidate.manifest,
    };
  } catch (cause) {
    primary = cause;
  }
  let cleanupFailure: unknown;
  try {
    rmSync(pending, { recursive: true, force: true });
  } catch (cause) {
    cleanupFailure = cause;
  }
  const failures: unknown[] = [];
  if (primary !== undefined) failures.push(primary);
  if (cleanupFailure !== undefined) failures.push(cleanupFailure);
  // Proof: advancing the monotonic clock only during final pending cleanup previously
  // returned a ready snapshot after the deadline; the final-cleanup test was RED.
  // Proof: the same cleanup clock fault after a missing Git head now keeps both the
  // Git failure and deadline cause; omitting this fence failed the aggregate test.
  if (performance.now() > deadline)
    failures.push(new Error('review acquisition deadline exceeded'));
  // Proof: injected pending rm failure after an absent Git head preserved both causes;
  // omitting aggregation failed the pending-cleanup production test.
  if (failures.length > 1)
    throw new AggregateError(failures, 'review acquisition and cleanup failed', {
      cause: failures[0],
    });
  if (failures.length === 1) {
    const failure = failures[0];
    if (failure instanceof Error) throw failure;
    throw new Error('review acquisition failed', { cause: failure });
  }
  if (prepared === undefined) throw new Error('review acquisition finished without a candidate');
  return prepared;
}

function lstatIfExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
    throw cause;
  }
}
