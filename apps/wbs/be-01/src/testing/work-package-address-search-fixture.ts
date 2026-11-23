import { WorkPackageAddressSearch } from '@wbs/core/service/work-package-address-search';

import { nodeDigest } from '../runtime/bun-runtime';
/** Explicit refusal for composition tests that exercise unrelated services. */
export const refusingWorkPackageAddressSearch = new WorkPackageAddressSearch(
  {
    withSnapshot: () => Promise.resolve({ ok: false, refusal: 'no_active_organization' } as const),
  },
  nodeDigest,
);
