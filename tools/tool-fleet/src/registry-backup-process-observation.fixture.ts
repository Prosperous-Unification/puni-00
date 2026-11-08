import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

export const RegistryBackupProcessRequest = type({
  family: "'process-read'",
  fault:
    "'none'|'state'|'uid'|'gid'|'unknown-state'|'io'|'logger'|'identity-gap'|'stat-gap'|'non-error-io'",
  at: 'number.safe > 0',
  '+': 'reject',
}).or({
  family: "'selector'",
  fault:
    "'none'|'missing-once'|'uid'|'zombie'|'start'|'parent'|'group'|'changed-command'|'access'|'oversize'",
  '+': 'reject',
});
const Process = type({
  pid: 'number.safe > 0',
  startTicks: 'string',
  parent: 'number.safe >= 0',
  group: 'number.safe > 0',
  command: 'string',
  '+': 'reject',
});
const Outcome = type({
  state: "'fulfilled'|'rejected'",
  message: 'string | null',
  isError: 'boolean',
  isOriginalFailure: 'boolean',
  isAggregateError: 'boolean',
  hasOriginalAndLogger: 'boolean',
  output: 'string[]',
  paths: 'string[]',
  '+': 'reject',
});
export const RegistryBackupProcessObservation = Outcome.merge({
  family: "'process-read'",
  value: Process.or('null'),
  fileReads: type({ path: 'string', encoding: 'string | null', '+': 'reject' }).array(),
  linkReads: 'string[]',
}).or(
  Outcome.merge({
    family: "'selector'",
    value: type({
      guardian: Process,
      worker: Process,
      restic: Process,
      lockId: /^[a-f0-9]{64}$/,
      attemptId: 'string',
      '+': 'reject',
    }).or('null'),
    selectedCommands: 'number.safe >= 0',
  }),
);

/** Observe whole actual process helpers in a disposable worker. Proc/filesystem text, directory listings and journal response validation are modeled; kernel guardian parsing and selector logic stay real. Failed setup, stderr, malformed output, overflow or timeout refuses observation. */
export async function observeRegistryBackupProcess(
  request: typeof RegistryBackupProcessRequest.infer,
) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-backup-process-worker.fixture.ts', import.meta.url).pathname,
      JSON.stringify(request),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Backup process stdout'),
    readRegistryBytes(child.stderr, 131072, 'Backup process stderr'),
  ]);
  // Proof (worker protocol): valid output with a failed exit or unexpected stderr fails the reader case; removing the matching refusal admits the same worker output.
  if (code !== 0 || errors.byteLength !== 0)
    throw new Error('Backup process setup failed: ' + new TextDecoder().decode(errors));
  const observed = RegistryBackupProcessObservation.assert(
    JSON.parse(new TextDecoder().decode(output)),
  );
  if (observed.family !== request.family)
    throw new Error('Backup process observation family differs');
  return observed;
}
