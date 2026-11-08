import { organizationId } from './record-codecs';
import { authorityDispatchContract } from './testing/authority-dispatch-contract';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';

authorityDispatchContract('memory authority dispatch', async () => {
  const clock = new FixtureClock();
  return await Promise.resolve({
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  });
});
