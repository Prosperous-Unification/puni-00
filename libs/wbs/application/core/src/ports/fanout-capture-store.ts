import type { FanoutObservation } from '../service/shared-people-fanout';
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

/** Current organization rank authority on the borrowed writer; no recovery grant or audit. */
export type BeforeRankMove = (
  organizationId: string,
  actorId: string,
) => Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: 'forbidden' }>;

/** Caller-addressed standalone directory act; access is supplied by the invocation. */
export type DirectoryWriteAddress =
  | {
      readonly kind: 'remove' | 'rename';
      readonly catalog: NamedCatalog;
      readonly resourceId: string;
      readonly access: ResourceAccess;
    }
  | {
      readonly kind: 'add';
      readonly catalog: NamedCatalog | 'externalSystems';
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

/** Detached before/after values read on the owning command transaction. */
export interface CapturedFanout {
  readonly observation: FanoutObservation;
  readonly localFacts: ReadonlyMap<string, string>;
}

/** Borrowed writer capture; project order is already the rank repository's authoritative order. */
export interface FanoutCaptureStore {
  capture(organizationId: string): Promise<CapturedFanout>;
  authorizeProjectUpdate: BeforeProjectUpdate;
  authorizeStepRemoval: BeforeStepRemoval;
  authorizeRankMove?: BeforeRankMove;
  resolveDirectoryWrite?: (address: DirectoryWriteAddress) => Promise<DirectoryWriteResolution>;
}
