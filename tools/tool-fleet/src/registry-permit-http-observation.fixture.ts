import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

export const RegistryPermitHttpRequest = type({
  scenario:
    "'reset'|'resets'|'unknown'|'non-error'|'cancellation'|'unexpected'|'refused'|'timeout'|'uuid-missing'|'uuid-invalid'|'oversized'|'body-error'|'cap'|'writable'|'pre-cancel'",
  '+': 'reject',
});
export const RegistryPermitHttpOutcome = type({
  state: "'fulfilled'|'rejected'",
  message: 'string | null',
  isOriginalFailure: 'boolean',
  isAggregateError: 'boolean',
  originalMembers: 'number.safe >= 0',
  hasOriginalCause: 'boolean',
  isCancellation: 'boolean',
  calls: 'number.safe >= 0',
  elapsed: 'number.safe >= 0',
  categories: 'string[]',
  requests: 'unknown[]',
  lastHttp: 'string',
  expectedHttp: '202 | 405 | null',
  uploads: 'number.safe >= 0',
  savedUploads: 'number | null',
  '+': 'reject',
});

/** Execute the actual shared native HTTP helper in a disposable worker. Fetch/clock/sleep are modeled; actual Response bodies, abort signals, stream bounds, counter state and diagnostic snapshots remain active. No network or subprocess is forwarded. */
export async function observeRegistryPermitHttp(request: typeof RegistryPermitHttpRequest.infer) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-permit-http-worker.fixture.ts', import.meta.url).pathname,
      JSON.stringify(request),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Permit HTTP stdout'),
    readRegistryBytes(child.stderr, 131072, 'Permit HTTP stderr'),
  ]);
  if (code !== 0 || errors.byteLength !== 0)
    throw new Error('Permit HTTP setup failed: ' + new TextDecoder().decode(errors));
  return RegistryPermitHttpOutcome.assert(JSON.parse(new TextDecoder().decode(output)));
}
