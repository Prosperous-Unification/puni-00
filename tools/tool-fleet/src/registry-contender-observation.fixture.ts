import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

export const RegistryContenderRequest = type({
  family: "'acquire'",
  fault: "'absent'|'live'|'denied'|'unknown'|'opaque'",
  '+': 'reject',
}).or({ family: "'invoke'", fault: "'stage'|'reporter-once'|'reporter-always'", '+': 'reject' });
export const RegistryContenderObservation = type({
  state: "'fulfilled'|'rejected'",
  message: 'string | null',
  isOriginalFailure: 'boolean',
  isAggregateError: 'boolean',
  memberCount: 'number.safe >= 0',
  nestedMemberCount: 'number.safe >= 0',
  hasStageFirst: 'boolean',
  hasReporterSecond: 'boolean',
  hasReporterCause: 'boolean',
  hasNestedStageFirst: 'boolean',
  hasNestedReporterSecond: 'boolean',
  hasNestedReporterCause: 'boolean',
  hasSetupFailure: 'boolean',
  measurements: 'number.safe >= 0',
  permissions: 'number.safe >= 0',
  output: 'string[]',
  probes: 'unknown[]',
  commands: 'string[]',
  writes: 'string[]',
  '+': 'reject',
});

/** Actual contender and outer proof caller in a disposable worker. Acquire uses real journal files/flock under a fresh private directory, with only its fixed native journal path remapped. Group probes/privileged setup/launches remain modeled and guarded. */
export async function observeRegistryContender(request: typeof RegistryContenderRequest.infer) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-contender-worker.fixture.ts', import.meta.url).pathname,
      JSON.stringify(request),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Contender stdout'),
    readRegistryBytes(child.stderr, 131072, 'Contender stderr'),
  ]);
  if (code !== 0 || errors.byteLength !== 0)
    throw new Error('Contender setup failed: ' + new TextDecoder().decode(errors));
  return RegistryContenderObservation.assert(JSON.parse(new TextDecoder().decode(output)));
}
