import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

export const RegistryBackupFixtureRequest = type({
  family: "'reap'",
  fault:
    "'ECHILD'|'EINVAL'|'pid-reused'|'proc-absent'|'proc-denied'|'group-live'|'group-denied'|'null-errno'",
  '+': 'reject',
})
  .or({
    family: "'terminal-file'",
    fault:
      "'none'|'file-type'|'uid'|'gid'|'links'|'mode'|'size'|'growth'|'absent'|'unreadable'|'read-fails'",
    '+': 'reject',
  })
  .or({
    family: "'terminal-observer'",
    fault: "'normal'|'operation-fails'|'bad-pid'|'bad-exit'|'bad-signal'|'write-fails'",
    '+': 'reject',
  });
const Outcome = type({
  state: "'fulfilled'|'rejected'",
  value: 'string | null',
  message: 'string | null',
  isError: 'boolean',
  isOriginalFailure: 'boolean',
  hasOriginalMember: 'boolean',
  '+': 'reject',
});
export const RegistryBackupFixtureObservation = Outcome.merge({
  family: "'reap'",
  hasClosedHandle: 'boolean',
  reads: 'number.safe >= 0',
  errnoReads: 'number.safe >= 0',
  groups: 'unknown[]',
})
  .or(
    Outcome.merge({
      family: "'terminal-file'",
      hasClosedDescriptor: 'boolean',
    }),
  )
  .or(
    Outcome.merge({
      family: "'terminal-observer'",
      workerPid: 'number.safe > 0',
      hasSettledBeforeRelease: 'boolean',
      recordsBeforeRelease: 'unknown[]',
      records: 'unknown[]',
      hasRestoredSpawn: 'boolean',
      hasForwardedCommand: 'boolean',
      hasForwardedOptions: 'boolean',
      hasPreservedReturnedChild: 'boolean',
    }),
  );

/** Import the whole actual backup helper in an isolated worker. Files, waitpid, signal probes and returned children are modeled; no privileged effect is forwarded. Failed setup, malformed output, overflow or timeout refuses observation. */
export async function observeRegistryBackupFixture(
  request: typeof RegistryBackupFixtureRequest.infer,
) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-backup-observation-worker.fixture.ts', import.meta.url).pathname,
      JSON.stringify(request),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Backup observation stdout'),
    readRegistryBytes(child.stderr, 131072, 'Backup observation stderr'),
  ]);
  if (code !== 0)
    throw new Error('Backup observation setup failed: ' + new TextDecoder().decode(errors));
  const observed = RegistryBackupFixtureObservation.assert(
    JSON.parse(new TextDecoder().decode(output)),
  );
  if (observed.family !== request.family) throw new Error('Backup observation family differs');
  return observed;
}
