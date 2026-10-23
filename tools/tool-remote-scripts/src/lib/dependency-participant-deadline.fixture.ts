import { scratchSync } from '@tools/test-scratch';
import { mock } from 'bun:test';

import { topologyFixture } from './dependency-topology.fixture';
import { envLayout } from './env';

const backend = await import('./backend-exclusion');
let retainedDeadline: number | undefined;
void mock.module(import.meta.resolve('./backend-exclusion'), () => ({
  ...backend,
  inspectBackendFenceUnderLock: (_layout: unknown, _runner: unknown, deadline: unknown) => {
    if (
      typeof deadline !== 'number' ||
      deadline <= performance.now() ||
      deadline > performance.now() + 60000 ||
      (retainedDeadline !== undefined && deadline !== retainedDeadline)
    )
      throw new Error('production retained inspector lost shared observation deadline');
    retainedDeadline = deadline;
    return Promise.resolve({ retained: true });
  },
}));
const { inspectDependencyParticipants } = await import('./dependency-participants');
const host = topologyFixture();
const observed = await inspectDependencyParticipants(
  { ...envLayout('prod'), stateDir: scratchSync('participant-deadline-') },
  host.runner,
);
console.log(observed.activation);
console.log('production shared deadline verified');
