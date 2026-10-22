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
   * `patchPerson` with `accountId` from a caller who is not an organization
   * admin or super-admin, or under legacy access, which has no organization.
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
  | 'provider_not_in_organization';

/**
 * What a directory write answered.
 *
 * The `taken` arm carries the **surviving** name — the one the row that already
 * holds it keeps. A bare `taken` would leave a caller who asked for a trimmed
 * name unable to say which of the two spellings is now on screen.
 */
export type DirectoryOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: DirectoryRefusal }
  | { ok: false; reason: 'taken'; name: string };
