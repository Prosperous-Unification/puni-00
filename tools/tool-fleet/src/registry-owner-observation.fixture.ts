import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

export const RegistryOwnerObservationRequest = type({
  fault:
    "'monitor'|'all'|'formatter'|'logger'|'opaque-monitor'|'delayed-exit'|'delayed-stdout'|'delayed-stderr'|'no-fault'",
  '+': 'reject',
});
export const RegistryOwnerObservation = type({
  state: "'fulfilled'|'rejected'",
  isAggregateError: 'boolean',
  failureSlots: 'string[]',
  output: 'string[]',
  hasSettledBeforeRelease: 'boolean | null',
  hasObservedHeldCompletion: 'boolean',
  kills: 'string[]',
  reads: 'string[]',
  spawnCommand: 'string[]',
  spawnOptions: 'unknown',
  monitorOwner: 'unknown',
  value: 'unknown',
  '+': 'reject',
});

/** Import the actual native owner module in a disposable worker. Spawned child, proc input, interrupt monitor and held completions are modeled; no native launch/signal/filesystem mutation is forwarded. Member identity and settlement are captured before restoration. */
export async function observeRegistryOwner(request: typeof RegistryOwnerObservationRequest.infer) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-owner-worker.fixture.ts', import.meta.url).pathname,
      JSON.stringify(request),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Owner observation stdout'),
    readRegistryBytes(child.stderr, 131072, 'Owner observation stderr'),
  ]);
  if (code !== 0 || errors.byteLength !== 0)
    throw new Error('Owner observation setup failed: ' + new TextDecoder().decode(errors));
  return RegistryOwnerObservation.assert(JSON.parse(new TextDecoder().decode(output)));
}
