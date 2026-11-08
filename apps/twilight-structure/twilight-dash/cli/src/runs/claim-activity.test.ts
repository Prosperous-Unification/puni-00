import { organizationId } from './record-codecs';
import { claimDispatchContract } from './testing/claim-dispatch-contract';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';

claimDispatchContract('memory claim dispatch', () => {
  const clock = new FixtureClock();
  return Promise.resolve({
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  });
});
