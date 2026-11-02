import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { writeRecoveryContract } from './testing/write-recovery-contract';
import { organizationId } from './value-codecs';
writeRecoveryContract('memory write recovery', () => {
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
