import { expect, test } from 'bun:test';

import { createRegistryClientExecutor } from './registry-client-pull';
import { requireRejection } from './registry-rejection.fixture';

test('client executor refuses outside its owned root namespace before profile effects', async () => {
  const refused = await requireRejection(
    createRegistryClientExecutor({}, new AbortController().signal),
  );
  expect(refused.throwCause).toThrow('requires an owned root namespace worker');
});
