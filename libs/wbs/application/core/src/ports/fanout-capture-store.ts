import type { FanoutObservation } from '../service/shared-people-fanout';
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
}
