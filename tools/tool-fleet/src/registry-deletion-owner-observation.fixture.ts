import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

export const RegistryDeletionOwnerRequest = type({
  family: "'maintenance'",
  fault:
    "'exact'|'unrelated'|'aggregate'|'reporter'|'observation'|'both-reporters'|'reporter-observation'|'undefined'|'null'|'opaque'|'success'|'success-observation'|'success-report'|'caller-uid'|'caller-gid'",
  '+': 'reject',
})
  .or({
    family: "'publication'",
    fault: "'none'|'publication'|'observation'|'both'|'output'",
    kind: "'expired'|'protected'",
    '+': 'reject',
  })
  .or({
    family: "'population'",
    fault:
      "'none'|'publication'|'observation'|'both'|'output'|'output-observation'|'confirmation'|'confirmation-observation'|'delayed-confirmation'",
    '+': 'reject',
  });
export const RegistryDeletionOwnerObservation = type({
  state: "'fulfilled'|'rejected'",
  message: 'string | null',
  isAggregateError: 'boolean',
  isExactPrimary: 'boolean',
  hasPrimaryCause: 'boolean',
  hasObserverCause: 'boolean',
  hasOutputCause: 'boolean',
  members: 'string[]',
  events: 'string[]',
  output: 'string[]',
  errors: 'string[]',
  received: 'unknown[]',
  selectedPublication: "'expired'|'protected'|null",
  observerFinishes: 'number.safe >= 0',
  settledBeforeConfirmation: 'boolean | null',
  publishedBeforeConfirmation: 'boolean | null',
  '+': 'reject',
});

/** Execute the whole native owner with fixed modeled installation, authority/runtime and publication/maintenance effects. Identity, reporter membership and required observer finalization are captured before restoring globals. No filesystem, subprocess, signal or native authority action is forwarded. */
export async function observeRegistryDeletionOwner(
  request: typeof RegistryDeletionOwnerRequest.infer,
) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-deletion-owner-worker.fixture.ts', import.meta.url).pathname,
      JSON.stringify(request),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Deletion owner stdout'),
    readRegistryBytes(child.stderr, 131072, 'Deletion owner stderr'),
  ]);
  if (code !== 0 || errors.byteLength !== 0)
    throw new Error('Deletion owner setup failed: ' + new TextDecoder().decode(errors));
  return RegistryDeletionOwnerObservation.assert(JSON.parse(new TextDecoder().decode(output)));
}
