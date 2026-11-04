import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

export const RegistryDeletionRequest = type({
  mode: "'unsafe-gc'|'tag-cleanup'",
  fault:
    "'none'|'private-mode'|'original-mode-invalid'|'restored-mode-differs'|'actual-mode-differs'|'owner-success'|'unfenced'|'backup'|'provenance'|'gc-exit'|'child-present'|'accepted'|'http'|'restore-service'|'unknown-cause'|'early-failure'|'protected-status'|'protected-content'",
  '+': 'reject',
});
export const RegistryDeletionObservation = type({
  state: "'fulfilled'|'rejected'",
  message: 'string | null',
  records: 'unknown[]',
  nativeReceipt: 'unknown',
  guardCloses: 'number.safe >= 0',
  guardModes: 'string[]',
  requests: 'string[]',
  requestedModes: 'string[]',
  ownedWrites: 'string[]',
  '+': 'reject',
});

/** Execute the actual deletion controller and protected-content verifier in a disposable worker on fresh owned files. Host setup, journal decoding, guard and owner responses remain modeled; HTTP observation decoding and SHA256 response verification are real. No server, privileged write or signal is forwarded. */
export async function observeRegistryDeletion(request: typeof RegistryDeletionRequest.infer) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-deletion-worker.fixture.ts', import.meta.url).pathname,
      JSON.stringify(request),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(12000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Deletion observation stdout'),
    readRegistryBytes(child.stderr, 131072, 'Deletion observation stderr'),
  ]);
  if (code !== 0 || errors.byteLength !== 0)
    throw new Error('Deletion observation setup failed: ' + new TextDecoder().decode(errors));
  return RegistryDeletionObservation.assert(JSON.parse(new TextDecoder().decode(output)));
}
