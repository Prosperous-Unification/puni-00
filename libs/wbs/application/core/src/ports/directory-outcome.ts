import type { LimitCrossed, Permission } from '@wbs/domain';

/**
 * Why a directory write was refused. Every one is a state of the directory or
 * of the request, never a fault: the controller turns each into a 4xx.
 *
 * `nothing_to_change` is a patch naming neither a name nor memberships, and
 * neither a name nor owned services on a team. Accepting it as a no-op would
 * answer 200 to a request that was almost certainly a client bug, and leave
 * nothing on the wire to notice it by.
 *
 * `unknown_service` is an ownership map naming a service the directory does not
 * hold — `unknown_team`'s twin, one dimension over.
 */
export type DirectoryRefusal =
  /**
   * A scoped write lacks organization.manage_directory, or a legacy binding
   * request has no organization. Named permission denials retain permission.
   */
  | 'forbidden'
  | 'invalid_kind'
  | 'name_required'
  | 'not_found'
  | 'nothing_to_change'
  | 'unknown_service'
  | 'unknown_team'
  /** `accountId` naming no account, or one that is not a member of the person's organization. */
  | 'unknown_account'
  /** `patchResource.providerId` naming no provider instance (`compute-providers` P3). */
  | 'unknown_provider'
  /** `patchResource.providerId` naming another organization's provider instance. */
  | 'provider_not_in_organization'
  /** `setDirectoryCapacity` on a resource no organization owns (`wbs-shared-occupancy` S2). */
  | 'organization_required';

/**
 * What a directory write answered.
 *
 * The `taken` arm carries the **surviving** name — the one the row that already
 * holds it keeps. A bare `taken` would leave a caller who asked for a trimmed
 * name unable to say which of the two spellings is now on screen.
 */
export type DirectoryOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: DirectoryRefusal; readonly permission?: Permission }
  | { ok: false; reason: 'taken'; name: string }
  /**
   * One more agent person than the organization's cap allows
   * (`wbs-organization-limits` L9): the cap, what it held and what the write
   * would have added, read inside the write's transaction.
   */
  | ({ ok: false; reason: 'agent_person_limit' } & LimitCrossed);
