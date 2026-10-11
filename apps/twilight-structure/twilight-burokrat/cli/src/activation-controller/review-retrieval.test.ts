import * as filesystem from 'node:fs';
import {
  chmodSync,
  constants,
  linkSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, spyOn, test } from 'bun:test';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import type { ReviewExpectation } from './controller';
import type { ReviewJournalRegistration } from './review-journal';
import * as reviewJournal from './review-journal';
import {
  retrieveReviewJournal,
  type ReviewResourceFetch,
  ReviewRetrievalFailure,
  type ReviewRetrievalOptions,
} from './review-retrieval';

const artifactBytes = Buffer.from('retained cold output');
const bundleBytes = Buffer.from('{"signed":"candidate"}');
const artifactIdentity = hashBytes(artifactBytes);

function fixture(
  artifactEntries: readonly {
    readonly kind: 'cold-output' | 'raw-response';
    readonly identity: string;
  }[] = [{ kind: 'cold-output', identity: artifactIdentity }],
) {
  const stageRoot = mkdtempSync(join(tmpdir(), 'review-retrieval-test-'));
  const expected: ReviewExpectation = {
    requestIdentity: '1'.repeat(64),
    reviewId: 'review.primary',
    obligationIdentity: '2'.repeat(64),
    attempt: 0,
    phase: 'cold',
    invocationId: 'invocation.primary',
    executorId: 'review.executor',
    protocolIdentity: '3'.repeat(64),
    promptIdentity: '4'.repeat(64),
    journalIssuerId: 'journal.issuer',
  };
  const manifestBytes = serializeCanonical({
    schemaVersion: 1,
    kind: 'review-journal-manifest',
    descriptorIdentity: '5'.repeat(64),
    journalIssuerId: expected.journalIssuerId,
    executorId: expected.executorId,
    protocolIdentity: expected.protocolIdentity,
    promptIdentity: expected.promptIdentity,
    journalId: 'journal.primary',
    effectKey: '6'.repeat(64),
    payloadDigest: '7'.repeat(64),
    requestIdentity: expected.requestIdentity,
    reviewId: expected.reviewId,
    attempt: expected.attempt,
    invocationId: expected.invocationId,
    phases: [
      {
        phase: 'cold',
        obligationIdentity: expected.obligationIdentity,
        submissionDigest: '8'.repeat(64),
        sourceEvidenceDigest: '9'.repeat(64),
        status: 'failed',
      },
    ],
    artifacts: artifactEntries,
  });
  const registration: ReviewJournalRegistration = {
    schemaVersion: 1,
    kind: 'review-journal-registration',
    registrationKey: 'a'.repeat(64),
    requestIdentity: expected.requestIdentity,
    reviewId: expected.reviewId,
    attempt: expected.attempt,
    invocationId: expected.invocationId,
    coldObligationIdentity: expected.obligationIdentity,
    informedObligationIdentity: 'b'.repeat(64),
    effectKey: '6'.repeat(64),
    payloadDigest: '7'.repeat(64),
    descriptorIdentity: '5'.repeat(64),
    journalIssuerId: expected.journalIssuerId,
    executorId: expected.executorId,
    protocolIdentity: expected.protocolIdentity,
    promptIdentity: expected.promptIdentity,
    journalId: 'journal.primary',
    manifestIdentity: hashBytes(manifestBytes),
  };
  const calls: { url: string; init: RequestInit }[] = [];
  const lateFailures: ReviewRetrievalFailure[] = [];
  const fetcher = async (url: string, init: RequestInit): Promise<Response> => {
    await Promise.resolve();
    calls.push({ url, init });
    if (url.includes('/v1/manifests/'))
      return new Response(manifestBytes, { headers: { 'content-type': 'application/json' } });
    if (url.includes('/v1/artifacts/'))
      return new Response(artifactBytes, {
        headers: { 'content-type': 'application/octet-stream' },
      });
    if (url.startsWith('https://api.github.com/'))
      return Response.json({
        attestations: [{ repository_id: 42, bundle_url: 'https://bundles.example/one' }],
      });
    if (url === 'https://bundles.example/one')
      return new Response(bundleBytes, { headers: { 'content-type': 'application/json' } });
    throw new Error('unexpected fake URL');
  };
  const options: ReviewRetrievalOptions = {
    journalBase: 'https://journal.example/resource',
    registration,
    expected,
    controlOwner: 'trusted-org',
    repositoryId: 42,
    predicateType: 'https://example.test/review/v1',
    apiVersion: '2026-03-10',
    retrievalOrigins: ['https://journal.example', 'https://bundles.example'],
    stageRoot,
    githubToken: 'github-secret',
    journalToken: 'journal-secret',
    observeLateFailure: (failure: ReviewRetrievalFailure) => {
      lateFailures.push(failure);
    },
    fetcher,
  };
  return { stageRoot, manifestBytes, options, calls, lateFailures };
}

function replaceResponse(
  options: ReviewRetrievalOptions,
  select: (url: string, init: RequestInit) => Response | undefined,
): ReviewResourceFetch {
  const original = options.fetcher;
  if (original === undefined) throw new Error('fixture fetcher absent');
  return async (url, init) => {
    const replacement = select(url, init);
    return replacement ?? original(url, init);
  };
}

async function rejectionKind(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (cause) {
    return cause instanceof Error && 'kind' in cause && typeof cause.kind === 'string'
      ? cause.kind
      : undefined;
  }
  return undefined;
}

async function rejectionMessage(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (cause) {
    return cause instanceof Error ? cause.message : undefined;
  }
  return undefined;
}

test('retrieval stages exact digest resources without receipt authority or credential crossover', async () => {
  const { stageRoot, manifestBytes, options, calls } = fixture();
  try {
    const journal = await retrieveReviewJournal(options);
    expect(journal.kind).toBe('retrieved-review-journal');
    expect(readFileSync(journal.manifestPath).toString()).toBe(manifestBytes);
    expect(readFileSync(journal.artifacts[0].path)).toEqual(artifactBytes);
    expect(readFileSync(journal.bundleCandidates[0].path)).toEqual(bundleBytes);
    expect(lstatSync(journal.directory).mode & 0o777).toBe(0o700);
    expect(lstatSync(journal.manifestPath).mode & 0o777).toBe(0o600);
    expect(journal).not.toHaveProperty('binding');
    expect(journal).not.toHaveProperty('status');
    expect(calls.map((call) => call.url)).toEqual([
      `https://journal.example/resource/v1/manifests/sha256/${options.registration.manifestIdentity}`,
      `https://journal.example/resource/v1/artifacts/sha256/${artifactIdentity}`,
      `https://api.github.com/orgs/trusted-org/attestations/sha256%3A${options.registration.manifestIdentity}?per_page=20&predicate_type=https%3A%2F%2Fexample.test%2Freview%2Fv1`,
      'https://bundles.example/one',
    ]);
    for (const call of calls) {
      expect(call.init.method).toBe('GET');
      expect(call.init.redirect).toBe('error');
      expect(call.init.cache).toBe('no-store');
      expect(call.init.credentials).toBe('omit');
      const headers = new Headers(call.init.headers);
      if (call.url.startsWith('https://api.github.com/')) {
        expect(headers.get('authorization')).toBe('Bearer github-secret');
        expect(headers.get('x-github-api-version')).toBe(options.apiVersion);
        expect(headers.get('accept')).toBe('application/vnd.github+json');
      } else if (call.url.startsWith('https://journal.example/'))
        expect(headers.get('authorization')).toBe('Bearer journal-secret');
      else expect(headers.get('authorization')).toBeNull();
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses malformed authority fields and non-HTTPS origins before any GET', async () => {
  const { stageRoot, options, calls } = fixture();
  const invalid = [
    { registration: { ...options.registration, manifestIdentity: 'A'.repeat(64) } },
    { controlOwner: 'other/org' },
    { repositoryId: Number.MAX_SAFE_INTEGER + 1 },
    { apiVersion: 'latest' },
    { predicateType: 'http://example.test/review/v1' },
    { retrievalOrigins: [] },
    {
      journalBase: 'http://journal.example/resource',
      retrievalOrigins: ['http://journal.example'],
    },
  ] satisfies Partial<ReviewRetrievalOptions>[];
  try {
    for (const [index, change] of invalid.entries()) {
      expect(await rejectionMessage(retrieveReviewJournal({ ...options, ...change }))).toBe(
        index === invalid.length - 1
          ? 'review retrieval origin malformed'
          : 'review retrieval authority malformed',
      );
      expect(calls).toHaveLength(0);
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses a journal base outside exact allowed origin before any GET', async () => {
  const { stageRoot, options, calls } = fixture();
  try {
    expect(
      await rejectionKind(
        retrieveReviewJournal({ ...options, journalBase: 'https://foreign.example/resource' }),
      ),
    ).toBe('invalid-response');
    expect(calls).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses noncanonical journal bases and allowlist origins before any GET', async () => {
  const { stageRoot, options, calls } = fixture();
  try {
    for (const journalBase of [
      'https://user@journal.example/resource',
      'https://journal.example/resource?query=1',
      'https://journal.example/resource#fragment',
      'https://journal.example/a/../resource',
      'https://journal.example/resource%2Fother',
      'https://journal.example/resource//other',
    ]) {
      expect(await rejectionKind(retrieveReviewJournal({ ...options, journalBase }))).toBe(
        'invalid-response',
      );
    }
    expect(
      await rejectionKind(
        retrieveReviewJournal({ ...options, retrievalOrigins: ['https://journal.example/path'] }),
      ),
    ).toBe('invalid-response');
    expect(
      await rejectionKind(
        retrieveReviewJournal({
          ...options,
          retrievalOrigins: ['https://journal.example/path', 'https://journal.example'],
        }),
      ),
    ).toBe('invalid-response');
    expect(calls).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses same-origin redirect without forwarding the journal credential', async () => {
  const { stageRoot, options, calls } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/manifests/')
        ? new Response(null, {
            status: 302,
            headers: { location: 'https://journal.example/resource/v1/manifests/sha256/elsewhere' },
          })
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'invalid-response',
    );
    expect(calls).toHaveLength(0);
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses a followed redirect even when the final HTTP status is 200', async () => {
  const { stageRoot, options } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) => {
      if (!url.includes('/v1/manifests/')) return undefined;
      const response = new Response('{}', { headers: { 'content-type': 'application/json' } });
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    });
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'invalid-response',
    );
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses foreign bundle hint before issuing a credentialed or anonymous GET', async () => {
  const { stageRoot, options, calls } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.startsWith('https://api.github.com/')
        ? Response.json({
            attestations: [
              { repository_id: 42, bundle_url: 'https://foreign.example/signed?secret=sentinel' },
            ],
          })
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'invalid-response',
    );
    expect(calls.some((call) => call.url.startsWith('https://foreign.example/'))).toBe(false);
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses bundle URLs with userinfo or fragments before any bundle GET', async () => {
  const { stageRoot, options, calls } = fixture();
  try {
    for (const bundleUrl of [
      'https://user@bundles.example/one',
      'https://bundles.example/one#fragment',
    ]) {
      const fetcher = replaceResponse(options, (url) =>
        url.startsWith('https://api.github.com/')
          ? Response.json({ attestations: [{ repository_id: 42, bundle_url: bundleUrl }] })
          : undefined,
      );
      expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
        'invalid-response',
      );
      expect(calls.some((call) => call.url.includes('/one'))).toBe(false);
      expect(readdirSync(stageRoot)).toHaveLength(0);
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses changed pagination filters without exposing partial candidates', async () => {
  const { stageRoot, options } = fixture();
  let candidateGets = 0;
  try {
    const fetcher = replaceResponse(options, (url) => {
      if (!url.startsWith('https://api.github.com/')) return undefined;
      candidateGets += 1;
      return Response.json(
        { attestations: [{ repository_id: 42, bundle_url: 'https://bundles.example/one' }] },
        {
          headers: {
            link: `<https://api.github.com/orgs/trusted-org/attestations/sha256%3A${options.registration.manifestIdentity}?per_page=99&predicate_type=https%3A%2F%2Fexample.test%2Freview%2Fv1&after=cursor-a>; rel="next"`,
          },
        },
      );
    });
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'invalid-response',
    );
    expect(candidateGets).toBe(1);
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses foreign, ambiguous and altered GitHub continuation links', async () => {
  const { stageRoot, options } = fixture();
  const route = `/orgs/trusted-org/attestations/sha256%3A${options.registration.manifestIdentity}`;
  const query =
    '?per_page=20&predicate_type=https%3A%2F%2Fexample.test%2Freview%2Fv1&after=cursor-a';
  const canonical = `https://api.github.com${route}${query}`;
  const links = [
    `https://other.example${route}${query}`,
    `https://api.github.com/orgs/other/attestations/sha256%3A${options.registration.manifestIdentity}${query}`,
    `${canonical}&before=cursor-b`,
    `${canonical}&after=cursor-b`,
    `${canonical}#fragment`,
  ];
  try {
    for (const target of links) {
      let page = 0;
      const fetcher = replaceResponse(options, (url) =>
        url.startsWith('https://api.github.com/')
          ? Response.json(
              { attestations: [] },
              { headers: page++ === 0 ? { link: `<${target}>; rel="next"` } : {} },
            )
          : undefined,
      );
      expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
        'invalid-response',
      );
      expect(readdirSync(stageRoot)).toHaveLength(0);
    }
    const duplicate = `<${canonical}>; rel="next", <${canonical}>; rel="next"`;
    let page = 0;
    const fetcher = replaceResponse(options, (url) =>
      url.startsWith('https://api.github.com/')
        ? Response.json({ attestations: [] }, { headers: page++ === 0 ? { link: duplicate } : {} })
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'invalid-response',
    );
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses artifact digest mismatch and removes pending stage', async () => {
  const { stageRoot, options } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/artifacts/')
        ? new Response('substituted bytes', {
            headers: { 'content-type': 'application/octet-stream' },
          })
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'integrity-mismatch',
    );
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval reopens and rehashes a staged artifact after the write boundary', async () => {
  const { stageRoot, options } = fixture();
  const originalWrite = filesystem.writeFileSync;
  const write = spyOn(filesystem, 'writeFileSync').mockImplementation(
    (path, contents, settings) => {
      originalWrite(
        path,
        String(path).includes('/artifact-') ? Buffer.from('corrupt after validation') : contents,
        settings,
      );
    },
  );
  try {
    expect(await rejectionKind(retrieveReviewJournal(options))).toBe('integrity-mismatch');
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    write.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses an occupied staged digest path without following its symlink', async () => {
  const { stageRoot, options } = fixture();
  const outside = join(stageRoot, 'outside');
  writeFileSync(outside, 'outside-sentinel', { mode: 0o600 });
  const originalWrite = filesystem.writeFileSync;
  let injected = false;
  const write = spyOn(filesystem, 'writeFileSync').mockImplementation(
    (path, contents, settings) => {
      if (!injected && String(path).includes('/artifact-')) {
        symlinkSync(outside, String(path));
        injected = true;
      }
      originalWrite(path, contents, settings);
    },
  );
  try {
    expect(await rejectionKind(retrieveReviewJournal(options))).toBe('inaccessible');
    expect(injected).toBe(true);
    expect(readFileSync(outside, 'utf8')).toBe('outside-sentinel');
    expect(readdirSync(stageRoot)).toEqual(['outside']);
  } finally {
    write.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval reopens a staged digest without following a substituted symlink', async () => {
  const { stageRoot, options } = fixture();
  const outside = join(stageRoot, 'outside');
  writeFileSync(outside, artifactBytes, { mode: 0o600 });
  const originalOpen = filesystem.openSync;
  let substituted = false;
  const open = spyOn(filesystem, 'openSync').mockImplementation(((path: string, flags: number) => {
    if (!substituted && path.includes('/artifact-')) {
      filesystem.renameSync(path, `${path}.saved`);
      symlinkSync(outside, path);
      substituted = true;
    }
    return originalOpen(path, flags);
  }) as typeof filesystem.openSync);
  try {
    expect(await rejectionKind(retrieveReviewJournal(options))).toBe('inaccessible');
    expect(substituted).toBe(true);
    expect(readFileSync(outside)).toEqual(artifactBytes);
    expect(readdirSync(stageRoot)).toEqual(['outside']);
  } finally {
    open.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses malformed staged inode type, link count and mode after reopen', async () => {
  for (const field of ['type', 'links', 'mode'] as const) {
    const { stageRoot, options } = fixture();
    const originalStat = filesystem.fstatSync;
    let statCalls = 0;
    const stat = spyOn(filesystem, 'fstatSync').mockImplementation(((descriptor: number) => {
      const entry = originalStat(descriptor);
      statCalls += 1;
      if (statCalls !== 2) return entry;
      if (field === 'type') return Object.assign(entry, { isFile: () => false });
      if (field === 'links') return Object.assign(entry, { nlink: 2 });
      return Object.assign(entry, { mode: entry.mode | 0o044 });
    }) as typeof filesystem.fstatSync);
    try {
      expect(await rejectionKind(retrieveReviewJournal(options))).toBe('invalid-response');
      expect(readdirSync(stageRoot)).toHaveLength(0);
    } finally {
      stat.mockRestore();
      rmSync(stageRoot, { recursive: true, force: true });
    }
  }
});

test('retrieval rejects a conflicting artifact cache entry instead of trusting or replacing it', async () => {
  const { stageRoot, options } = fixture();
  try {
    const cacheRoot = mkdtempSync(join(stageRoot, 'cache-'));
    writeFileSync(join(cacheRoot, artifactIdentity), 'different bytes', { mode: 0o600 });
    const originalWrite = filesystem.writeFileSync;
    const writes: string[] = [];
    const write = spyOn(filesystem, 'writeFileSync').mockImplementation(
      (path, contents, settings) => {
        writes.push(String(path));
        originalWrite(path, contents, settings);
      },
    );
    try {
      expect(
        await rejectionKind(retrieveReviewJournal({ ...options, artifactCacheRoot: cacheRoot })),
      ).toBe('integrity-mismatch');
      expect(writes.some((path) => path.includes('/artifact-'))).toBe(false);
      expect(readdirSync(stageRoot)).toHaveLength(1);
    } finally {
      write.mockRestore();
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval rejects a symlinked artifact cache entry without reading its target', async () => {
  const { stageRoot, options } = fixture();
  try {
    const cacheRoot = mkdtempSync(join(stageRoot, 'cache-'));
    const outside = join(stageRoot, 'outside');
    writeFileSync(outside, artifactBytes, { mode: 0o600 });
    symlinkSync(outside, join(cacheRoot, artifactIdentity));
    expect(
      await rejectionKind(retrieveReviewJournal({ ...options, artifactCacheRoot: cacheRoot })),
    ).toBe('inaccessible');
    expect(readdirSync(stageRoot).sort()).toEqual(
      ['cache-' + cacheRoot.split('cache-')[1], 'outside'].sort(),
    );
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses cache entries with multiple links or a non-file inode', async () => {
  const { stageRoot, options } = fixture();
  try {
    const cacheRoot = mkdtempSync(join(stageRoot, 'cache-'));
    const cached = join(cacheRoot, artifactIdentity);
    writeFileSync(cached, artifactBytes, { mode: 0o600 });
    const linked = join(cacheRoot, 'linked');
    linkSync(cached, linked);
    expect(
      await rejectionKind(retrieveReviewJournal({ ...options, artifactCacheRoot: cacheRoot })),
    ).toBe('invalid-response');
    rmSync(linked);
    const originalStat = filesystem.fstatSync;
    let statCalls = 0;
    const stat = spyOn(filesystem, 'fstatSync').mockImplementation(((descriptor: number) => {
      const entry = originalStat(descriptor);
      statCalls += 1;
      if (statCalls === 2) return Object.assign(entry, { isFile: () => false });
      return entry;
    }) as typeof filesystem.fstatSync);
    try {
      expect(
        await rejectionKind(retrieveReviewJournal({ ...options, artifactCacheRoot: cacheRoot })),
      ).toBe('invalid-response');
    } finally {
      stat.mockRestore();
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval opens a FIFO cache entry nonblocking and refuses the non-file inode', async () => {
  const { stageRoot, options } = fixture();
  try {
    const cacheRoot = mkdtempSync(join(stageRoot, 'cache-'));
    const cached = join(cacheRoot, artifactIdentity);
    const created = Bun.spawnSync(['mkfifo', cached]);
    expect(created.exitCode).toBe(0);
    const originalOpen = filesystem.openSync;
    let cacheFlags: number | undefined;
    const open = spyOn(filesystem, 'openSync').mockImplementation(((
      path: string,
      flags: number,
    ) => {
      if (path === cached) {
        cacheFlags = flags;
        if ((flags & constants.O_NONBLOCK) === 0) throw new Error('blocking FIFO open');
      }
      return originalOpen(path, flags);
    }) as typeof filesystem.openSync);
    try {
      expect(
        await rejectionKind(retrieveReviewJournal({ ...options, artifactCacheRoot: cacheRoot })),
      ).toBe('invalid-response');
      expect(cacheFlags).toBeDefined();
      expect((cacheFlags ?? 0) & constants.O_NONBLOCK).toBe(constants.O_NONBLOCK);
    } finally {
      open.mockRestore();
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses foreign-owner staging and cache inodes', async () => {
  const { stageRoot, options, calls } = fixture();
  try {
    const originalLstat = filesystem.lstatSync;
    const lstat = spyOn(filesystem, 'lstatSync').mockImplementation(((path: string) => {
      const entry = originalLstat(path);
      if (path === stageRoot) return Object.assign(entry, { uid: entry.uid + 1 });
      return entry;
    }) as typeof filesystem.lstatSync);
    try {
      expect(await rejectionKind(retrieveReviewJournal(options))).toBe('invalid-response');
      expect(calls).toHaveLength(0);
    } finally {
      lstat.mockRestore();
    }
    const cacheRoot = mkdtempSync(join(stageRoot, 'cache-'));
    writeFileSync(join(cacheRoot, artifactIdentity), artifactBytes, { mode: 0o600 });
    const originalStat = filesystem.fstatSync;
    let statCalls = 0;
    const stat = spyOn(filesystem, 'fstatSync').mockImplementation(((descriptor: number) => {
      const entry = originalStat(descriptor);
      statCalls += 1;
      if (statCalls === 2) return Object.assign(entry, { uid: entry.uid + 1 });
      return entry;
    }) as typeof filesystem.fstatSync);
    try {
      expect(
        await rejectionKind(retrieveReviewJournal({ ...options, artifactCacheRoot: cacheRoot })),
      ).toBe('invalid-response');
    } finally {
      stat.mockRestore();
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses a declared oversized cache inode before reading its bytes', async () => {
  const { stageRoot, options } = fixture();
  try {
    const cacheRoot = mkdtempSync(join(stageRoot, 'cache-'));
    writeFileSync(join(cacheRoot, artifactIdentity), artifactBytes, { mode: 0o600 });
    const originalStat = filesystem.fstatSync;
    let statCalls = 0;
    const stat = spyOn(filesystem, 'fstatSync').mockImplementation(((descriptor: number) => {
      const entry = originalStat(descriptor);
      statCalls += 1;
      if (statCalls === 2) return Object.assign(entry, { size: 4_194_305 });
      return entry;
    }) as typeof filesystem.fstatSync);
    try {
      expect(
        await rejectionKind(retrieveReviewJournal({ ...options, artifactCacheRoot: cacheRoot })),
      ).toBe('limit-exceeded');
    } finally {
      stat.mockRestore();
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses an oversized cache read after a small inode stat', async () => {
  const oversized = Buffer.alloc(4_194_305, 7);
  const identity = hashBytes(oversized);
  const { stageRoot, options } = fixture([{ kind: 'cold-output', identity }]);
  try {
    const cacheRoot = mkdtempSync(join(stageRoot, 'cache-'));
    writeFileSync(join(cacheRoot, identity), 'short', { mode: 0o600 });
    const originalRead = filesystem.readFileSync;
    let reads = 0;
    const read = spyOn(filesystem, 'readFileSync').mockImplementation(((descriptor: number) => {
      reads += 1;
      return reads === 2 ? oversized : originalRead(descriptor);
    }) as typeof filesystem.readFileSync);
    try {
      expect(
        await rejectionKind(retrieveReviewJournal({ ...options, artifactCacheRoot: cacheRoot })),
      ).toBe('limit-exceeded');
      expect(reads).toBe(2);
    } finally {
      read.mockRestore();
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval scans a validated next cursor and retains every matching candidate', async () => {
  const { stageRoot, options, calls } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) => {
      if (url.startsWith('https://api.github.com/')) {
        const first = !url.includes('&after=');
        return Response.json(
          {
            attestations: [
              { repository_id: 13, bundle_url: 'https://bundles.example/one' },
              {
                repository_id: 42,
                bundle_url: first ? 'https://bundles.example/one' : 'https://bundles.example/two',
              },
            ],
          },
          first
            ? {
                headers: {
                  link: `<https://api.github.com/orgs/trusted-org/attestations/sha256%3A${options.registration.manifestIdentity}?per_page=20&predicate_type=https%3A%2F%2Fexample.test%2Freview%2Fv1&after=cursor-a>; rel="next"`,
                },
              }
            : undefined,
        );
      }
      if (url === 'https://bundles.example/two')
        return new Response('second bundle', { headers: { 'content-type': 'application/json' } });
      return undefined;
    });
    const journal = await retrieveReviewJournal({ ...options, fetcher });
    expect(journal.bundleCandidates).toHaveLength(2);
    expect(
      journal.bundleCandidates.map((candidate) => readFileSync(candidate.path).toString()),
    ).toEqual([bundleBytes.toString(), 'second bundle']);
    expect(calls.some((call) => call.url.includes('&after=cursor-a'))).toBe(false);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses a future last page with no next cursor', async () => {
  const { stageRoot, options } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.startsWith('https://api.github.com/')
        ? Response.json(
            { attestations: [{ repository_id: 42, bundle_url: 'https://bundles.example/one' }] },
            {
              headers: {
                link: `<https://api.github.com/orgs/trusted-org/attestations/sha256%3A${options.registration.manifestIdentity}?per_page=20&predicate_type=https%3A%2F%2Fexample.test%2Freview%2Fv1&after=cursor-z>; rel="last"`,
              },
            },
          )
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'invalid-response',
    );
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses duplicate manifest artifact pairs before artifact GET', async () => {
  const { stageRoot, options, calls } = fixture([
    { kind: 'cold-output', identity: artifactIdentity },
    { kind: 'cold-output', identity: artifactIdentity },
  ]);
  try {
    expect(await rejectionKind(retrieveReviewJournal(options))).toBe('invalid-response');
    expect(calls.some((call) => call.url.includes('/v1/artifacts/'))).toBe(false);
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval retains two artifact kinds sharing one digest with one staged file', async () => {
  const { stageRoot, options, calls } = fixture([
    { kind: 'cold-output', identity: artifactIdentity },
    { kind: 'raw-response', identity: artifactIdentity },
  ]);
  try {
    const journal = await retrieveReviewJournal(options);
    expect(journal.artifacts).toHaveLength(2);
    expect(journal.artifacts[0].path).toBe(journal.artifacts[1].path);
    expect(calls.filter((call) => call.url.includes('/v1/artifacts/'))).toHaveLength(1);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses artifact count 65 before fetching any artifact', async () => {
  const entries = Array.from({ length: 65 }, (_, index) => ({
    kind: 'cold-output' as const,
    identity: index.toString(16).padStart(64, '0'),
  }));
  const { stageRoot, options, calls } = fixture(entries);
  try {
    expect(await rejectionKind(retrieveReviewJournal(options))).toBe('limit-exceeded');
    expect(calls.some((call) => call.url.includes('/v1/artifacts/'))).toBe(false);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses candidate 17 without downloading any bundle', async () => {
  const { stageRoot, options, calls } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.startsWith('https://api.github.com/')
        ? Response.json({
            attestations: Array.from({ length: 17 }, (_, index) => ({
              repository_id: 42,
              bundle_url: `https://bundles.example/${String(index)}`,
            })),
          })
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'limit-exceeded',
    );
    expect(calls.some((call) => call.url.startsWith('https://bundles.example/'))).toBe(false);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses declared and streamed bundle oversize before returning a journal', async () => {
  const { stageRoot, options } = fixture();
  try {
    for (const oversized of [
      new Response('small', { headers: { 'content-length': '1048577' } }),
      new Response(new Uint8Array(1_048_577)),
    ]) {
      const fetcher = replaceResponse(options, (url) =>
        url === 'https://bundles.example/one' ? oversized.clone() : undefined,
      );
      expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
        'limit-exceeded',
      );
      expect(readdirSync(stageRoot)).toHaveLength(0);
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval distinguishes missing, inaccessible, rate-limited and unavailable resource responses', async () => {
  const { stageRoot, options } = fixture();
  try {
    const cases = [
      { status: 404, kind: 'absent' },
      { status: 403, kind: 'inaccessible' },
      { status: 429, kind: 'rate-limited' },
      { status: 503, kind: 'unavailable' },
    ] as const;
    for (const expectedFailure of cases) {
      const fetcher = replaceResponse(options, (url) =>
        url.includes('/v1/artifacts/')
          ? new Response(null, { status: expectedFailure.status })
          : undefined,
      );
      expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
        expectedFailure.kind,
      );
      expect(readdirSync(stageRoot)).toHaveLength(0);
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses a sixth attestation page without returning a partial candidate scan', async () => {
  const { stageRoot, options } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) => {
      if (!url.startsWith('https://api.github.com/')) return undefined;
      const current = new URL(url).searchParams.get('after');
      const next = current === null ? 1 : Number(current) + 1;
      return Response.json(
        { attestations: [] },
        {
          headers: {
            link: `<https://api.github.com/orgs/trusted-org/attestations/sha256%3A${options.registration.manifestIdentity}?per_page=20&predicate_type=https%3A%2F%2Fexample.test%2Freview%2Fv1&after=${String(next)}>; rel="next"`,
          },
        },
      );
    });
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'limit-exceeded',
    );
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses a repeated prior attestation cursor', async () => {
  const { stageRoot, options } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) => {
      if (!url.startsWith('https://api.github.com/')) return undefined;
      const current = new URL(url).searchParams.get('after');
      const next = current === null ? 'a' : current === 'a' ? 'b' : 'a';
      return Response.json(
        { attestations: [] },
        {
          headers: {
            link: `<https://api.github.com/orgs/trusted-org/attestations/sha256%3A${options.registration.manifestIdentity}?per_page=20&predicate_type=https%3A%2F%2Fexample.test%2Freview%2Fv1&after=${next}>; rel="next"`,
          },
        },
      );
    });
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'invalid-response',
    );
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses aggregate body bytes beyond 32 MiB', async () => {
  const resources = Array.from({ length: 8 }, (_, index) => Buffer.alloc(4_194_304, index + 1));
  const byIdentity = new Map(resources.map((bytes) => [hashBytes(bytes), bytes]));
  const { stageRoot, options } = fixture(
    resources.map((bytes) => ({ kind: 'cold-output', identity: hashBytes(bytes) })),
  );
  try {
    const fetcher = replaceResponse(options, (url) => {
      if (!url.includes('/v1/artifacts/')) return undefined;
      const identity = url.slice(url.lastIndexOf('/') + 1);
      const bytes = byIdentity.get(identity);
      if (bytes === undefined) throw new Error('fixture digest absent');
      return new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } });
    });
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'limit-exceeded',
    );
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval counts verified cache bytes against the whole 32 MiB resource limit', async () => {
  const resources = Array.from({ length: 8 }, (_, index) => Buffer.alloc(4_194_304, index + 1));
  const { stageRoot, options, calls } = fixture(
    resources.map((bytes) => ({ kind: 'cold-output', identity: hashBytes(bytes) })),
  );
  try {
    const cacheRoot = mkdtempSync(join(stageRoot, 'cache-'));
    for (const bytes of resources)
      writeFileSync(join(cacheRoot, hashBytes(bytes)), bytes, { mode: 0o600 });
    expect(
      await rejectionKind(retrieveReviewJournal({ ...options, artifactCacheRoot: cacheRoot })),
    ).toBe('limit-exceeded');
    expect(calls.some((call) => call.url.startsWith('https://api.github.com/'))).toBe(false);
    expect(readdirSync(stageRoot)).toHaveLength(1);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses a pre-aborted request before staging or issuing a GET', async () => {
  const { stageRoot, options, calls } = fixture();
  const controller = new AbortController();
  controller.abort();
  const makeDirectory = spyOn(filesystem, 'mkdtempSync');
  try {
    expect(
      await rejectionKind(retrieveReviewJournal({ ...options, signal: controller.signal })),
    ).toBe('cancelled');
    expect(calls).toHaveLength(0);
    expect(makeDirectory).not.toHaveBeenCalled();
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    makeDirectory.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses a symlinked stage root before making a GET', async () => {
  const { stageRoot, options, calls } = fixture();
  try {
    const link = join(stageRoot, 'stage-link');
    symlinkSync(stageRoot, link);
    expect(await rejectionKind(retrieveReviewJournal({ ...options, stageRoot: link }))).toBe(
      'invalid-response',
    );
    expect(calls).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses a symlinked cache root before making a GET', async () => {
  const { stageRoot, options, calls } = fixture();
  try {
    const cacheRoot = mkdtempSync(join(stageRoot, 'real-cache-'));
    const link = join(stageRoot, 'cache-link');
    symlinkSync(cacheRoot, link);
    expect(
      await rejectionKind(retrieveReviewJournal({ ...options, artifactCacheRoot: link })),
    ).toBe('invalid-response');
    expect(calls).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses a nonprivate staging root before making a GET', async () => {
  const { stageRoot, options, calls } = fixture();
  try {
    chmodSync(stageRoot, 0o755);
    expect(await rejectionKind(retrieveReviewJournal(options))).toBe('invalid-response');
    expect(calls).toHaveLength(0);
  } finally {
    chmodSync(stageRoot, 0o700);
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval classifies an unwritable stage directory and exposes no success', async () => {
  const { stageRoot, options } = fixture();
  try {
    chmodSync(stageRoot, 0o500);
    expect(await rejectionKind(retrieveReviewJournal(options))).toBe('inaccessible');
  } finally {
    chmodSync(stageRoot, 0o700);
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval classifies malformed manifest bytes without exposing a partial journal', async () => {
  const { stageRoot, options } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/manifests/')
        ? new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } })
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'integrity-mismatch',
    );
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval rejects invalid UTF-8 before invoking the manifest decoder', async () => {
  const { stageRoot, options, manifestBytes } = fixture();
  const invalid = Buffer.from(manifestBytes);
  const offset = invalid.indexOf('journal.primary');
  if (offset < 0) throw new Error('fixture journal ID absent');
  invalid[offset + 'journal.'.length] = 0xff;
  const registration = { ...options.registration, manifestIdentity: hashBytes(invalid) };
  const decode = spyOn(reviewJournal, 'decodeReviewJournalManifest');
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/manifests/')
        ? new Response(invalid, { headers: { 'content-type': 'application/json' } })
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, registration, fetcher }))).toBe(
      'invalid-response',
    );
    expect(decode).not.toHaveBeenCalled();
  } finally {
    decode.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval cancels a stalled body and removes incomplete staging', async () => {
  const { stageRoot, options } = fixture();
  const controller = new AbortController();
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/artifacts/')
        ? new Response(
            new ReadableStream<Uint8Array>({
              pull: () =>
                new Promise<void>(() => {
                  return;
                }),
            }),
            { headers: { 'content-type': 'application/octet-stream' } },
          )
        : undefined,
    );
    setTimeout(() => {
      controller.abort();
    }, 20);
    const failure = await Promise.race([
      rejectionKind(retrieveReviewJournal({ ...options, fetcher, signal: controller.signal })),
      Bun.sleep(1_000).then(() => 'test-timeout'),
    ]);
    expect(failure).toBe('cancelled');
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval cancels a late fetch response after the request was abandoned', async () => {
  const { stageRoot, options } = fixture();
  const controller = new AbortController();
  let resolveFetch: ((response: Response) => void) | undefined;
  let cancellations = 0;
  const fetcher: ReviewResourceFetch = () =>
    new Promise((resolve) => {
      resolveFetch = resolve;
    });
  try {
    const pending = retrieveReviewJournal({ ...options, fetcher, signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    expect(await rejectionKind(pending)).toBe('cancelled');
    if (resolveFetch === undefined) throw new Error('fetch was not called');
    resolveFetch(
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancellations += 1;
          },
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancellations).toBe(1);
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval reports a redacted late-response cancellation rejection', async () => {
  const { stageRoot, options, lateFailures } = fixture();
  const controller = new AbortController();
  let resolveFetch: ((response: Response) => void) | undefined;
  const fetcher: ReviewResourceFetch = () =>
    new Promise((resolve) => {
      resolveFetch = resolve;
    });
  try {
    const pending = retrieveReviewJournal({ ...options, fetcher, signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    expect(await rejectionKind(pending)).toBe('cancelled');
    if (resolveFetch === undefined) throw new Error('fetch was not called');
    resolveFetch(
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            throw new Error('https://bundles.example/signed?secret=late-sentinel');
          },
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lateFailures).toHaveLength(1);
    expect(lateFailures[0].kind).toBe('unavailable');
    expect(String(lateFailures[0])).not.toContain('late-sentinel');
    expect(String(lateFailures[0].cause)).not.toContain('late-sentinel');
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval reports a stalled late-response cancellation at its request deadline', async () => {
  const { stageRoot, options, lateFailures } = fixture();
  const controller = new AbortController();
  const startedAt = performance.now();
  let observedNow = startedAt;
  const clock = spyOn(performance, 'now').mockImplementation(() => observedNow);
  let resolveFetch: ((response: Response) => void) | undefined;
  const fetcher: ReviewResourceFetch = () =>
    new Promise((resolve) => {
      resolveFetch = resolve;
    });
  try {
    const pending = retrieveReviewJournal({ ...options, fetcher, signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    expect(await rejectionKind(pending)).toBe('cancelled');
    if (resolveFetch === undefined) throw new Error('fetch was not called');
    observedNow = startedAt + 10_001;
    resolveFetch(
      new Response(
        new ReadableStream<Uint8Array>({
          cancel: () =>
            new Promise<void>(() => {
              return;
            }),
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lateFailures).toHaveLength(1);
    expect(lateFailures[0].kind).toBe('limit-exceeded');
  } finally {
    clock.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval reports a finite late-response cancellation that crosses its monotonic deadline', async () => {
  const { stageRoot, options, lateFailures } = fixture();
  const controller = new AbortController();
  const startedAt = performance.now();
  let observedNow = startedAt;
  const clock = spyOn(performance, 'now').mockImplementation(() => observedNow);
  let resolveFetch: ((response: Response) => void) | undefined;
  const fetcher: ReviewResourceFetch = () =>
    new Promise((resolve) => {
      resolveFetch = resolve;
    });
  try {
    const pending = retrieveReviewJournal({ ...options, fetcher, signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    expect(await rejectionKind(pending)).toBe('cancelled');
    if (resolveFetch === undefined) throw new Error('fetch was not called');
    resolveFetch(
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            observedNow = startedAt + 10_001;
          },
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lateFailures).toHaveLength(1);
    expect(lateFailures[0].kind).toBe('limit-exceeded');
  } finally {
    clock.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval bounds redirected response cancellation that never settles', async () => {
  const { stageRoot, options } = fixture();
  const controller = new AbortController();
  let cancellations = 0;
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/manifests/')
        ? new Response(
            new ReadableStream<Uint8Array>({
              cancel() {
                cancellations += 1;
                return new Promise<void>(() => {
                  return;
                });
              },
            }),
            { status: 302 },
          )
        : undefined,
    );
    const pending = retrieveReviewJournal({ ...options, fetcher, signal: controller.signal });
    setTimeout(() => {
      controller.abort();
    }, 10);
    const observed = await Promise.race([
      rejectionKind(pending),
      new Promise<string>((resolve) =>
        setTimeout(() => {
          resolve('hung');
        }, 250),
      ),
    ]);
    expect(observed).toBe('cancelled');
    expect(cancellations).toBe(1);
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval retains redirect refusal and redacts a response cleanup error', async () => {
  const { stageRoot, options } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/manifests/')
        ? new Response(
            new ReadableStream<Uint8Array>({
              cancel() {
                throw new Error('https://bundles.example/signed?secret=cleanup-sentinel');
              },
            }),
            { status: 302 },
          )
        : undefined,
    );
    let failure: unknown;
    try {
      await retrieveReviewJournal({ ...options, fetcher });
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(ReviewRetrievalFailure);
    if (!(failure instanceof ReviewRetrievalFailure)) throw new Error('typed failure absent');
    expect(failure.kind).toBe('invalid-response');
    expect(failure.cause).toBeInstanceOf(AggregateError);
    if (!(failure.cause instanceof AggregateError)) throw new Error('aggregate absent');
    expect(failure.cause.errors[0]).toBeInstanceOf(ReviewRetrievalFailure);
    expect(String(failure.cause.errors[1])).toBe('Error: review response cleanup failed');
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval applies the request deadline after response cleanup', async () => {
  const { stageRoot, options } = fixture();
  const startedAt = performance.now();
  let observedNow = startedAt;
  const clock = spyOn(performance, 'now').mockImplementation(() => observedNow);
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/manifests/')
        ? new Response(
            new ReadableStream<Uint8Array>({
              cancel() {
                observedNow = startedAt + 10_001;
              },
            }),
            { status: 302 },
          )
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'limit-exceeded',
    );
  } finally {
    clock.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval bounds stalled reader cancellation after caller abort', async () => {
  const { stageRoot, options } = fixture();
  const controller = new AbortController();
  let cancellations = 0;
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/artifacts/')
        ? new Response(
            new ReadableStream<Uint8Array>({
              pull: () =>
                new Promise<void>(() => {
                  return;
                }),
              cancel() {
                cancellations += 1;
                return new Promise<void>(() => {
                  return;
                });
              },
            }),
            { headers: { 'content-type': 'application/octet-stream' } },
          )
        : undefined,
    );
    const pending = retrieveReviewJournal({ ...options, fetcher, signal: controller.signal });
    setTimeout(() => {
      controller.abort();
    }, 10);
    const observed = await Promise.race([
      rejectionKind(pending),
      new Promise<string>((resolve) =>
        setTimeout(() => {
          resolve('hung');
        }, 250),
      ),
    ]);
    expect(observed).toBe('cancelled');
    expect(cancellations).toBe(1);
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses a request whose fetch settles after its monotonic ten-second ceiling', async () => {
  const { stageRoot, options } = fixture();
  const startedAt = performance.now();
  let observedNow = startedAt;
  const clock = spyOn(performance, 'now').mockImplementation(() => observedNow);
  try {
    const original = options.fetcher;
    if (original === undefined) throw new Error('fixture fetcher absent');
    const fetcher: ReviewResourceFetch = async (url, init) => {
      const response = await original(url, init);
      if (url.includes('/v1/manifests/')) observedNow = startedAt + 10_001;
      return response;
    };
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'limit-exceeded',
    );
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    clock.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses after the first body read crosses the request deadline', async () => {
  const { stageRoot, options } = fixture();
  const startedAt = performance.now();
  let observedNow = startedAt;
  const clock = spyOn(performance, 'now').mockImplementation(() => observedNow);
  // The mounted reader wrapper calls the saved method with its original receiver.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalRead = ReadableStreamDefaultReader.prototype.read;
  let reads = 0;
  const read = spyOn(ReadableStreamDefaultReader.prototype, 'read').mockImplementation(function (
    this: ReadableStreamDefaultReader<Uint8Array>,
  ) {
    reads += 1;
    return originalRead.call(this).then((part) => {
      if (reads === 1) observedNow = startedAt + 10_001;
      return part;
    });
  } as typeof originalRead);
  try {
    expect(await rejectionKind(retrieveReviewJournal(options))).toBe('limit-exceeded');
    expect(reads).toBe(1);
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    read.mockRestore();
    clock.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval retains typed absent refusal when pending-directory cleanup fails', async () => {
  const { stageRoot, options } = fixture();
  const originalRemove = filesystem.rmSync;
  const remove = spyOn(filesystem, 'rmSync').mockImplementation((path, settings) => {
    if (String(path).includes('/pending-')) throw new Error('cleanup-sentinel');
    originalRemove(path, settings);
  });
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/artifacts/') ? new Response(null, { status: 404 }) : undefined,
    );
    let failure: unknown;
    try {
      await retrieveReviewJournal({ ...options, fetcher });
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(ReviewRetrievalFailure);
    if (!(failure instanceof ReviewRetrievalFailure)) throw new Error('typed failure absent');
    expect(failure.kind).toBe('absent');
    expect(failure.cause).toBeInstanceOf(AggregateError);
    if (!(failure.cause instanceof AggregateError)) throw new Error('aggregate absent');
    expect(failure.cause.errors[0]).toBeInstanceOf(ReviewRetrievalFailure);
    expect(String(failure.cause.errors[1])).toContain('cleanup-sentinel');
  } finally {
    remove.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval rechecks the whole deadline after pending-directory cleanup', async () => {
  const { stageRoot, options } = fixture();
  const startedAt = performance.now();
  let observedNow = startedAt;
  const clock = spyOn(performance, 'now').mockImplementation(() => observedNow);
  const originalRemove = filesystem.rmSync;
  const remove = spyOn(filesystem, 'rmSync').mockImplementation((path, settings) => {
    originalRemove(path, settings);
    if (String(path).includes('/pending-')) observedNow = startedAt + 30_001;
  });
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/artifacts/') ? new Response(null, { status: 404 }) : undefined,
    );
    let failure: unknown;
    try {
      await retrieveReviewJournal({ ...options, fetcher });
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(ReviewRetrievalFailure);
    if (!(failure instanceof ReviewRetrievalFailure)) throw new Error('typed failure absent');
    expect(failure.kind).toBe('limit-exceeded');
    expect(failure.cause).toBeInstanceOf(AggregateError);
    if (!(failure.cause instanceof AggregateError)) throw new Error('aggregate absent');
    const primary: unknown = failure.cause.errors[0];
    expect(primary).toBeInstanceOf(ReviewRetrievalFailure);
    if (!(primary instanceof ReviewRetrievalFailure)) throw new Error('primary absent');
    expect(primary.kind).toBe('absent');
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    remove.mockRestore();
    clock.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval rechecks caller cancellation after pending-directory cleanup', async () => {
  const { stageRoot, options } = fixture();
  const controller = new AbortController();
  const originalRemove = filesystem.rmSync;
  const remove = spyOn(filesystem, 'rmSync').mockImplementation((path, settings) => {
    originalRemove(path, settings);
    if (String(path).includes('/pending-')) controller.abort();
  });
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/artifacts/') ? new Response(null, { status: 404 }) : undefined,
    );
    let failure: unknown;
    try {
      await retrieveReviewJournal({ ...options, fetcher, signal: controller.signal });
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(ReviewRetrievalFailure);
    if (!(failure instanceof ReviewRetrievalFailure)) throw new Error('typed failure absent');
    expect(failure.kind).toBe('cancelled');
    expect(failure.cause).toBeInstanceOf(AggregateError);
    if (!(failure.cause instanceof AggregateError)) throw new Error('aggregate absent');
    const primary: unknown = failure.cause.errors[0];
    expect(primary).toBeInstanceOf(ReviewRetrievalFailure);
    if (!(primary instanceof ReviewRetrievalFailure)) throw new Error('primary absent');
    expect(primary.kind).toBe('absent');
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    remove.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval redacts a signed bundle query even when the transport throws it', async () => {
  const { stageRoot, options } = fixture();
  try {
    const original = options.fetcher;
    if (original === undefined) throw new Error('fixture fetcher absent');
    const fetcher: ReviewResourceFetch = async (url, init) => {
      if (url.startsWith('https://bundles.example/'))
        throw new Error('transport failed at https://bundles.example/one?sig=secret-sentinel');
      return original(url, init);
    };
    let failure: unknown;
    try {
      await retrieveReviewJournal({ ...options, fetcher });
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toHaveProperty('kind', 'unavailable');
    expect(String(failure)).not.toContain('secret-sentinel');
    expect(String(failure instanceof Error ? failure.cause : '')).not.toContain('secret-sentinel');
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval retains duplicate candidate records while staging shared bundle bytes once', async () => {
  const { stageRoot, options } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.startsWith('https://api.github.com/')
        ? Response.json({
            attestations: [
              { repository_id: 42, bundle_url: 'https://bundles.example/one' },
              { repository_id: 42, bundle_url: 'https://bundles.example/one' },
            ],
          })
        : undefined,
    );
    const journal = await retrieveReviewJournal({ ...options, fetcher });
    expect(journal.bundleCandidates).toHaveLength(2);
    expect(journal.bundleCandidates[0].path).toBe(journal.bundleCandidates[1].path);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval classifies canonical manifest refusal as invalid response', async () => {
  const { stageRoot, options, manifestBytes } = fixture();
  try {
    const noncanonical = JSON.stringify(JSON.parse(manifestBytes), null, 2);
    const registration = { ...options.registration, manifestIdentity: hashBytes(noncanonical) };
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/manifests/')
        ? new Response(noncanonical, { headers: { 'content-type': 'application/json' } })
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, registration, fetcher }))).toBe(
      'invalid-response',
    );
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval classifies malformed GitHub JSON as invalid response', async () => {
  const { stageRoot, options } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.startsWith('https://api.github.com/')
        ? new Response('{', { headers: { 'content-type': 'application/json' } })
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'invalid-response',
    );
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses invalid UTF-8 in an otherwise valid GitHub candidate listing', async () => {
  const { stageRoot, options, calls } = fixture();
  const listing = Buffer.from(
    JSON.stringify({
      attestations: [
        { repository_id: 42, bundle_url: 'https://bundles.example/one', initiator: 'x' },
      ],
    }),
  );
  const marker = listing.indexOf('"initiator":"x"');
  if (marker < 0) throw new Error('fixture initiator absent');
  listing[marker + '"initiator":"'.length] = 0xff;
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.startsWith('https://api.github.com/')
        ? new Response(listing, { headers: { 'content-type': 'application/json' } })
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'invalid-response',
    );
    expect(calls.some((call) => call.url.startsWith('https://bundles.example/'))).toBe(false);
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval consumes an exact cached artifact after rehash without fetching its route', async () => {
  const { stageRoot, options, calls } = fixture();
  try {
    const cacheRoot = mkdtempSync(join(stageRoot, 'cache-'));
    writeFileSync(join(cacheRoot, artifactIdentity), artifactBytes, { mode: 0o600 });
    const journal = await retrieveReviewJournal({ ...options, artifactCacheRoot: cacheRoot });
    expect(readFileSync(journal.artifacts[0].path)).toEqual(artifactBytes);
    expect(calls.some((call) => call.url.includes('/v1/artifacts/'))).toBe(false);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval cancels a redirected response body before cleaning its pending stage', async () => {
  const { stageRoot, options } = fixture();
  let cancelled = 0;
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.includes('/v1/artifacts/')
        ? new Response(
            new ReadableStream<Uint8Array>({
              cancel() {
                cancelled += 1;
              },
            }),
            { status: 302, headers: { location: 'https://journal.example/elsewhere' } },
          )
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'invalid-response',
    );
    expect(cancelled).toBe(1);
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval rejects declared lengths that disagree with streamed bytes', async () => {
  const { stageRoot, options } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) =>
      url === 'https://bundles.example/one'
        ? new Response('short', { headers: { 'content-length': '99' } })
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'invalid-response',
    );
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval classifies GitHub exhausted quota as rate limited', async () => {
  const { stageRoot, options } = fixture();
  try {
    const fetcher = replaceResponse(options, (url) =>
      url.startsWith('https://api.github.com/')
        ? new Response(null, { status: 403, headers: { 'x-ratelimit-remaining': '0' } })
        : undefined,
    );
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'rate-limited',
    );
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses partial, cached, encoded, wrong-type and bodyless successful responses', async () => {
  const { stageRoot, options } = fixture();
  try {
    const responses = [
      new Response('partial', { status: 206 }),
      new Response(null, { status: 304 }),
      new Response('encoded', {
        headers: { 'content-type': 'application/octet-stream', 'content-encoding': 'gzip' },
      }),
      new Response('wrong type', { headers: { 'content-type': 'text/plain' } }),
      new Response(null, { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
    ];
    for (const response of responses) {
      const fetcher = replaceResponse(options, (url) =>
        url.includes('/v1/artifacts/') ? response.clone() : undefined,
      );
      expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
        'invalid-response',
      );
      expect(readdirSync(stageRoot)).toHaveLength(0);
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses a public artifact cache file before staging its bytes', async () => {
  const { stageRoot, options } = fixture();
  try {
    const cacheRoot = mkdtempSync(join(stageRoot, 'cache-'));
    const cached = join(cacheRoot, artifactIdentity);
    writeFileSync(cached, artifactBytes, { mode: 0o644 });
    expect(
      await rejectionKind(retrieveReviewJournal({ ...options, artifactCacheRoot: cacheRoot })),
    ).toBe('invalid-response');
    expect(readdirSync(stageRoot)).toHaveLength(1);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses unsafe repository ID and page larger than the requested 20', async () => {
  const { stageRoot, options } = fixture();
  try {
    for (const attestations of [
      [{ repository_id: 9_007_199_254_740_992, bundle_url: 'https://bundles.example/one' }],
      Array.from({ length: 21 }, () => ({
        repository_id: 13,
        bundle_url: 'https://bundles.example/one',
      })),
    ]) {
      const fetcher = replaceResponse(options, (url) =>
        url.startsWith('https://api.github.com/') ? Response.json({ attestations }) : undefined,
      );
      expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
        'invalid-response',
      );
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses declared manifest and artifact ceilings before body consumption', async () => {
  const { stageRoot, options } = fixture();
  try {
    for (const boundary of [
      { path: '/v1/manifests/', length: '65537', contentType: 'application/json' },
      { path: '/v1/artifacts/', length: '4194305', contentType: 'application/octet-stream' },
    ]) {
      const fetcher = replaceResponse(options, (url) =>
        url.includes(boundary.path)
          ? new Response('small', {
              headers: { 'content-type': boundary.contentType, 'content-length': boundary.length },
            })
          : undefined,
      );
      expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
        'limit-exceeded',
      );
      expect(readdirSync(stageRoot)).toHaveLength(0);
    }
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses a request whose fetch never settles after the ten-second ceiling', async () => {
  const { stageRoot, options } = fixture();
  try {
    const fetcher: ReviewResourceFetch = () =>
      new Promise<Response>(() => {
        return;
      });
    const startedAt = performance.now();
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'limit-exceeded',
    );
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(9_000);
    expect(performance.now() - startedAt).toBeLessThan(11_000);
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
}, 12_000);

test('retrieval refuses when the whole monotonic deadline elapses between requests', async () => {
  const { stageRoot, options } = fixture();
  const originalNow = performance.now();
  let observedNow = originalNow;
  const clock = spyOn(performance, 'now').mockImplementation(() => observedNow);
  try {
    const original = options.fetcher;
    if (original === undefined) throw new Error('fixture fetcher absent');
    const fetcher: ReviewResourceFetch = async (url, init) => {
      const response = await original(url, init);
      if (url.startsWith('https://api.github.com/')) observedNow = originalNow + 30_001;
      return response;
    };
    expect(await rejectionKind(retrieveReviewJournal({ ...options, fetcher }))).toBe(
      'limit-exceeded',
    );
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    clock.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});

test('retrieval refuses when final bundle staging consumes the whole deadline', async () => {
  const { stageRoot, options } = fixture();
  const startedAt = performance.now();
  let observedNow = startedAt;
  const clock = spyOn(performance, 'now').mockImplementation(() => observedNow);
  const originalWrite = filesystem.writeFileSync;
  const write = spyOn(filesystem, 'writeFileSync').mockImplementation(
    (path, contents, settings) => {
      originalWrite(path, contents, settings);
      if (String(path).includes('/bundle-')) observedNow = startedAt + 30_001;
    },
  );
  try {
    expect(await rejectionKind(retrieveReviewJournal(options))).toBe('limit-exceeded');
    expect(readdirSync(stageRoot)).toHaveLength(0);
  } finally {
    write.mockRestore();
    clock.mockRestore();
    rmSync(stageRoot, { recursive: true, force: true });
  }
});
