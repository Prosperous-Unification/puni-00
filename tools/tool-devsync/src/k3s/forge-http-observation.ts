export interface WebObservation {
  readonly path: '/';
  readonly status: number | null;
  readonly contentType: string | null;
  readonly rootMarker: boolean;
  readonly durationMs: number;
  readonly failure: 'response' | 'deadline' | 'body-limit' | 'transport' | null;
}
export interface ConvergenceReport {
  readonly initial: WebObservation;
  readonly initialPassed: boolean;
  readonly observations: readonly WebObservation[];
}
interface ObservationBounds {
  readonly windowMs: number;
  readonly intervalMs: number;
  readonly requestMs: number;
}

function parseOrigin(origin: string): string {
  const url = new URL(origin);
  // Proof: removing the credential clause makes the local credential negative resolve.
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !(url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new Error('loopback HTTP origin required');
  return url.origin;
}
function requireBound(milliseconds: number, label: string): void {
  // Proof: invalid-bound negatives fail when this guard is removed.
  if (!Number.isFinite(milliseconds) || milliseconds < 1 || milliseconds > 30_000)
    throw new Error(`${label} must be between 1 and 30000ms`);
}

/**
 * Performs exactly one GET / with no redirects, cookies, response content logging or mutations.
 * Its deadline covers headers and body; at most 64KiB are inspected for the historical root
 * marker, including a received prefix before timeout, reset or the body cap.
 * Network refusal, denial, timeout and oversized bodies are explicit failed evidence.
 * Invalid origins and bounds throw before opening a connection. Content type is evidence,
 * preserving the existing check's status/root-marker acceptance contract.
 */
export async function observeWeb(origin: string, timeoutMs = 2000): Promise<WebObservation> {
  const authority = parseOrigin(origin);
  requireBound(timeoutMs, 'deadline');
  const started = performance.now();
  const controller = new AbortController();
  let status: number | null = null;
  let contentType: string | null = null;
  let rootMarker = false;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'deadline'>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      resolve('deadline');
    }, timeoutMs);
  });
  const inspect = async (): Promise<WebObservation['failure']> => {
    try {
      const response = await fetch(`${authority}/`, {
        // Proof: local redirect/GET fixture fails if method or redirect policy changes.
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
      });
      status = response.status;
      contentType = response.headers.get('content-type');
      const reader = response.body?.getReader();
      if (reader === undefined) return 'response';
      const decoder = new TextDecoder();
      let bytes = 0;
      let text = '';
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const remaining = 65_536 - bytes;
        text += decoder.decode(chunk.value.subarray(0, remaining), { stream: true });
        // Proof: EOF-only detection loses split markers before deadline/reset and markers
        // in the allowed prefix of a chunk that exceeds the cap.
        rootMarker = text.includes('id="root"');
        bytes += chunk.value.byteLength;
        // Proof: the oversized-body negative fails with this guard removed.
        if (bytes > 65_536) {
          controller.abort();
          return 'body-limit';
        }
      }
      text += decoder.decode();
      rootMarker = text.includes('id="root"');
      // Proof: denial and missing-root negatives fail when acceptance is unconditional.
      return status === 200 && rootMarker ? null : 'response';
    } catch (failure) {
      if (controller.signal.aborted) return expired ? 'deadline' : 'transport';
      if (failure instanceof TypeError) return 'transport';
      throw failure;
    }
  };
  try {
    // Proof: missing-header and never-ending-body fixtures refuse within their real deadline.
    const failure = await Promise.race([inspect(), deadline]);
    return {
      path: '/',
      status,
      contentType,
      rootMarker,
      durationMs: performance.now() - started,
      failure,
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/**
 * Records the immediate verdict separately from later GET-only observations over a fixed
 * window (30s by default). Later success never changes initialPassed. This function never
 * calls the full environment checker, which edits files and writes the database.
 * The window includes the initial request and bounds every later request and pause.
 */
export async function observeConvergence(
  origin: string,
  bounds: ObservationBounds = { windowMs: 30_000, intervalMs: 1000, requestMs: 2000 },
): Promise<ConvergenceReport> {
  parseOrigin(origin);
  requireBound(bounds.windowMs, 'window');
  requireBound(bounds.intervalMs, 'interval');
  requireBound(bounds.requestMs, 'request deadline');
  const deadline = performance.now() + bounds.windowMs;
  // Proof: unclamping this deadline exceeds the slow-initial fixture window.
  const initial = await observeWeb(origin, Math.min(bounds.requestMs, bounds.windowMs));
  const observations: WebObservation[] = [];
  while (performance.now() < deadline) {
    // Proof: an unclamped pause exceeds the oversized-pause fixture window.
    await Bun.sleep(Math.min(bounds.intervalMs, Math.max(0, deadline - performance.now())));
    const remaining = deadline - performance.now();
    if (remaining < 1) break;
    // Proof: an unclamped request exceeds the slow-final fixture window.
    observations.push(await observeWeb(origin, Math.min(bounds.requestMs, remaining)));
  }
  // Proof: the denied-then-success fixture fails when later success replaces this verdict.
  return { initial, initialPassed: initial.failure === null, observations };
}

if (import.meta.main) {
  const origin = process.argv.at(2);
  const extra = process.argv.slice(3);
  // Proof: mutation-argument CLI negative fails when extra arguments are accepted.
  if (origin === undefined || extra.length !== 0)
    throw new Error('Usage: forge-http-observation.ts <loopback-origin>');
  const report = await observeConvergence(origin);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.initialPassed ? 0 : 1;
}
