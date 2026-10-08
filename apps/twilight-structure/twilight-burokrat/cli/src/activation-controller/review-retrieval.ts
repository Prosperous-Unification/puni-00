import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { hashBytes } from '../evidence/content-manifest';
import type { ReviewExpectation } from './controller';
import { decodeReviewJournalManifest, type ReviewJournalRegistration } from './review-journal';

const GitHubOrigin = 'https://api.github.com';
const Sha256 = /^[0-9a-f]{64}$/;
const GitHubName = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const ApiVersion = /^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/;
const MaximumManifestBytes = 65_536;
const MaximumArtifactBytes = 4_194_304;
const MaximumBundleBytes = 1_048_576;
const MaximumPageBytes = 1_048_576;
const MaximumAggregateBytes = 33_554_432;
const MaximumArtifacts = 64;
const MaximumCandidates = 16;
const MaximumPages = 5;
const OperationDeadlineMs = 30_000;
// Proof: shortening this to 1 ms made the never-settling GET fail the ten-second timing test.
const RequestDeadlineMs = 10_000;

const Attestations = type({
  attestations: type({
    repository_id: 'number.integer>=1',
    bundle_url: 'string>=1',
    'initiator?': 'string',
  }).array(),
});

export type ReviewResourceFetch = (url: string, init: RequestInit) => Promise<Response>;

export type ReviewRetrievalFailureKind =
  | 'absent'
  | 'inaccessible'
  | 'rate-limited'
  | 'unavailable'
  | 'invalid-response'
  | 'integrity-mismatch'
  | 'limit-exceeded'
  | 'cancelled';

/** A refusal at the byte-retrieval boundary, never an authenticated review verdict. */
export class ReviewRetrievalFailure extends Error {
  constructor(
    readonly kind: ReviewRetrievalFailureKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export interface ReviewRetrievalOptions {
  readonly journalBase: string;
  readonly registration: ReviewJournalRegistration;
  readonly expected: ReviewExpectation;
  readonly controlOwner: string;
  readonly repositoryId: number;
  readonly predicateType: string;
  readonly apiVersion: string;
  readonly retrievalOrigins: readonly string[];
  readonly stageRoot: string;
  readonly artifactCacheRoot?: string;
  readonly githubToken?: string;
  readonly journalToken?: string;
  readonly fetcher?: ReviewResourceFetch;
  readonly signal?: AbortSignal;
  /** Must record redacted cleanup failures reported after the caller's refusal has settled. */
  readonly observeLateFailure: (failure: ReviewRetrievalFailure) => void;
}

function refusal(kind: ReviewRetrievalFailureKind, message: string): ReviewRetrievalFailure {
  return new ReviewRetrievalFailure(kind, message);
}

function assertOrigin(origin: string): void {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw refusal('invalid-response', 'review retrieval origin malformed');
  }
  // Proof: dropping HTTPS or canonical-origin checks accepted mounted HTTP/path origins.
  if (parsed.protocol !== 'https:' || parsed.origin !== origin)
    throw refusal('invalid-response', 'review retrieval origin malformed');
}

function assertJournalBase(base: string, origins: readonly string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw refusal('invalid-response', 'review journal resource base malformed');
  }
  // Proof: removing this exact-origin predicate let the mounted foreign base issue a GET.
  if (
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.href !== base ||
    parsed.pathname.includes('//') ||
    /%(?:2f|5c|2e)/i.test(base) ||
    !origins.includes(parsed.origin)
  )
    throw refusal('invalid-response', 'review journal resource base malformed');
  return parsed;
}

function assertPrivateDirectory(path: string): void {
  if (!isAbsolute(path) || resolve(path) !== path || path.includes('\0'))
    throw refusal('invalid-response', 'review retrieval directory malformed');
  let entry: ReturnType<typeof lstatSync>;
  try {
    entry = lstatSync(path);
  } catch {
    throw refusal('inaccessible', 'review retrieval directory unreadable');
  }
  const uid = process.getuid?.();
  // Proof: a mounted foreign-owner stage root reached GET when this UID join was removed.
  if (uid === undefined || !entry.isDirectory() || entry.uid !== uid || (entry.mode & 0o077) !== 0)
    throw refusal('invalid-response', 'review retrieval directory not private');
}

function readCachedArtifact(path: string, identity: string): Buffer | undefined {
  let descriptor: number;
  try {
    // Proof: omitting O_NONBLOCK made the mounted FIFO cache entry take the
    // blocking-open path instead of promptly refusing its non-file inode.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return undefined;
    // Proof: removing O_NOFOLLOW accepted the symlinked cache entry's target.
    throw new ReviewRetrievalFailure('inaccessible', 'review artifact cache unreadable', { cause });
  }
  try {
    const entry = fstatSync(descriptor);
    const uid = process.getuid?.();
    // Proof: mounted foreign UID, nlink=2 and non-file/nlink=1 cache inodes
    // were accepted when their respective metadata checks were removed.
    if (
      uid === undefined ||
      !entry.isFile() ||
      entry.uid !== uid ||
      entry.nlink !== 1 ||
      (entry.mode & 0o077) !== 0
    )
      throw refusal('invalid-response', 'review artifact cache entry malformed');
    // Proof: a mounted oversized stat was accepted when this pre-read cap was removed.
    if (entry.size > MaximumArtifactBytes)
      throw refusal('limit-exceeded', 'review artifact cache entry too large');
    const bytes = readFileSync(descriptor);
    // Proof: an oversized mounted read after a small stat passed without this cap.
    if (bytes.byteLength > MaximumArtifactBytes)
      throw refusal('limit-exceeded', 'review artifact cache entry too large');
    // Proof: omitting cache rehash staged the conflicting cache bytes before the later
    // staged-file check refused; the mounted test observed the forbidden artifact write.
    if (hashBytes(bytes) !== identity)
      throw refusal('integrity-mismatch', 'review artifact cache digest differs');
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function assertBundleUrl(source: string, origins: readonly string[]): string {
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    throw refusal('invalid-response', 'review bundle URL malformed');
  }
  // Proof: omitting origin, userinfo or fragment guards fetched the mounted
  // foreign or altered signed bundle hint.
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.hash !== '' ||
    !origins.includes(parsed.origin)
  )
    throw refusal('invalid-response', 'review bundle origin not allowed');
  return parsed.href;
}

function writePinnedResource(
  directory: string,
  name: string,
  bytes: Uint8Array,
  identity: string,
): string {
  const path = join(directory, name);
  try {
    // Proof: changing wx to w overwrote a mounted symlink target before refusal.
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  } catch (cause) {
    throw new ReviewRetrievalFailure('inaccessible', 'review resource staging failed', { cause });
  }
  let descriptor: number;
  try {
    // Proof: omitting O_NOFOLLOW accepted a substituted staged symlink target.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (cause) {
    throw new ReviewRetrievalFailure('inaccessible', 'review staged resource unreadable', {
      cause,
    });
  }
  try {
    const entry = fstatSync(descriptor);
    // Proof: mounted non-file, nlink=2 and group-readable staged inodes each
    // passed when its corresponding reopened-file predicate was removed.
    if (!entry.isFile() || entry.nlink !== 1 || (entry.mode & 0o077) !== 0)
      throw refusal('invalid-response', 'review staged resource file malformed');
    if (hashBytes(readFileSync(descriptor)) !== identity)
      throw refusal('integrity-mismatch', 'review staged resource digest differs');
  } finally {
    closeSync(descriptor);
  }
  return path;
}

function nextCursor(
  link: string | null,
  current: string | undefined,
  path: string,
  predicate: string,
): string | undefined {
  if (link === null) return undefined;
  let next: string | undefined;
  let last: string | undefined;
  for (const part of link.split(',')) {
    const match = /^\s*<([^<>]+)>;\s*rel="(next|prev|first|last)"\s*$/.exec(part);
    if (match === null) throw refusal('invalid-response', 'review attestation Link malformed');
    if (match[2] !== 'next' && match[2] !== 'last') continue;
    if ((match[2] === 'next' && next !== undefined) || (match[2] === 'last' && last !== undefined))
      throw refusal('invalid-response', 'review attestation continuation repeated');
    let target: URL;
    try {
      target = new URL(match[1]);
    } catch {
      throw refusal('invalid-response', 'review attestation next URL malformed');
    }
    const cursor = target.searchParams.get('after');
    if (
      target.origin !== GitHubOrigin ||
      target.pathname !== path ||
      target.username !== '' ||
      target.password !== '' ||
      target.hash !== '' ||
      target.searchParams.size !== 3 ||
      target.searchParams.get('per_page') !== '20' ||
      target.searchParams.get('predicate_type') !== predicate ||
      cursor === null ||
      cursor === '' ||
      (match[2] === 'next' && cursor === current)
    )
      throw refusal('invalid-response', 'review attestation next changed request');
    if (match[2] === 'next') next = cursor;
    else last = cursor;
  }
  // Proof: without this future-last check, a partial first page with no next became complete.
  if (next === undefined && last !== undefined && last !== current)
    throw refusal('invalid-response', 'review attestation continuation missing');
  return next;
}

export interface RetrievedReviewJournal {
  readonly kind: 'retrieved-review-journal';
  readonly directory: string;
  readonly manifestPath: string;
  readonly artifacts: readonly {
    readonly kind: string;
    readonly identity: string;
    readonly path: string;
  }[];
  readonly bundleCandidates: readonly { readonly identity: string; readonly path: string }[];
}

/** Retrieves digest-addressed journal resources without assigning review or receipt authority. */
export async function retrieveReviewJournal(
  options: ReviewRetrievalOptions,
): Promise<RetrievedReviewJournal> {
  const startedAt = performance.now();
  const remaining = () => {
    if (options.signal?.aborted) throw refusal('cancelled', 'review retrieval cancelled');
    const left = OperationDeadlineMs - (performance.now() - startedAt);
    if (left <= 0) throw refusal('limit-exceeded', 'review retrieval deadline exceeded');
    return left;
  };
  if (
    // Proof: malformed digest/owner/repository/version/predicate/origin inputs
    // each crossed the boundary or changed the refusal when its guard was removed.
    !Sha256.test(options.registration.manifestIdentity) ||
    !GitHubName.test(options.controlOwner) ||
    !Number.isSafeInteger(options.repositoryId) ||
    options.repositoryId < 1 ||
    !ApiVersion.test(options.apiVersion) ||
    !options.predicateType.startsWith('https://') ||
    options.retrievalOrigins.length === 0
  )
    throw refusal('invalid-response', 'review retrieval authority malformed');
  for (const origin of options.retrievalOrigins) assertOrigin(origin);
  const base = assertJournalBase(options.journalBase, options.retrievalOrigins);
  assertPrivateDirectory(options.stageRoot);
  // Proof: without this check, a symlinked cache root was read and returned.
  if (options.artifactCacheRoot !== undefined) assertPrivateDirectory(options.artifactCacheRoot);
  const fetcher = options.fetcher ?? fetch;
  let aggregateBytes = 0;
  const getBytes = async (
    url: string,
    family: 'manifest' | 'artifact' | 'github' | 'bundle',
    maximumBytes: number,
  ): Promise<{ bytes: Buffer; link: string | null }> => {
    const requestDeadlineMs = Math.min(RequestDeadlineMs, remaining());
    const requestDeadlineAt = performance.now() + requestDeadlineMs;
    const assertRequestAlive = () => {
      remaining();
      if (performance.now() >= requestDeadlineAt)
        throw refusal('limit-exceeded', 'review request deadline exceeded');
    };
    const controller = new AbortController();
    let abandoned = false;
    const cancel = () => {
      controller.abort();
    };
    options.signal?.addEventListener('abort', cancel, { once: true });
    let rejectAbort: () => void = () => {
      throw new Error('review abort listener uninitialized');
    };
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => {
        abandoned = true;
        reject(new Error('aborted'));
      };
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
    });
    if (options.signal?.aborted) cancel();
    const timer = setTimeout(() => {
      controller.abort();
    }, requestDeadlineMs);
    const cancelAfterFailure = async (
      cancelBody: () => Promise<void>,
      primaryCause: unknown,
    ): Promise<never> => {
      try {
        // Proof: a stalled redirect/reader cancel previously held the operation
        // after caller abort; the shared request timer and abort now bound teardown.
        await Promise.race([cancelBody(), aborted]);
      } catch (cleanupCause) {
        if (
          options.signal?.aborted ||
          controller.signal.aborted ||
          performance.now() >= requestDeadlineAt
        )
          throw cleanupCause;
        const primary =
          primaryCause instanceof ReviewRetrievalFailure
            ? primaryCause
            : refusal('unavailable', 'review resource GET unavailable');
        const cleanup = refusal('unavailable', 'review response cleanup failed');
        throw new ReviewRetrievalFailure(primary.kind, primary.message, {
          cause: new AggregateError([primary, cleanup], 'review response and cleanup failed'),
        });
      }
      throw primaryCause;
    };
    try {
      const headers = new Headers();
      if (family === 'github') {
        // Proof: altered accept and API-version headers failed the mounted GET trace.
        headers.set('accept', 'application/vnd.github+json');
        headers.set('x-github-api-version', options.apiVersion);
        if (options.githubToken !== undefined)
          headers.set('authorization', `Bearer ${options.githubToken}`);
      } else if (family === 'manifest' || family === 'artifact') {
        headers.set(
          'accept',
          family === 'manifest' ? 'application/json' : 'application/octet-stream',
        );
        if (options.journalToken !== undefined)
          headers.set('authorization', `Bearer ${options.journalToken}`);
      }
      const fetched = Promise.resolve().then(() =>
        fetcher(url, {
          // Proof: mutating GET or omit-credentials changed the mounted request trace.
          method: 'GET',
          headers,
          redirect: 'error',
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal,
        }),
      );
      // Proof: without this late owner, a fetch that ignored abort returned a live body
      // after the request had already refused and removed its pending staging directory.
      void fetched.then(
        (lateResponse) => {
          if (abandoned && lateResponse.body !== null) {
            const body = lateResponse.body;
            let deadlineTimer: ReturnType<typeof setTimeout>;
            const deadline = new Promise<never>((_resolve, reject) => {
              deadlineTimer = setTimeout(
                () => {
                  reject(
                    refusal('limit-exceeded', 'review late response cleanup deadline exceeded'),
                  );
                },
                Math.max(0, requestDeadlineAt - performance.now()),
              );
            });
            // Proof: mounted late cancel rejection and stall now reach the required,
            // redacted observer instead of being discarded or left pending forever.
            void Promise.race([Promise.resolve().then(() => body.cancel()), deadline]).then(
              () => {
                clearTimeout(deadlineTimer);
                // Proof: a mounted finite cancel advanced the monotonic clock past
                // ten seconds before timer delivery and previously reported no failure.
                if (performance.now() >= requestDeadlineAt)
                  options.observeLateFailure(
                    refusal('limit-exceeded', 'review late response cleanup deadline exceeded'),
                  );
              },
              (cleanupCause: unknown) => {
                clearTimeout(deadlineTimer);
                options.observeLateFailure(
                  cleanupCause instanceof ReviewRetrievalFailure
                    ? cleanupCause
                    : refusal('unavailable', 'review late response cleanup failed'),
                );
              },
            );
          }
        },
        () => {
          return;
        },
      );
      const response = await Promise.race([fetched, aborted]);
      let declared: string | null;
      try {
        // Proof: a fetch that advanced the monotonic clock 10,001 ms without firing
        // the timer previously proceeded through all four GETs and returned success.
        assertRequestAlive();
        if (response.redirected || (response.status >= 300 && response.status < 400))
          throw refusal('invalid-response', 'review resource redirected');
        if (response.status === 404) throw refusal('absent', 'review resource absent');
        if (
          response.status === 429 ||
          (family === 'github' &&
            response.status === 403 &&
            response.headers.get('x-ratelimit-remaining') === '0')
        )
          throw refusal('rate-limited', 'review resource rate limited');
        if (response.status === 401 || response.status === 403)
          throw refusal('inaccessible', 'review resource inaccessible');
        if (response.status >= 500) throw refusal('unavailable', 'review resource unavailable');
        if (response.status !== 200)
          throw refusal('invalid-response', 'review resource status invalid');
        if (response.headers.has('content-encoding'))
          throw refusal('invalid-response', 'review resource content encoding unsupported');
        const contentType = response.headers.get('content-type');
        if (
          (family === 'manifest' && contentType !== 'application/json') ||
          (family === 'artifact' && contentType !== 'application/octet-stream') ||
          (family === 'github' &&
            contentType !== 'application/vnd.github+json' &&
            !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType ?? ''))
        )
          throw refusal('invalid-response', 'review resource content type invalid');
        declared = response.headers.get('content-length');
        if (
          declared !== null &&
          (!/^\d+$/.test(declared) ||
            Number(declared) > maximumBytes ||
            Number(declared) > MaximumAggregateBytes - aggregateBytes)
        )
          throw refusal('limit-exceeded', 'review resource declared bytes exceed limit');
        const body: unknown = response.body;
        if (body === null) throw refusal('invalid-response', 'review resource body absent');
      } catch (cause) {
        // Proof: omitting this cancel left the mounted redirect body live after refusal.
        const body: unknown = response.body;
        if (body instanceof ReadableStream) await cancelAfterFailure(() => body.cancel(), cause);
        throw cause;
      }
      const reader = response.body?.getReader();
      if (reader === undefined) throw refusal('invalid-response', 'review resource body absent');
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await Promise.race([reader.read(), aborted]);
          // Proof: without this fence the mounted expired first body read made
          // a second read before refusal.
          assertRequestAlive();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > maximumBytes || aggregateBytes + size > MaximumAggregateBytes)
            throw refusal('limit-exceeded', 'review resource streamed bytes exceed limit');
          chunks.push(part.value);
        }
      } catch (cause) {
        await cancelAfterFailure(() => reader.cancel(), cause);
      } finally {
        reader.releaseLock();
      }
      if (declared !== null && Number(declared) !== size)
        throw refusal('invalid-response', 'review resource declared length differs from body');
      aggregateBytes += size;
      assertRequestAlive();
      return { bytes: Buffer.concat(chunks), link: response.headers.get('link') };
    } catch (cause) {
      abandoned = true;
      if (options.signal?.aborted) throw refusal('cancelled', 'review retrieval cancelled');
      if (controller.signal.aborted || performance.now() >= requestDeadlineAt)
        throw refusal('limit-exceeded', 'review retrieval deadline exceeded');
      if (cause instanceof ReviewRetrievalFailure) throw cause;
      // Proof: retaining the transport cause exposed a signed bundle query sentinel.
      throw refusal('unavailable', 'review resource GET unavailable');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', rejectAbort);
    }
  };
  let directory: string;
  // Proof: omitting this precheck created a pending directory for an already aborted operation.
  remaining();
  try {
    // Proof: an unwritable private staging root previously escaped as an untyped fs error.
    directory = mkdtempSync(join(options.stageRoot, 'pending-'));
  } catch (cause) {
    throw new ReviewRetrievalFailure('inaccessible', 'review staging directory unavailable', {
      cause,
    });
  }
  try {
    const manifestUrl = `${base.href.replace(/\/$/, '')}/v1/manifests/sha256/${options.registration.manifestIdentity}`;
    const manifestResponse = await getBytes(manifestUrl, 'manifest', MaximumManifestBytes);
    if (hashBytes(manifestResponse.bytes) !== options.registration.manifestIdentity)
      throw refusal('integrity-mismatch', 'review manifest digest differs');
    let manifest: ReturnType<typeof decodeReviewJournalManifest>;
    try {
      // Proof: without fatal UTF-8, the mounted invalid byte reached the manifest decoder.
      const manifestBytes = new TextDecoder('utf-8', { fatal: true }).decode(
        manifestResponse.bytes,
      );
      manifest = decodeReviewJournalManifest(manifestBytes, options.registration, options.expected);
    } catch {
      throw refusal('invalid-response', 'review journal manifest malformed');
    }
    if (manifest.artifacts.length > MaximumArtifacts)
      throw refusal('limit-exceeded', 'review artifact count exceeded');
    const artifactPairs = new Set<string>();
    for (const artifact of manifest.artifacts) {
      const pair = `${artifact.kind}:${artifact.identity}`;
      // Proof: omitting pair uniqueness fetched and staged the duplicate manifest entry.
      if (artifactPairs.has(pair)) throw refusal('invalid-response', 'review artifact repeated');
      artifactPairs.add(pair);
    }
    const manifestPath = writePinnedResource(
      directory,
      `manifest-${options.registration.manifestIdentity}`,
      manifestResponse.bytes,
      options.registration.manifestIdentity,
    );
    const artifacts: { kind: string; identity: string; path: string }[] = [];
    const stagedArtifacts = new Map<string, string>();
    for (const artifact of manifest.artifacts) {
      remaining();
      let path = stagedArtifacts.get(artifact.identity);
      if (path === undefined) {
        let bytes =
          options.artifactCacheRoot === undefined
            ? undefined
            : readCachedArtifact(
                join(options.artifactCacheRoot, artifact.identity),
                artifact.identity,
              );
        if (bytes === undefined) {
          const artifactUrl = `${base.href.replace(/\/$/, '')}/v1/artifacts/sha256/${artifact.identity}`;
          bytes = (await getBytes(artifactUrl, 'artifact', MaximumArtifactBytes)).bytes;
        } else {
          // Proof: omitting this accounting accepted eight cached 4 MiB artifacts past the whole limit.
          if (bytes.byteLength > MaximumAggregateBytes - aggregateBytes)
            throw refusal('limit-exceeded', 'review cached bytes exceed aggregate limit');
          aggregateBytes += bytes.byteLength;
        }
        path = writePinnedResource(
          directory,
          `artifact-${artifact.identity}`,
          bytes,
          artifact.identity,
        );
        stagedArtifacts.set(artifact.identity, path);
      }
      artifacts.push({ kind: artifact.kind, identity: artifact.identity, path });
    }
    const subjectPath = `/orgs/${options.controlOwner}/attestations/sha256%3A${options.registration.manifestIdentity}`;
    const bundleUrls: string[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 1; page <= MaximumPages; page += 1) {
      remaining();
      const query = new URLSearchParams({ per_page: '20', predicate_type: options.predicateType });
      if (cursor !== undefined) query.set('after', cursor);
      const listingResponse = await getBytes(
        `${GitHubOrigin}${subjectPath}?${query}`,
        'github',
        MaximumPageBytes,
      );
      let listing: typeof Attestations.infer;
      try {
        // Proof: disabling fatal decoding admitted a mounted invalid UTF-8 byte
        // in an otherwise valid informational GitHub initiator string.
        const listingBytes = new TextDecoder('utf-8', { fatal: true }).decode(
          listingResponse.bytes,
        );
        const parsed: unknown = JSON.parse(listingBytes);
        listing = parseOrThrow(Attestations, parsed);
      } catch {
        throw refusal('invalid-response', 'review attestation listing malformed');
      }
      if (listing.attestations.length > 20)
        throw refusal('invalid-response', 'review attestation page exceeds request size');
      for (const attestation of listing.attestations) {
        if (!Number.isSafeInteger(attestation.repository_id))
          throw refusal('invalid-response', 'review attestation repository ID unsafe');
        if (attestation.repository_id === options.repositoryId) {
          bundleUrls.push(assertBundleUrl(attestation.bundle_url, options.retrievalOrigins));
          if (bundleUrls.length > MaximumCandidates)
            throw refusal('limit-exceeded', 'review candidate count exceeded');
        }
      }
      const next = nextCursor(listingResponse.link, cursor, subjectPath, options.predicateType);
      if (next === undefined) break;
      if (page === MaximumPages) throw refusal('limit-exceeded', 'review page count exceeded');
      if (cursors.has(next)) throw refusal('invalid-response', 'review cursor loop');
      cursors.add(next);
      cursor = next;
    }
    const bundleCandidates: { identity: string; path: string }[] = [];
    const stagedBundles = new Map<string, string>();
    for (const url of bundleUrls) {
      remaining();
      const bundleResponse = await getBytes(url, 'bundle', MaximumBundleBytes);
      const identity = hashBytes(bundleResponse.bytes);
      let path = stagedBundles.get(identity);
      if (path === undefined) {
        path = writePinnedResource(directory, `bundle-${identity}`, bundleResponse.bytes, identity);
        stagedBundles.set(identity, path);
      }
      bundleCandidates.push({ identity, path });
    }
    // Proof: omitting this final fence returned success after mounted bundle
    // staging advanced the whole monotonic clock beyond its deadline.
    remaining();
    return {
      kind: 'retrieved-review-journal',
      directory,
      manifestPath,
      artifacts,
      bundleCandidates,
    };
  } catch (cause) {
    const primary =
      cause instanceof ReviewRetrievalFailure
        ? cause
        : refusal('unavailable', 'review retrieval unavailable');
    let cleanupFailure: { cause: unknown } | undefined;
    try {
      rmSync(directory, { recursive: true });
    } catch (cleanupCause) {
      cleanupFailure = { cause: cleanupCause };
    }
    let finalFence: ReviewRetrievalFailure | undefined;
    try {
      // Proof: mounted rmSync time advance and caller abort previously returned
      // absent after the whole deadline/cancellation had occurred during cleanup.
      remaining();
    } catch (fenceCause) {
      if (fenceCause instanceof ReviewRetrievalFailure) finalFence = fenceCause;
      else throw fenceCause;
    }
    if (finalFence !== undefined)
      throw new ReviewRetrievalFailure(finalFence.kind, finalFence.message, {
        cause: new AggregateError(
          cleanupFailure === undefined
            ? [primary, finalFence]
            : [primary, cleanupFailure.cause, finalFence],
          'review retrieval and cleanup deadline failed',
        ),
      });
    if (cleanupFailure !== undefined) {
      // Proof: a mounted rmSync failure previously replaced a typed absent
      // refusal with only the raw cleanup error, losing the primary cause.
      throw new ReviewRetrievalFailure(primary.kind, primary.message, {
        cause: new AggregateError(
          [primary, cleanupFailure.cause],
          'review retrieval and cleanup failed',
        ),
      });
    }
    throw cause;
  }
}
