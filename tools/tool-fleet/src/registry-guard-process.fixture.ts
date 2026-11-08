import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

export const RegistryGuardProcessRequest = type({
  fault:
    "'none'|'esrch'|'exit-esrch'|'enoent'|'eacces'|'eperm'|'unknown'|'non-error'|'uid'|'environment'|'start-race'|'census-race'|'multiple'|'oversize-census'|'exited-before'|'exited-after'",
  '+': 'reject',
});
export const RegistryGuardProcessObservation = type({
  state: "'fulfilled'|'rejected'",
  mode: "'readonly'|'writable'|'transition'|'exited'|null",
  identity: 'string | null',
  message: 'string | null',
  isOriginalFailure: 'boolean',
  seen: 'string[]',
  kills: 'string[]',
  mounts: 'string[]',
  isReadonly: 'boolean',
  spawnCommand: 'string[]',
  '+': 'reject',
});

/** Observe through the whole actual starter in an isolated worker. Root/PID eligibility, mounts, proc, HTTP and child lifetime are modeled; no native child or privileged operation is forwarded. Observation precedes required close/restoration. */
export async function observeRegistryGuardProcess(
  request: typeof RegistryGuardProcessRequest.infer,
) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-guard-process-worker.fixture.ts', import.meta.url).pathname,
      JSON.stringify(request),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Guard process stdout'),
    readRegistryBytes(child.stderr, 131072, 'Guard process stderr'),
  ]);
  if (code !== 0 || errors.byteLength !== 0)
    throw new Error('Guard process setup failed: ' + new TextDecoder().decode(errors));
  return RegistryGuardProcessObservation.assert(JSON.parse(new TextDecoder().decode(output)));
}
