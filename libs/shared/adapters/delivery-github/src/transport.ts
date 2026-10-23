import { ProviderFailure } from './records';

export type GitHubDeliveryFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Fixed read budget: 30 seconds, 32 GETs, 2 MiB per body, 8 MiB across the read. */
export function createTransport(
  fetcher: GitHubDeliveryFetch,
  clock: () => number,
  signal: AbortSignal,
) {
  const deadline = clock() + 30_000;
  let requests = 0;
  let totalBytes = 0;
  return async (path: string): Promise<unknown> => {
    // Proof: removing cancellation checks failed already cancelled reads preserve AbortError and make zero requests.
    signal.throwIfAborted();
    // Proof: removing deadline checks failed bounds the complete read deadline after the injected clock advanced 30001ms.
    if (clock() >= deadline)
      throw new ProviderFailure('timeout', 'GitHub delivery read exceeded 30 seconds');
    // Proof: permitting request 33 failed request budget refuses the 33rd fetch across multiple histories.
    if (++requests > 32)
      throw new ProviderFailure('budget-exceeded', 'GitHub delivery read exceeded 32 requests');
    let response: Response;
    try {
      // Proof: changing origin or manual redirects independently failed the fixed anonymous GET exact-request reader test.
      response = await fetcher(`https://api.github.com${path}`, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        signal,
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
      });
    } catch {
      // Proof: removing cancellation checks failed already cancelled reads preserve AbortError and make zero requests.
      signal.throwIfAborted();
      throw new ProviderFailure('provider-unavailable', 'GitHub could not be reached');
    }
    // Proof: accepting non-200 status failed HTTP refusals; accepting redirected 200 failed already-followed redirects before dependent reads.
    if (response.status !== 200 || response.redirected) {
      const reason =
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get('x-ratelimit-remaining') === '0' ||
            response.headers.has('retry-after')))
          ? 'rate-limited'
          : response.status === 404
            ? 'missing'
            : response.status === 401 || response.status === 403
              ? 'inaccessible'
              : response.status >= 500
                ? 'provider-unavailable'
                : 'invalid-response';
      throw new ProviderFailure(
        reason,
        `GitHub delivery request refused (${String(response.status)})`,
      );
    }
    // Proof: removing absence validation failed rejects malformed JSON and absent bodies with an unexpected TypeError.
    if (response.body === null)
      throw new ProviderFailure('invalid-response', 'GitHub returned no response body');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        // Proof: removing cancellation checks failed already cancelled reads preserve AbortError and make zero requests.
        signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        totalBytes += chunk.value.byteLength;
        // Proof: removing individual/aggregate limits independently failed bounds streamed bytes and total body budget.
        if (bytes > 2 * 1024 * 1024 || totalBytes > 8 * 1024 * 1024)
          throw new ProviderFailure(
            'budget-exceeded',
            'GitHub delivery response exceeded the body budget',
          );
        chunks.push(chunk.value);
      }
    } catch (failure) {
      // Proof: removing cancellation checks failed already cancelled reads preserve AbortError and make zero requests.
      signal.throwIfAborted();
      if (failure instanceof ProviderFailure) throw failure;
      // Proof: rethrowing a raw stream fault failed unreadable body cannot become empty successful observation.
      throw new ProviderFailure('provider-unavailable', 'GitHub response body could not be read');
    } finally {
      reader.releaseLock();
    }
    // Proof: removing deadline checks failed bounds the complete read deadline after the injected clock advanced 30001ms.
    if (clock() >= deadline)
      throw new ProviderFailure('timeout', 'GitHub delivery read exceeded 30 seconds');
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } catch {
      // Proof: rethrowing a raw decoder fault failed rejects malformed JSON and absent bodies.
      throw new ProviderFailure('invalid-response', 'GitHub returned invalid JSON');
    }
  };
}
