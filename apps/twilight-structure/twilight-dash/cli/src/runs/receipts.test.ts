import { organizationId } from './record-codecs';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { receiptsContract } from './testing/receipts-contract';
receiptsContract('memory receipts', async () => {
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
