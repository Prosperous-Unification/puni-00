import { organizationId } from './record-codecs';
import { FixtureClock } from './testing/fixtures';
import { createMemoryStores } from './testing/memory-stores';
import { signalsContract } from './testing/signals-contract';
signalsContract('memory decisions', async () => {
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
import { verifiedSignalsContract } from './testing/verified-signals-contract';
verifiedSignalsContract('memory verified signals', async () => {
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
import { signalEdgeContract } from './testing/signal-edge-contract';
signalEdgeContract('memory signal edges', async () => {
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
