import { ProjectAddressSearch } from '@wbs/core/service/project-address-search';

import { nodeDigest } from '../runtime/bun-runtime';
/** Explicit refusal for composition tests that exercise unrelated services. */
export const refusingProjectAddressSearch = new ProjectAddressSearch(
  {
    withSnapshot: () => Promise.resolve({ ok: false, refusal: 'no_active_organization' } as const),
  },
  nodeDigest,
);
