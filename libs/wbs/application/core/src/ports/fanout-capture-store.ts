import type { DependencyFanout, FanoutObservation } from '../service/shared-people-fanout';
import type { NamedCatalog } from './directory-store';
import type { ResourceAccess } from './organization-access';

export type FanoutWriteAuthority =
  { readonly ok: true } | { readonly ok: false; readonly reason: 'not_found' | 'forbidden' };

/** Read-only fresh project-write authority on the borrowed writer, before observation. */
export type BeforeProjectUpdate = (
  projectId: string,
  actorId: string,
  access: ResourceAccess,
) => Promise<FanoutWriteAuthority>;

/** Existing scoped recovery admission stays live while step preflights ask for observation. */
export type BeforeStepRemoval = (
  projectId: string,
  actorId: string,
  access: ResourceAccess,
) => Promise<FanoutWriteAuthority>;

/** Scoped add/rename observation after service authority, name and graph preflights. */
export type BeforeStepWrite = (
  projectId: string,
  actorId: string,
  access: ResourceAccess,
) => Promise<FanoutWriteAuthority>;

/** Current organization rank authority on the borrowed writer; no recovery grant or audit. */
export type BeforeRankMove = (
  organizationId: string,
  actorId: string,
) => Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: 'forbidden' }>;

/** Current organization super-admin authority on the borrowed writer; no delegation, no audit. */
export type BeforeModeSwitch = (
  organizationId: string,
  actorId: string,
) => Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: 'forbidden' }>;

/** Fresh import write-role admission on the borrowed writer, before observation. */
export type BeforeImport = (
  actorId: string,
  access: ResourceAccess,
) => Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: 'forbidden' }>;

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

/** Trusted project ownership read inside the lifecycle writer, without human admission. */
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

/** Borrowed writer capture; project order is already the rank repository's authoritative order. */
export interface FanoutCaptureStore {
  capture(organizationId: string): Promise<CapturedFanout>;
  resolveLifecycleOwner?: (projectId: string) => Promise<LifecycleOwnership>;
  authorizeProjectUpdate: BeforeProjectUpdate;
  authorizeStepRemoval: BeforeStepRemoval;
  authorizeRankMove?: BeforeRankMove;
  authorizeModeSwitch?: BeforeModeSwitch;
  authorizeImport?: BeforeImport;
  resolveDirectoryWrite?: (address: DirectoryWriteAddress) => Promise<DirectoryWriteResolution>;
}
