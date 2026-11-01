import { organizationId } from '../runs/record-codecs';
import { FixtureClock } from '../runs/testing/fixtures';
import { createMemoryStores } from '../runs/testing/memory-stores';
import { runCoordinatorContract } from '../runs/testing/run-coordinator-contract';

runCoordinatorContract('memory coordination', () => {
  const clock = new FixtureClock();
  return Promise.resolve({
    ...createMemoryStores({
      capacity: 1,
      leaseMilliseconds: 100,
      organizationId: organizationId('organization'),
      clock,
    }),
    clock,
  });
});
