import type { CapacityModeSwitch, WorkPackageRankStore } from '@wbs/core';

const unused = (): Promise<never> =>
  Promise.reject(
    new Error('this composition holds no work package rank; use the organization harness'),
  );

/** Inert work package rank and capacity-mode store for app compositions whose subject is neither. */
export const refusingWorkPackageRanks: WorkPackageRankStore & CapacityModeSwitch = {
  orderIn: unused,
  moveAfter: unused,
  capacityModeIn: unused,
  switchCapacityMode: unused,
};
