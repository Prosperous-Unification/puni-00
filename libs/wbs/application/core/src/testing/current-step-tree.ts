import { expect } from 'bun:test';

import type { Source } from '../ports/source';
import type { WorkItemStore } from '../ports/work-item-store';
import { expectClaimFailure } from './current-claim-observation';

/** A display read cannot retain authority after its ordinary or repair owner settles. */
export async function assertTreeLoanExpiry(
  source: Source,
  workPackageId: string,
  settlement: 'commit' | 'rollback' | 'repair',
) {
  let retained: WorkItemStore | undefined;
  const capture = async (stores: WorkItemStore) => {
    retained = stores;
    expect((await stores.listTreeByWorkPackage(workPackageId)).length).toBeGreaterThan(0);
  };
  await source.uow.run(async ({ stores }) => {
    if (settlement !== 'repair') await capture(stores.workItems);
    return settlement === 'commit'
      ? { commit: true, value: undefined }
      : {
          commit: false,
          value: undefined,
          ...(settlement === 'repair'
            ? { afterRollback: async ({ stores: repair }) => capture(repair.workItems) }
            : {}),
        };
  });
  if (retained === undefined) throw new Error('tree loan was not captured');
  const rows = retained;
  for (const id of [workPackageId, 'tree-missing-package'])
    await expectClaimFailure(() => rows.listTreeByWorkPackage(id), 'closed');
  await source.uow.run(async ({ stores }) => {
    expect((await stores.workItems.listTreeByWorkPackage(workPackageId)).length).toBeGreaterThan(0);
    await expectClaimFailure(() => rows.listTreeByWorkPackage(workPackageId), 'closed');
    return { commit: true, value: undefined };
  });
}
