import { organizationId } from './record-codecs';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { recoveryDispatchContract } from './testing/recovery-dispatch-contract';

recoveryDispatchContract('memory', async () => {
  const clock = new FixtureClock();
  return await Promise.resolve({
    ...createMemoryStores({
      organizationId: organizationId('org-a'),
      capacity: 1,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
  });
});
