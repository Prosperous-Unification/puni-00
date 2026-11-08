import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

export const RegistryUnsafeRequest = type({
  fault:
    "'normal'|'spawn'|'exit'|'invalid-pid'|'duplicate'|'argv'|'admission'|'root'|'action'|'topology'|'no-child'|'unterminated'|'reporter'|'null-admission'|'undefined-admission'|'opaque-admission'|'reporter-only'",
  '+': 'reject',
});
export const RegistryUnsafeObservation = type({
  state: "'fulfilled'|'rejected'",
  value: 'string | null',
  message: 'string | null',
  isOriginalFailure: 'boolean',
  isAggregateError: 'boolean',
  hasOriginalFirst: 'boolean',
  hasReporterSecond: 'boolean',
  hasReporterCause: 'boolean',
  isReporterFailure: 'boolean',
  memberCount: 'number.safe >= 0',
  commands: 'unknown[]',
  records: 'unknown[]',
  hasForwardedInput: 'boolean',
  hasForwardedOptions: 'boolean',
  hasReturnedChild: 'boolean',
  hasRestoredSpawn: 'boolean',
  settlementBeforeRelease: "'fulfilled'|'rejected'|'pending'|null",
  '+': 'reject',
});

/** Whole actual unsafe-GC fixture in a disposable worker. Eligibility, proc, action dispatch and children remain modeled; no Distribution, privileged spawn, signal or filesystem mutation is forwarded. Identity/restoration observations precede worker rescue. */
export async function observeRegistryUnsafe(request: typeof RegistryUnsafeRequest.infer) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-unsafe-worker.fixture.ts', import.meta.url).pathname,
      JSON.stringify(request),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Unsafe observation stdout'),
    readRegistryBytes(child.stderr, 131072, 'Unsafe observation stderr'),
  ]);
  // Proof (worker protocol): valid response with stderr or nonzero exit is refused; removing only that term admits the same response in the archived protocol cases.
  if (code !== 0 || errors.byteLength !== 0)
    throw new Error('Unsafe observation setup failed: ' + new TextDecoder().decode(errors));
  return RegistryUnsafeObservation.assert(JSON.parse(new TextDecoder().decode(output)));
}
