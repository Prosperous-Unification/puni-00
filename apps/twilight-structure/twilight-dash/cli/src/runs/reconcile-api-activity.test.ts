import { organizationId } from './record-codecs';
import { apiRecoveryContract } from './testing/api-recovery-contract';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';

apiRecoveryContract('memory API recovery', () => {
  const clock = new FixtureClock();
  return Promise.resolve({
    ...createMemoryStores({
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
    }),
    clock,
    reopen: () => Promise.resolve(),
  });
});
