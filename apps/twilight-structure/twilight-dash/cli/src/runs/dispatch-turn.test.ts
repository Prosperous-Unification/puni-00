import { organizationId } from './record-codecs';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { turnDispatchContract } from './testing/turn-dispatch-contract';

turnDispatchContract('memory turn dispatch', () => {
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
