import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { readRegistryBytes } from './registry-stream';

const Observation = type({
  state: "'returned'|'rejected'",
  targetReached: 'boolean',
  closeCalls: 'number',
  settledBeforeRelease: 'boolean',
  closed: 'boolean',
  marker: 'string|null',
  aggregate: 'boolean',
  members: 'number',
  primarySame: 'boolean',
  cleanupSame: 'boolean',
  causeOwn: 'boolean',
  causeSame: 'boolean',
  singlePrimarySame: 'boolean',
  singleCleanupSame: 'boolean',
  primarySyntax: 'boolean',
  primaryOwner: 'boolean',
  restored: 'boolean',
  message: 'string',
  '+': 'reject',
});

async function observeCompletion(scope: string, fault: string) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-maintenance-completion-worker.fixture.ts', import.meta.url).pathname,
      scope,
      fault,
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 65536, 'Completion observation'),
    readRegistryBytes(child.stderr, 65536, 'Completion fixture error'),
  ]);
  if (code !== 0)
    throw new Error('Completion fixture setup failed: ' + new TextDecoder().decode(errors));
  expect(errors.byteLength).toBe(0);
  return Observation.assert(JSON.parse(new TextDecoder().decode(output)));
}
for (const scope of [
  'census',
  'deletion',
  'retained',
  'stage',
  'activate',
  'restore',
  'open-readonly',
  'open-deletion',
  'open-recovery',
] as const)
  for (const fault of [
    'both-error',
    'work-error',
    'cleanup-error',
    'success',
    'both-undefined',
    'both-null',
    'both-string',
    'both-aggregate',
    'work-undefined',
    'work-null',
    'work-string',
    'work-aggregate',
    'cleanup-undefined',
    'cleanup-null',
    'cleanup-string',
    'cleanup-aggregate',
  ] as const)
    test(`actual ${scope} caller preserves operation and cleanup: ${fault}`, async () => {
      const observed = await observeCompletion(scope, fault);
      expect(observed.targetReached).toBe(true);
      expect(observed.closeCalls).toBe(1);
      expect(observed.settledBeforeRelease).toBe(false);
      expect(observed.closed).toBe(true);
      expect(observed.marker).toBe('closed');
      if (fault === 'success') expect(observed.state).toBe('returned');
      else {
        expect(observed.state).toBe('rejected');
        expect(observed.restored).toBe(false);
        if (fault.startsWith('work-')) expect(observed.singlePrimarySame).toBe(true);
        else if (fault.startsWith('cleanup-')) expect(observed.singleCleanupSame).toBe(true);
        else
          expect(observed).toMatchObject({
            aggregate: true,
            members: 2,
            primarySame: true,
            cleanupSame: true,
            causeOwn: true,
            causeSame: true,
          });
      }
    });

for (const scope of ['open-readonly', 'open-deletion', 'open-recovery'])
  for (const fault of ['syntax', 'owner'])
    test(`actual ${scope} caller preserves ${fault} failure with cleanup failure`, async () => {
      const observed = await observeCompletion(scope, fault);
      expect(observed).toMatchObject({
        state: 'rejected',
        targetReached: true,
        closeCalls: 1,
        settledBeforeRelease: false,
        closed: true,
        marker: 'closed',
        aggregate: true,
        members: 2,
        cleanupSame: true,
        causeOwn: true,
        causeSame: true,
        restored: false,
      });
      expect(fault === 'syntax' ? observed.primarySyntax : observed.primaryOwner).toBe(true);
    });
