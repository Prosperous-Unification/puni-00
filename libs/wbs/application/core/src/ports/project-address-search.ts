import type {
  OrganizationPrincipal,
  RefusedOrganizationAccess,
  ResourceAccess,
} from './organization-access';

export interface AddressProject {
  readonly projectId: string;
  readonly abbreviation: string;
  readonly name: string;
}
export interface AddressPlacement {
  readonly id: string;
  readonly parentId: string | null;
  readonly position: number;
  readonly frozenNumber: string | null;
  readonly name: string;
}
export interface AddressStep {
  readonly id: string;
  readonly code: string | null;
  readonly name: string;
  readonly position: number;
}
export interface CapturedProjectAddresses {
  readonly project: AddressProject;
  readonly placements: readonly AddressPlacement[];
  readonly steps: readonly AddressStep[];
}
/** A callback-scoped reader. Methods throw after the owning snapshot closes. */
export interface ProjectAddressSnapshot {
  readonly access: ResourceAccess;
  /** A scoped SQL superset in deterministic key order; callers apply exact Unicode matching. */
  searchProjects(
    search: string,
    after: AddressProjectKey | null,
    limit: number,
  ): readonly AddressProject[];
  capture(projectId: string): CapturedProjectAddresses | null;
}
export interface AddressProjectKey {
  readonly abbreviation: string;
  readonly projectId: string;
}
/** Owns authorization and detached lookup facts in one read-only transaction. */
export interface ProjectAddressSearchStore {
  withSnapshot<T>(
    principal: OrganizationPrincipal,
    read: (snapshot: ProjectAddressSnapshot) => T | Promise<T>,
  ): Promise<{ readonly ok: true; readonly value: T } | RefusedOrganizationAccess>;
}
