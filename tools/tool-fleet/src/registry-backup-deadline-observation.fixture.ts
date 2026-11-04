import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

export const RegistryBackupDeadlineRequest = type({
  family: "'deadline'",
  fault:
    "'none'|'normal'|'guardian'|'worker'|'worker-read'|'restic'|'owner'|'descriptor'|'state'|'late-interrupt'|'not-aborted'|'other'|'schema'|'pre-failure'|'root-deadline'|'not-owner'|'duplicate'|'malformed'|'oversize'|'missing-post'|'reap'|'owner-live'|'reporter'|'caller-uid'|'caller-pid'",
  '+': 'reject',
}).or({ family: "'role'", role: "'selected-guardian'|'pre-kill-guardian'", '+': 'reject' });
export const RegistryBackupDeadlineObservation = type({
  state: "'fulfilled'|'rejected'",
  value: 'unknown',
  message: 'string | null',
  isAggregateError: 'boolean',
  hasMissingFirst: 'boolean',
  hasInjectedMember: 'boolean',
  isExactGuardianFailure: 'boolean',
  memberMessages: '(string | null)[]',
  output: 'string[]',
  roles: 'string[]',
  kills: 'string[]',
  signals: 'unknown[]',
  writes: 'unknown[]',
  paths: 'string[]',
  reaped: 'boolean',
  ownerReads: 'number.safe >= 0',
  descriptorReads: 'number.safe >= 0',
  selectedGuardianReads: 'number.safe >= 0',
  ffiOpens: 'number.safe >= 0',
  ffiCloses: 'number.safe >= 0',
  clock: 'number >= 0',
  '+': 'reject',
});

/** Execute the whole interruption function with actual selector, guardian/owner/descriptor/interrupt parsers and reaper. Proc, journal decode, FD metadata, monotonic time, signals and waitpid remain modeled. No filesystem mutation, subprocess, signal or native library call is forwarded. */
export async function observeRegistryBackupDeadline(
  request: typeof RegistryBackupDeadlineRequest.infer,
) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-backup-deadline-worker.fixture.ts', import.meta.url).pathname,
      JSON.stringify(request),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Backup interruption stdout'),
    readRegistryBytes(child.stderr, 131072, 'Backup interruption stderr'),
  ]);
  if (code !== 0 || errors.byteLength !== 0)
    throw new Error('Backup interruption setup failed: ' + new TextDecoder().decode(errors));
  return RegistryBackupDeadlineObservation.assert(JSON.parse(new TextDecoder().decode(output)));
}
