import { readRegistryBytes } from './registry-stream';

export interface RegistryPermitHttpObservation {
  readonly lastHttp:
    | 'unobserved'
    | '202'
    | '405'
    | 'unexpected-status'
    | 'connection-refused'
    | 'connection-reset'
    | 'timeout'
    | 'other-error';
  readonly expectedHttp: 202 | 405 | null;
  readonly uploads: number;
}

/** One native guard rehearsal's bounded HTTP probe. The six-second retry bound resets per call. Its counter persists across calls and refuses after observing upload257; the request has already occurred. Unknown transport/body failures and cancellation preserve their exact causes. Diagnostic snapshots are copies and cannot reset the private counter. Fetch, clock and sleep are the native globals; the disposable unit worker alone models them. */
export function createRegistryPermitHttpProbe(signal: AbortSignal) {
  let lastHttp: RegistryPermitHttpObservation['lastHttp'] = 'unobserved';
  let expectedHttp: 202 | 405 | null = null;
  let uploads = 0;
  const awaitStatus = async (expected: 202 | 405) => {
    expectedHttp = expected;
    lastHttp = 'unobserved';
    const end = Date.now() + 6000;
    for (;;) {
      signal.throwIfAborted();
      // Proof: removed bound reaches the explicit test rescue after120 resets in registry-permit-http.test.ts.
      if (Date.now() >= end) throw new Error('Owned guard HTTP outcome did not converge');
      let response: Response;
      try {
        response = await fetch('http://127.0.0.1:5052/v2/guard-proof/blobs/uploads/', {
          method: 'POST',
          signal: AbortSignal.any([signal, AbortSignal.timeout(500)]),
        });
      } catch (cause) {
        // Proof: removed reset category/retry fails exact-helper reset convergence; removed Error allowlist loses unknown/non-Error identity. Fixture fetch/clock are modeled.
        lastHttp =
          cause instanceof Error && 'code' in cause && cause.code === 'ECONNREFUSED'
            ? 'connection-refused'
            : cause instanceof Error && 'code' in cause && cause.code === 'ECONNRESET'
              ? 'connection-reset'
              : cause instanceof Error && cause.name === 'TimeoutError'
                ? 'timeout'
                : 'other-error';
        signal.throwIfAborted();
        if (
          !(cause instanceof Error) ||
          !(
            ('code' in cause && (cause.code === 'ECONNREFUSED' || cause.code === 'ECONNRESET')) ||
            cause.name === 'TimeoutError'
          )
        )
          throw cause;
        await Bun.sleep(50);
        continue;
      }
      lastHttp =
        response.status === 202 ? '202' : response.status === 405 ? '405' : 'unexpected-status';
      await readRegistryBytes(response.body, 4096, 'Owned guard HTTP response');
      if (response.status === 202) {
        if (
          !/^[0-9a-f-]{36}$/.test(response.headers.get('docker-upload-uuid') ?? '') ||
          ++uploads > 256
        )
          throw new Error('Unknown or excessive owned upload probes');
      } else if (response.status !== 405) throw new Error('Unexpected owned guard response');
      // Proof: removed expected-status comparison accepts writable202 on call2 instead of required405 on call3 after reset.
      if (response.status === expected) return;
      await Bun.sleep(100);
    }
  };
  return {
    awaitStatus,
    readObservation(): RegistryPermitHttpObservation {
      return { lastHttp, expectedHttp, uploads };
    },
  };
}
