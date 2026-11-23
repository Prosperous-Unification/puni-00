import type { CredentialAuthentication } from '@wbs/contracts';
import type { Permission } from '@wbs/domain';
import type { OrganizationScope } from '@wbs/domain';

import type { DependencyFanout, FanoutObservation } from '../service/shared-people-fanout';
import type { AccessTarget } from './access-decisions';
import type { NamedCatalog } from './directory-store';
import type { ResourceAccess } from './organization-access';
import type { WorkPackagePatch } from './work-package-store';

export type FanoutWriteAuthority =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'not_found' | 'forbidden';
      readonly permission?: Permission;
    };

/**
 * Fresh read-only admission applies detached verifier metadata to the current role
 * before work package classification, without recovery audit. Explicit undefined preserves
 * existing direct-context callers without credential metadata.
 */
export type ResolveWorkPackageWriteScope = (
  workPackageId: string,
  organizationId: string,
  actorId: string,
  authentication: CredentialAuthentication | undefined,
) => Promise<
  | { readonly ok: true; readonly scope: OrganizationScope }
  | {
      readonly ok: false;
      readonly reason: 'not_found' | 'forbidden';
      readonly permission?: Permission;
    }
>;

/** Read-only fresh work-package-write authority on the borrowed writer, before observation. */
export type BeforeWorkPackageUpdate = (
  workPackageId: string,
  actorId: string,
  access: ResourceAccess,
  patch: WorkPackagePatch,
) => Promise<FanoutWriteAuthority>;

/** Existing scoped recovery admission stays live while step preflights ask for observation. */
export type BeforeStepRemoval = (
  workPackageId: string,
  actorId: string,
  access: ResourceAccess,
) => Promise<FanoutWriteAuthority>;

/** Scoped add/rename observation after service authority, name and graph preflights. */
export type BeforeStepWrite = (
  workPackageId: string,
  actorId: string,
  access: ResourceAccess,
) => Promise<FanoutWriteAuthority>;

/** Fresh import write-role admission on the borrowed writer, before observation. */
export type BeforeImport = (
  actorId: string,
  access: ResourceAccess,
  project: Extract<AccessTarget, { readonly kind: 'project' }>,
) => Promise<
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'not_found' }
  | { readonly ok: false; readonly reason: 'forbidden'; readonly permission?: Permission }
>;

/**
 * The catalogs a standalone directory act may address. Resources are written
 * only inside a command batch (`wbs-resources`), so no standalone act names one.
 */
type StandaloneCatalog = Exclude<NamedCatalog, 'resources'>;

/** Caller-addressed standalone directory act; access is supplied by the invocation. */
export type DirectoryWriteAddress =
  | {
      readonly kind: 'remove' | 'rename';
      readonly catalog: StandaloneCatalog;
      readonly resourceId: string;
      readonly access: ResourceAccess;
    }
  | {
      readonly kind: 'add';
      readonly catalog: StandaloneCatalog | 'externalSystems';
      readonly access: ResourceAccess;
    }
  | {
      readonly kind: 'patch-team';
      readonly teamId: string;
      readonly serviceIds?: readonly string[];
      readonly access: ResourceAccess;
    }
  | {
      readonly kind: 'add-person';
      readonly teamIds: readonly string[];
      readonly access: ResourceAccess;
    }
  | {
      readonly kind: 'patch-person';
      readonly personId: string;
      readonly teamIds?: readonly string[];
      readonly access: ResourceAccess;
    };

export type DirectoryWriteResolution =
  | { readonly ok: true; readonly organizationIds: readonly string[] }
  | { readonly ok: false; readonly reason: 'not_found' | 'unknown_team' | 'unknown_service' };

/** Trusted work package ownership read inside the lifecycle writer, without human admission. */
export type LifecycleOwnership =
  | { readonly kind: 'absent' }
  | { readonly kind: 'legacy' }
  | { readonly kind: 'scoped'; readonly organizationId: string };

/** Detached before/after values read on the owning command transaction. */
export interface CapturedFanout {
  readonly observation: FanoutObservation;
  /** External components, including shared-person bridges; ordinary shared components remain in observation. */
  readonly dependency: DependencyFanout | null;
  readonly localFacts: ReadonlyMap<string, string>;
}

/** Borrowed writer capture; work package order is already the rank repository's authoritative order. */
export interface FanoutCaptureStore {
  /** Optional for legacy fixtures; runtime observation requires this fresh authority capability. */
  resolveWorkPackageWriteScope?: ResolveWorkPackageWriteScope;
  capture(organizationId: string): Promise<CapturedFanout>;
  resolveLifecycleOwner?: (workPackageId: string) => Promise<LifecycleOwnership>;
  authorizeWorkPackageUpdate: BeforeWorkPackageUpdate;
  authorizeStepRemoval: BeforeStepRemoval;
  authorizeImport?: BeforeImport;
  resolveDirectoryWrite?: (address: DirectoryWriteAddress) => Promise<DirectoryWriteResolution>;
}
