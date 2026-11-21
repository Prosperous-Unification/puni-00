import type { ResolvedStep } from '@wbs/domain';

import type {
  OrganizationPrincipal,
  RefusedOrganizationAccess,
  ResourceAccess,
} from './organization-access';

export interface AddressWorkPackage {
  readonly workPackageId: string;
  readonly abbreviation: string;
  readonly name: string;
}
export interface AddressPlacement {
  readonly id: string;
  readonly parentId: string | null;
  readonly position: number;
  readonly frozenNumber: string | null;
  readonly name: string;
  /** Current leaves always carry their own ordered list, including an explicit empty list. */
  readonly steps?: readonly ResolvedStep[];
}
export interface AddressStep {
  readonly id: string;
  readonly code: string | null;
  readonly name: string;
  readonly position: number;
}
export interface CapturedWorkPackageAddresses {
  readonly workPackage: AddressWorkPackage;
  readonly placements: readonly AddressPlacement[];
  readonly steps: readonly AddressStep[];
}
/** A callback-scoped reader. Methods throw after the owning snapshot closes. */
export interface WorkPackageAddressSnapshot {
  readonly access: ResourceAccess;
  /** A scoped SQL superset in deterministic key order; callers apply exact Unicode matching. */
  searchWorkPackages(
    search: string,
    after: AddressWorkPackageKey | null,
    limit: number,
  ): readonly AddressWorkPackage[];
  capture(workPackageId: string): CapturedWorkPackageAddresses | null;
}
export interface AddressWorkPackageKey {
  readonly abbreviation: string;
  readonly workPackageId: string;
}
/** Owns authorization and detached lookup facts in one read-only transaction. */
export interface WorkPackageAddressSearchStore {
  withSnapshot<T>(
    principal: OrganizationPrincipal,
    read: (snapshot: WorkPackageAddressSnapshot) => T | Promise<T>,
  ): Promise<{ readonly ok: true; readonly value: T } | RefusedOrganizationAccess>;
}
