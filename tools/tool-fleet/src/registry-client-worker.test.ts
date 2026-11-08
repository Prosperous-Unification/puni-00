import { expect, test } from 'bun:test';

import { runRegistryClientWorkerMain } from './registry-client-worker-cli';
import { requireRejection } from './registry-rejection.fixture';

test('fixed client worker refuses outside its owned root namespace before reading installation or input', async () => {
  const refused = await requireRejection(runRegistryClientWorkerMain());
  expect(refused.throwCause).toThrow('owned root namespace worker');
});
