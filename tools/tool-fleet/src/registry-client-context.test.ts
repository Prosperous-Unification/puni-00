import { expect, test } from 'bun:test';

import { assertRegistryClientProc } from './registry-client-context';
import { requireRejection } from './registry-rejection.fixture';

test('client proc admission refuses a procfs from the outside PID namespace', async () => {
  const refused = await requireRejection(assertRegistryClientProc());
  expect(refused.throwCause).toThrow('private PID namespace');
});
