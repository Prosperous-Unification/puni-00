import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

export const RegistryServerObservationRequest = type({
  family: "'cleanup'|'native'",
  fault: "'none'|'metadata'|'identity'|'unlink'",
  phase: "'ready'|'spawn'",
  action: "'readonly'|'deletion'|'collect'",
  primary: "'error'|'undefined'|'null'|'string'",
  '+': 'reject',
});
export const RegistryServerObservation = type({
  state: "'fulfilled'|'rejected'",
  isOriginalFailure: 'boolean',
  isAggregateError: 'boolean',
  hasOriginalFirst: 'boolean',
  hasCleanupSecond: 'boolean',
  hasCleanupCause: 'boolean',
  hasIdentityCause: 'boolean',
  memberCount: 'number.safe >= 0',
  cleanupMessage: 'string | null',
  observations: 'string[]',
  cleanupPaths: 'string[]',
  hasSettledBeforeCleanup: 'boolean',
  pipeSettlements: 'number.safe >= 0',
  requests: 'number.safe >= 0',
  code: 'number.integer | null',
  signal: 'string | null',
  groupAbsent: 'boolean | null',
  spawnCommand: 'string[]',
  spawnOptions: 'unknown',
  authWrites: 'string[]',
  authClosed: 'boolean',
  listenerChecks: 'number.safe >= 0',
  '+': 'reject',
});

/** Import the actual server module in a disposable worker. Artifact/filesystem/HTTP inputs are modeled. Only the native family creates one fixed owned Bun group and uses the actual lifetime helper. Cleanup/error observations precede worker rescue. */
export async function observeRegistryServer(
  request: typeof RegistryServerObservationRequest.infer,
) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-server-worker.fixture.ts', import.meta.url).pathname,
      JSON.stringify(request),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(12000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Server observation stdout'),
    readRegistryBytes(child.stderr, 131072, 'Server observation stderr'),
  ]);
  if (code !== 0 || errors.byteLength !== 0)
    throw new Error('Server observation setup failed: ' + new TextDecoder().decode(errors));
  return RegistryServerObservation.assert(JSON.parse(new TextDecoder().decode(output)));
}
