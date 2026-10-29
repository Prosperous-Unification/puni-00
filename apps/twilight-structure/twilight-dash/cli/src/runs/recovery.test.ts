import { organizationId } from './record-codecs';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { recoveryContract } from './testing/recovery-contract';

recoveryContract('memory recovery', async () => {
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
