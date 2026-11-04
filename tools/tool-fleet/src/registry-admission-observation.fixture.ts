import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

const Observation = type({
  state: "'fulfilled'|'rejected'",
  value: 'string | null',
  message: 'string | null',
  isOriginalFailure: 'boolean',
  hasRestoredSpawn: 'boolean',
  records: 'unknown[]',
  commands: 'unknown[]',
  requests: 'unknown[]',
  reads: 'string[]',
  '+': 'reject',
});

/** Observe actual imported admission helpers in a disposable child. The worker models root eligibility, filesystem, GC spawn and authority calls; no privileged/native GC effect is forwarded. Malformed output, failed setup, overflow or timeout refuses the observation. */
export async function observeRegistryAdmission(family: 'collection' | 'protection', fault: string) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-admission-worker.fixture.ts', import.meta.url).pathname,
      family,
      fault,
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Admission observation stdout'),
    readRegistryBytes(child.stderr, 131072, 'Admission observation stderr'),
  ]);
  if (code !== 0)
    throw new Error('Admission observation setup failed: ' + new TextDecoder().decode(errors));
  return Observation.assert(JSON.parse(new TextDecoder().decode(output)));
}
