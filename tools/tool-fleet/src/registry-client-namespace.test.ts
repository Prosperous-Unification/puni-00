import { expect, test } from 'bun:test';

import {
  prepareRegistryClientNamespace,
  type RegistryClientNamespaceInput,
} from './registry-client-namespace';
import { requireRejection } from './registry-rejection.fixture';
test('client namespace bootstrap refuses outside its bounded private root worker before mount effects', async () => {
  const refused = await requireRejection(
    prepareRegistryClientNamespace(
      {} as RegistryClientNamespaceInput,
      new AbortController().signal,
    ),
  );
  expect(refused.throwCause).toThrow();
});
