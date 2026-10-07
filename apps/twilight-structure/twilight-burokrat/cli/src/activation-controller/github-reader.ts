import { type GitHubPullRequestReader } from './github-source';

// Proof: changing either fixed origin or API version failed the mounted exact-request test.
const apiOrigin = 'https://api.github.com';
const apiVersion = '2026-03-10';
const maxBodyBytes = 8 * 1024 * 1024;

export interface GitHubRestReaderOptions {
  readonly fetcher?: GitHubFetch;
  /** Supplied only by the independently trusted runtime; omitted for public reads. */
  readonly token?: string;
}

/** Narrow GET transport seam; it carries no provider-selected request URL. */
export type GitHubFetch = (url: string, init: RequestInit) => Promise<Response>;

export type GitHubReadFailureKind =
  'unavailable' | 'rate-limited' | 'inaccessible' | 'invalid-response';

/** A provider refusal, never an empty inventory or a confirmed closed PR. */
export class GitHubReadFailure extends Error {
  constructor(
    readonly kind: GitHubReadFailureKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function pullsPath(owner: string, name: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls`;
}

function listUrl(path: string, page: number): string {
  // Proof: admitting page 101 made the direct reader test issue a forbidden extra GET.
  if (!Number.isSafeInteger(page) || page < 1 || page > 100) {
    throw new GitHubReadFailure('invalid-response', 'GitHub PR page is outside bounded scan');
  }
  const url = new URL(path, apiOrigin);
  url.searchParams.set('state', 'open');
  url.searchParams.set('per_page', '100');
  url.searchParams.set('page', String(page));
  return url.href;
}

function nextPage(link: string | null, path: string, page: number): number | null {
  if (link === null) return null;
  let next: number | null = null;
  let last: number | null = null;
  const relations = new Set<string>();
  for (const entry of link.split(',')) {
    const match = /^\s*<([^<>]+)>;\s*rel="(next|prev|first|last)"\s*$/.exec(entry);
    // Proof: omitting this grammar refusal changed the malformed-Link fixture to the
    // separately named malformed-URL refusal; this proves diagnostic specificity.
    if (match === null) {
      throw new GitHubReadFailure('invalid-response', 'GitHub PR pagination link malformed');
    }
    let target: URL;
    try {
      target = new URL(match[1]);
    } catch {
      throw new GitHubReadFailure('invalid-response', 'GitHub PR pagination URL malformed');
    }
    // Proof: allowing a repeated next relation changed the mounted named refusal and
    // let the source attempt a second page rather than rejecting ambiguous metadata.
    if (relations.has(match[2])) {
      throw new GitHubReadFailure('invalid-response', 'GitHub PR pagination relation repeated');
    }
    relations.add(match[2]);
    // Proof: omitting origin, path or state-query joins independently failed mounted
    // foreign/changed Link refusals before a second credentialed read.
    if (
      target.origin !== apiOrigin ||
      target.pathname !== path ||
      target.username !== '' ||
      target.password !== '' ||
      target.hash !== '' ||
      target.searchParams.size !== 3 ||
      target.searchParams.get('state') !== 'open' ||
      target.searchParams.get('per_page') !== '100'
    ) {
      throw new GitHubReadFailure(
        'invalid-response',
        'GitHub PR pagination link differs from pinned request',
      );
    }
    const linkedPage = Number(target.searchParams.get('page'));
    if (!Number.isSafeInteger(linkedPage) || linkedPage < 1 || linkedPage > 100) {
      throw new GitHubReadFailure('invalid-response', 'GitHub PR pagination page malformed');
    }
    if (match[2] === 'next') {
      // Proof: omitting this comparison let a skipped page reach the later source cursor
      // refusal instead of the reader's named next-page refusal; no inventory was committed.
      if (linkedPage !== page + 1) {
        throw new GitHubReadFailure('invalid-response', 'GitHub PR pagination next page changed');
      }
      next = linkedPage;
    }
    // Proof: omitting this relation accepted a page-2 previous link on page 1.
    if (match[2] === 'prev' && (page === 1 || linkedPage !== page - 1)) {
      throw new GitHubReadFailure('invalid-response', 'GitHub PR pagination previous page changed');
    }
    // Proof: omitting this relation accepted a first-page link to page 2.
    if (match[2] === 'first' && linkedPage !== 1) {
      throw new GitHubReadFailure('invalid-response', 'GitHub PR pagination first page changed');
    }
    if (match[2] === 'last') {
      // Proof: omitting this comparison accepted last page 1 while reading page 2.
      if (linkedPage < page) {
        throw new GitHubReadFailure('invalid-response', 'GitHub PR pagination last page changed');
      }
      last = linkedPage;
    }
  }
  // Proof: omitting the future-last check accepted a truncated Link set as a complete
  // inventory in the mounted test.
  if (
    (next === null && last !== null && last > page) ||
    (next !== null && last !== null && last < next)
  ) {
    throw new GitHubReadFailure('invalid-response', 'GitHub PR pagination continuation missing');
  }
  return next;
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (body === null) return;
  try {
    await body.cancel();
  } catch {
    // Proof: rethrowing a cleanup error exposed the harmless Bearer sentinel.
    throw new GitHubReadFailure('unavailable', 'GitHub PR GET unavailable');
  }
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get('content-length');
  // Proof: removing the declared size or numeric-shape predicate independently accepted
  // an otherwise valid empty inventory with untrusted length metadata.
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) {
    // Proof: omitting cancellation left the declared-oversize stream active (0 calls).
    await cancelBody(response.body);
    throw new GitHubReadFailure('invalid-response', 'GitHub PR response byte limit exceeded');
  }
  if (response.body === null) {
    throw new GitHubReadFailure('invalid-response', 'GitHub PR response body missing');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let abortRead: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abortRead = () => {
      reject(new DOMException('GitHub PR body read aborted', 'AbortError'));
    };
    // Proof: omitting this abort listener left a pending body read unsettled;
    // the mounted test exceeded its explicit four-second timeout (exit 124).
    signal.addEventListener('abort', abortRead, { once: true });
  });
  try {
    for (;;) {
      const chunk = await Promise.race([reader.read(), aborted]);
      // Proof: omitting the post-read abort check let a cancelled body finish as a
      // successful list in the direct production reader test.
      signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      // Proof: removing this streamed cap accepted an oversized valid empty inventory;
      // it did not create a durable request in that fixture.
      if (bytes > maxBodyBytes) {
        throw new GitHubReadFailure('invalid-response', 'GitHub PR response byte limit exceeded');
      }
      chunks.push(chunk.value);
    }
  } catch (error) {
    // Proof: omitting cancellation left the streamed-oversize stream active (0 calls).
    await reader.cancel();
    signal.throwIfAborted();
    throw error;
  } finally {
    if (abortRead !== undefined) signal.removeEventListener('abort', abortRead);
    reader.releaseLock();
  }
  const combined = new Uint8Array(bytes);
  let position = 0;
  for (const chunk of chunks) {
    combined.set(chunk, position);
    position += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(combined));
  } catch {
    // Proof: substituting an empty array here accepted malformed JSON as empty discovery.
    throw new GitHubReadFailure('invalid-response', 'GitHub PR JSON malformed');
  }
}

/** Creates a GET-only reader for a fixed GitHub API origin. No request URL comes from a PR. */
export function createGitHubRestReader(options: GitHubRestReaderOptions): GitHubPullRequestReader {
  const fetcher: GitHubFetch = options.fetcher ?? ((url, init) => fetch(url, init));
  // Proof: omitting the empty-token guard constructed a credentialed reader from an
  // absent trusted value in the mounted no-provider-call test.
  if (options.token !== undefined && (options.token.length === 0 || /[\r\n]/.test(options.token))) {
    throw new GitHubReadFailure('invalid-response', 'Trusted GitHub credential malformed');
  }
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': apiVersion,
  });
  // Proof: dropping this optional header failed the mounted trusted-token read, while
  // anonymous reads assert no Authorization header at all.
  if (options.token !== undefined) headers.set('Authorization', `Bearer ${options.token}`);

  async function read(
    url: string,
    signal: AbortSignal,
  ): Promise<{ body: unknown; link: string | null }> {
    signal.throwIfAborted();
    let response: Response;
    try {
      // Proof: changing redirect:error to follow exposed the harmless token to the
      // mounted redirect spy; method, cache and credential-mode omissions also failed.
      response = await fetcher(url, {
        method: 'GET',
        headers,
        signal,
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch {
      // Provider/transport errors may include request headers. Do not copy them into a
      // diagnostic that could reveal the optional trusted credential.
      throw new GitHubReadFailure('unavailable', 'GitHub PR GET unavailable');
    }
    if (signal.aborted) {
      // Proof: omitting this cancellation left a late fetch response body open
      // after the mounted abort (cancel count zero instead of one).
      await cancelBody(response.body);
      signal.throwIfAborted();
    }
    // Proof: omitting the non-200 check changed the mounted HTTP 302 named refusal to
    // a later shape refusal; no durable state changed in that fault.
    if (response.status !== 200) {
      const rateLimited =
        // Proof: omitting the 429 classification changed its named retryable refusal.
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get('x-ratelimit-remaining') === '0' ||
            response.headers.has('retry-after')));
      // Proof: omitting cancellation left the HTTP refusal stream active (0 calls).
      await cancelBody(response.body);
      throw new GitHubReadFailure(
        rateLimited ? 'rate-limited' : response.status >= 500 ? 'unavailable' : 'inaccessible',
        rateLimited
          ? 'GitHub PR read rate limited'
          : `GitHub PR GET refused (${String(response.status)})`,
        response.status,
      );
    }
    try {
      return { body: await boundedJson(response, signal), link: response.headers.get('link') };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof GitHubReadFailure) throw error;
      // Proof: rethrowing a body error exposed the harmless Bearer sentinel.
      throw new GitHubReadFailure('unavailable', 'GitHub PR GET unavailable');
    }
  }

  return {
    listOpenPullRequests: async (owner, name, page, signal) => {
      const path = pullsPath(owner, name);
      const response = await read(listUrl(path, page), signal);
      if (!Array.isArray(response.body)) {
        // Proof: removing the list-shape guard changed the mounted refusal to the later
        // source schema boundary; no request was admitted.
        throw new GitHubReadFailure('invalid-response', 'GitHub PR list is not an array');
      }
      return { pulls: response.body, nextPage: nextPage(response.link, path, page) };
    },
    getPullRequest: async (owner, name, number, signal) => {
      // Proof: omitting this number bound made a direct reader call GET /pulls/0.
      if (!Number.isSafeInteger(number) || number < 1) {
        throw new GitHubReadFailure('invalid-response', 'GitHub PR number malformed');
      }
      const response = await read(
        `${apiOrigin}${pullsPath(owner, name)}/${String(number)}`,
        signal,
      );
      if (response.link !== null) {
        // Proof: omitting this guard let a paginated current PR response create a request.
        throw new GitHubReadFailure(
          'invalid-response',
          'GitHub current PR response has pagination',
        );
      }
      return response.body;
    },
  };
}
