import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { openActivationController } from './controller';
import { createGitHubRestReader, type GitHubFetch, GitHubReadFailure } from './github-reader';
import { createGitHubPullRequestSource } from './github-source';

const scratch: string[] = [];
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'activation-github-rest-'));
  scratch.push(directory);
  const bootstrapPath = join(directory, 'bootstrap.json');
  const bootstrapBytes = serializeCanonical({
    schemaVersion: 1,
    authorityGeneration: 3,
    reviewer: {
      kind: 'external-audit-provider',
      providerId: 'review.provider',
      executorId: 'review.executor',
      protocolIdentity: 'a'.repeat(64),
      promptIdentity: 'b'.repeat(64),
    },
    journal: {
      kind: 'authenticated-external-journal',
      verifierId: 'journal.verifier',
      issuerId: 'journal.issuer',
      endpoint: 'https://journal.example.invalid/v1',
    },
    publisher: {
      kind: 'immutable-external-store',
      issuerId: 'publisher.issuer',
      endpoint: 'https://store.example.invalid/activations',
    },
    admission: {
      requiredWorkflow: '.github/workflows/trusted-wiki.yml',
      protectedBranch: 'main',
    },
  });
  writeFileSync(bootstrapPath, bootstrapBytes);
  const binding = {
    repositoryId: 8241,
    owner: 'Prosperous-Unification',
    name: 'puni-00',
    targetRef: 'refs/heads/main',
    policyIdentity: '3'.repeat(64),
    mappingIdentity: '4'.repeat(64),
    toolkitIdentity: '5'.repeat(64),
    readDeadlineMs: 1000,
  };
  const pull = {
    number: 282,
    state: 'open',
    draft: false,
    head: { sha: '1'.repeat(40), repo: { id: 8241 } },
    base: { sha: '2'.repeat(40), ref: 'main', repo: { id: 8241 } },
  };
  return {
    binding,
    pull,
    bootstrapPath,
    databasePath: join(directory, 'controller.sqlite'),
    pin: {
      identity: hashBytes(bootstrapBytes),
      journalIssuerId: 'journal.issuer',
      publisherIssuerId: 'publisher.issuer',
    },
  };
}

function mountedReader(source: ReturnType<typeof fixture>, fetcher: GitHubFetch, token?: string) {
  return openActivationController({
    databasePath: source.databasePath,
    bootstrapPath: source.bootstrapPath,
    pin: source.pin,
    clock: () => 1000,
    ...createGitHubPullRequestSource(source.binding, createGitHubRestReader({ fetcher, token })),
    selectObligations: () => {
      throw new Error('no evaluation in reader test');
    },
  });
}

async function expectRefusal(read: () => Promise<unknown>, message: string): Promise<void> {
  let caught: unknown;
  try {
    await read();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(String(caught)).toContain(message);
}

test('anonymous GET reader follows only validated local pages before exact current PR', async () => {
  const source = fixture();
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: GitHubFetch = (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('page=1')) {
      return Promise.resolve(
        new Response(JSON.stringify([source.pull]), {
          status: 200,
          headers: {
            Link: '<https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=2>; rel="next"',
          },
        }),
      );
    }
    if (url.endsWith('page=2')) return Promise.resolve(Response.json([]));
    return Promise.resolve(Response.json(source.pull));
  };
  const controller = mountedReader(source, fetcher);
  try {
    const requests = await controller.reconcileReady();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headSha).toBe(source.pull.head.sha);
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=1',
      'https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=2',
      'https://api.github.com/repos/Prosperous-Unification/puni-00/pulls/282',
    ]);
    expect(calls.every((call) => call.init.method === 'GET')).toBe(true);
    expect(calls.every((call) => call.init.redirect === 'error')).toBe(true);
    expect(calls.every((call) => call.init.cache === 'no-store')).toBe(true);
    expect(calls.every((call) => call.init.credentials === 'omit')).toBe(true);
    expect(calls.every((call) => !new Headers(call.init.headers).has('Authorization'))).toBe(true);
    expect(
      calls.every(
        (call) => new Headers(call.init.headers).get('Accept') === 'application/vnd.github+json',
      ),
    ).toBe(true);
    expect(
      calls.every(
        (call) => new Headers(call.init.headers).get('X-GitHub-Api-Version') === '2026-03-10',
      ),
    ).toBe(true);
  } finally {
    controller.close();
  }
});

test('trusted token reaches only fixed-origin GET requests and cannot follow a foreign Link', async () => {
  const source = fixture();
  const calls: { url: string; authorization: string | null }[] = [];
  const fetcher: GitHubFetch = (url, init) => {
    calls.push({
      url,
      authorization: new Headers(init.headers).get('Authorization'),
    });
    return Promise.resolve(
      new Response(JSON.stringify([source.pull]), {
        status: 200,
        headers: {
          Link: '<https://evil.example.invalid/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=2>; rel="next"',
        },
      }),
    );
  };
  const controller = mountedReader(source, fetcher, 'harmless_test_token');
  try {
    await expectRefusal(() => controller.reconcileReady(), 'pagination link differs');
    expect(calls).toEqual([
      {
        url: 'https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=1',
        authorization: 'Bearer harmless_test_token',
      },
    ]);
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('malformed pagination Link refuses instead of ending a partial inventory', async () => {
  const source = fixture();
  const fetcher: GitHubFetch = () =>
    Promise.resolve(
      new Response(JSON.stringify([source.pull]), {
        status: 200,
        headers: { Link: 'not-a-link' },
      }),
    );
  const controller = mountedReader(source, fetcher);
  try {
    await expectRefusal(() => controller.reconcileReady(), 'pagination link malformed');
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

for (const [name, link, refusal] of [
  [
    'foreign path',
    '<https://api.github.com/repos/another/repo/pulls?state=open&per_page=100&page=2>; rel="next"',
    'link differs',
  ],
  [
    'changed query',
    '<https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=closed&per_page=100&page=2>; rel="next"',
    'link differs',
  ],
  [
    'changed per-page bound',
    '<https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=99&page=2>; rel="next"',
    'link differs',
  ],
  [
    'extra query parameter',
    '<https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=2&extra=1>; rel="next"',
    'link differs',
  ],
  [
    'embedded user',
    '<https://harmless@api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=2>; rel="next"',
    'link differs',
  ],
  [
    'embedded password',
    '<https://:harmless@api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=2>; rel="next"',
    'link differs',
  ],
  [
    'fragment',
    '<https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=2#fragment>; rel="next"',
    'link differs',
  ],
  [
    'skipped page',
    '<https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=3>; rel="next"',
    'next page changed',
  ],
  [
    'duplicate next',
    '<https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=2>; rel="next", <https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=2>; rel="next"',
    'relation repeated',
  ],
  [
    'missing next for future last',
    '<https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=3>; rel="last"',
    'continuation missing',
  ],
  [
    'last page before next',
    '<https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=2>; rel="next", <https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=1>; rel="last"',
    'continuation missing',
  ],
  [
    'malformed page',
    '<https://api.github.com/repos/Prosperous-Unification/puni-00/pulls?state=open&per_page=100&page=bad>; rel="next"',
    'pagination page malformed',
  ],
] as const) {
  test(`pagination refuses ${name} without a second credentialed read`, async () => {
    const source = fixture();
    let calls = 0;
    const fetcher: GitHubFetch = () => {
      calls += 1;
      return Promise.resolve(
        new Response(JSON.stringify([source.pull]), { status: 200, headers: { Link: link } }),
      );
    };
    const controller = mountedReader(source, fetcher, 'harmless_test_token');
    try {
      await expectRefusal(() => controller.reconcileReady(), refusal);
      expect(calls).toBe(1);
      expect(controller.listRequests()).toEqual([]);
    } finally {
      controller.close();
    }
  });
}

test('inaccessible current PR cannot retire an active durable request', async () => {
  const source = fixture();
  let inaccessible = false;
  const fetcher: GitHubFetch = (url) => {
    if (url.endsWith('/282') && inaccessible) {
      return Promise.resolve(new Response('{}', { status: 404 }));
    }
    return Promise.resolve(Response.json(url.endsWith('/282') ? source.pull : [source.pull]));
  };
  const controller = mountedReader(source, fetcher);
  try {
    const first = (await controller.reconcileReady())[0];
    inaccessible = true;
    await expectRefusal(() => controller.reconcileReady(), 'GitHub PR GET refused (404)');
    expect(controller.listRequests()).toHaveLength(1);
    expect(controller.listRequests()[0]?.request.requestIdentity).toBe(first.requestIdentity);
    expect(controller.listRequests()[0]?.current).toBe(true);
  } finally {
    controller.close();
  }
});

test('rate-limit response is explicit retryable refusal rather than empty discovery', async () => {
  const source = fixture();
  const fetcher: GitHubFetch = () =>
    Promise.resolve(new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }));
  const controller = mountedReader(source, fetcher);
  try {
    await expectRefusal(() => controller.reconcileReady(), 'rate limited');
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('HTTP 429 is a retryable rate refusal', async () => {
  const source = fixture();
  const fetcher: GitHubFetch = () => Promise.resolve(new Response('{}', { status: 429 }));
  const controller = mountedReader(source, fetcher);
  try {
    await expectRefusal(() => controller.reconcileReady(), 'rate limited');
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

for (const status of [302, 304, 401, 422, 500]) {
  test(`HTTP ${String(status)} cannot become a successful PR inventory`, async () => {
    const source = fixture();
    const fetcher: GitHubFetch = () => Promise.resolve(new Response('{}', { status }));
    const controller = mountedReader(source, fetcher);
    try {
      await expectRefusal(() => controller.reconcileReady(), `GET refused (${String(status)})`);
      expect(controller.listRequests()).toEqual([]);
    } finally {
      controller.close();
    }
  });
}

test('transport failure diagnostic cannot echo an optional trusted token', async () => {
  const source = fixture();
  const token = 'harmless_test_token';
  const fetcher: GitHubFetch = () => Promise.reject(new Error(`private ${token}`));
  const controller = mountedReader(source, fetcher, token);
  try {
    let caught: unknown;
    try {
      await controller.reconcileReady();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GitHubReadFailure);
    expect(String(caught)).toContain('GitHub PR GET unavailable');
    expect(String(caught)).not.toContain(token);
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('redirect policy prevents a trusted token from reaching a different origin', async () => {
  const source = fixture();
  const forwarded: string[] = [];
  const fetcher: GitHubFetch = (_url, init) => {
    if (init.redirect !== 'error') {
      forwarded.push(new Headers(init.headers).get('Authorization') ?? 'missing');
    }
    return Promise.resolve(
      new Response('{}', {
        status: 302,
        headers: { Location: 'https://evil.example.invalid/steal' },
      }),
    );
  };
  const controller = mountedReader(source, fetcher, 'harmless_test_token');
  try {
    await expectRefusal(() => controller.reconcileReady(), 'GET refused (302)');
    expect(forwarded).toEqual([]);
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('oversized response body refuses before JSON can become discovery', async () => {
  const source = fixture();
  const oversized = `${' '.repeat(8 * 1024 * 1024)}[]`;
  const fetcher: GitHubFetch = () => Promise.resolve(new Response(oversized, { status: 200 }));
  const controller = mountedReader(source, fetcher);
  try {
    await expectRefusal(() => controller.reconcileReady(), 'response byte limit exceeded');
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('declared oversized body refuses before consuming otherwise valid JSON', async () => {
  const source = fixture();
  const fetcher: GitHubFetch = () =>
    Promise.resolve(
      new Response('[]', {
        status: 200,
        headers: { 'content-length': String(8 * 1024 * 1024 + 1) },
      }),
    );
  const controller = mountedReader(source, fetcher);
  try {
    await expectRefusal(() => controller.reconcileReady(), 'response byte limit exceeded');
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('malformed declared body length refuses instead of trusting valid JSON', async () => {
  const source = fixture();
  const fetcher: GitHubFetch = () =>
    Promise.resolve(new Response('[]', { status: 200, headers: { 'content-length': 'unknown' } }));
  const controller = mountedReader(source, fetcher);
  try {
    await expectRefusal(() => controller.reconcileReady(), 'response byte limit exceeded');
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('malformed JSON refuses rather than becoming an empty PR list', async () => {
  const source = fixture();
  const fetcher: GitHubFetch = () => Promise.resolve(new Response('{', { status: 200 }));
  const controller = mountedReader(source, fetcher);
  try {
    await expectRefusal(() => controller.reconcileReady(), 'GitHub PR JSON malformed');
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('missing HTTP body refuses with a named boundary error', async () => {
  const source = fixture();
  const fetcher: GitHubFetch = () => Promise.resolve(new Response(null, { status: 200 }));
  const controller = mountedReader(source, fetcher);
  try {
    await expectRefusal(() => controller.reconcileReady(), 'GitHub PR response body missing');
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('non-array list JSON refuses before source admission', async () => {
  const source = fixture();
  const fetcher: GitHubFetch = () => Promise.resolve(Response.json({ pulls: [] }));
  const controller = mountedReader(source, fetcher);
  try {
    await expectRefusal(() => controller.reconcileReady(), 'GitHub PR list is not an array');
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('reader refuses page beyond bounded scan without a transport call', async () => {
  let calls = 0;
  const reader = createGitHubRestReader({
    fetcher: () => {
      calls += 1;
      return Promise.resolve(Response.json([]));
    },
  });
  await expectRefusal(
    () =>
      reader.listOpenPullRequests(
        'Prosperous-Unification',
        'puni-00',
        101,
        new AbortController().signal,
      ),
    'page is outside bounded scan',
  );
  expect(calls).toBe(0);
});

test('reader refuses malformed current number without a transport call', async () => {
  let calls = 0;
  const reader = createGitHubRestReader({
    fetcher: () => {
      calls += 1;
      return Promise.resolve(Response.json({}));
    },
  });
  await expectRefusal(
    () =>
      reader.getPullRequest('Prosperous-Unification', 'puni-00', 0, new AbortController().signal),
    'GitHub PR number malformed',
  );
  expect(calls).toBe(0);
});

test('current PR response with pagination refuses before it can become authority', async () => {
  const source = fixture();
  const fetcher: GitHubFetch = (url) =>
    Promise.resolve(
      new Response(JSON.stringify(url.endsWith('/282') ? source.pull : [source.pull]), {
        status: 200,
        headers: url.endsWith('/282') ? { Link: '<https://api.github.com/extra>; rel="next"' } : {},
      }),
    );
  const controller = mountedReader(source, fetcher);
  try {
    await expectRefusal(() => controller.reconcileReady(), 'current PR response has pagination');
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('empty trusted token refuses before a provider call', () => {
  let calls = 0;
  expect(() =>
    createGitHubRestReader({
      token: '',
      fetcher: () => {
        calls += 1;
        return Promise.resolve(Response.json([]));
      },
    }),
  ).toThrow('Trusted GitHub credential malformed');
  expect(calls).toBe(0);
});

test('body read retains source cancellation and cannot hang reconciliation', async () => {
  const source = fixture();
  source.binding.readDeadlineMs = 20;
  let signal: AbortSignal | undefined;
  const fetcher: GitHubFetch = (_url, init) => {
    if (!(init.signal instanceof AbortSignal)) throw new Error('source signal missing');
    signal = init.signal;
    return Promise.resolve(
      new Response(new ReadableStream<Uint8Array>({ start: () => undefined }), { status: 200 }),
    );
  };
  const controller = mountedReader(source, fetcher);
  try {
    await expectRefusal(() => controller.reconcileReady(), 'GitHub PR read deadline exceeded');
    expect(signal?.aborted).toBe(true);
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('reader aborts a body that completes only after its signal was cancelled', async () => {
  const aborter = new AbortController();
  let deliver: ((chunk: Uint8Array) => void) | undefined;
  let beginRead: (() => void) | undefined;
  const reading = new Promise<void>((resolve) => {
    beginRead = resolve;
  });
  const body = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        deliver = (chunk) => {
          controller.enqueue(chunk);
          controller.close();
        };
      },
      pull() {
        beginRead?.();
      },
    },
    { highWaterMark: 0 },
  );
  const reader = createGitHubRestReader({
    fetcher: () => Promise.resolve(new Response(body, { status: 200 })),
  });
  const pending = reader.listOpenPullRequests(
    'Prosperous-Unification',
    'puni-00',
    1,
    aborter.signal,
  );
  await reading;
  aborter.abort();
  if (deliver === undefined) throw new Error('body stream did not initialize');
  deliver(new TextEncoder().encode('[]'));
  await expectRefusal(() => pending, 'AbortError');
});
