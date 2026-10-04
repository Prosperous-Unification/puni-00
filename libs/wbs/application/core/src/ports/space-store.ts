import type { WriteStamp } from './write-stamp';

/**
 * An organization-owned, named lens over an ordered set of its projects
 * (ADR 0033). It owns nothing: deleting it changes no project.
 *
 * `revision` counts every write to the space or its membership, so a reader
 * holding an older revision knows its rows are stale.
 */
export interface Space {
  id: string;
  organizationId: string;
  name: string;
  revision: number;
  /** The author, from the `created_by` audit column. */
  createdBy: string;
  createdAt: number;
}

/** One project's place in one space. */
export interface SpaceMember {
  projectId: string;
  position: number;
}

/**
 * A space write's decision.
 *
 * `not_found` covers an absent space and another organization's space alike,
 * so the caller cannot learn a foreign space exists. `name_taken` means the
 * organization already holds a space of that name, and nothing was written.
 */
export type SpaceWritten =
  { ok: true; space: Space } | { ok: false; reason: 'not_found' | 'name_taken' };

/**
 * A membership write's decision: the member's position, or why nothing was
 * written. `not_found` covers the space, a project the organization does not
 * own, and an `afterProjectId` that is not a member.
 */
export type MembershipWritten =
  { ok: true; position: number } | { ok: false; reason: 'not_found' | 'already_in_space' };

/**
 * An organization's spaces and their membership (`add-spaces`, design D2).
 *
 * **Every method is scoped by `organizationId` in its query**, which is what
 * makes a foreign space answer `not_found` a property of the read rather than
 * of a caller remembering to compare. The store knows nothing of access, roles
 * or which projects a caller may open; those belong to the resource, which
 * filters members through the project routes' own predicate.
 *
 * Refusals are typed answers, never thrown constraint errors. A thrown error
 * is a fault: an unknown organization, or storage failing.
 */
export interface SpaceStore {
  /**
   * The organization marked legacy, which owns every named space under legacy
   * access (design memo §2, spec `space-authorization`); null when none
   * exists, which the resource answers `409 organization_required`.
   */
  legacyOrganizationId(): Promise<string | null>;
  /** The organization's spaces, ordered by `(name, id)`. */
  listIn(organizationId: string): Promise<Space[]>;
  findIn(organizationId: string, spaceId: string): Promise<Space | null>;
  /** Stores a new space at revision 0 authored by `stamp.by`. */
  create(
    space: Pick<Space, 'id' | 'organizationId' | 'name'>,
    stamp: WriteStamp,
  ): Promise<SpaceWritten>;
  rename(
    organizationId: string,
    spaceId: string,
    name: string,
    stamp: WriteStamp,
  ): Promise<SpaceWritten>;
  /** Deletes the space and its membership; no project changes. False when absent. */
  remove(organizationId: string, spaceId: string): Promise<boolean>;
  /**
   * The members in display order: `position`, ties by `projectId` (ADR 0016's
   * rule, so two reads of unchanged rows agree). Null when the space is absent.
   */
  membersOf(organizationId: string, spaceId: string): Promise<SpaceMember[] | null>;
  /**
   * Every space's members in the organization, in {@link membersOf}'s order,
   * in one read: the space list counts them without one read per space. A
   * space with no member is absent from the map.
   */
  membersIn(organizationId: string): Promise<Map<string, SpaceMember[]>>;
  /**
   * Adds a project the organization owns after `afterProjectId`, or first on
   * null, by `placeAfter`; a respace rewrites the group in the same write.
   */
  addProject(
    organizationId: string,
    spaceId: string,
    projectId: string,
    afterProjectId: string | null,
    stamp: WriteStamp,
  ): Promise<MembershipWritten>;
  /** False when the space or the member is absent. */
  removeProject(
    organizationId: string,
    spaceId: string,
    projectId: string,
    stamp: WriteStamp,
  ): Promise<boolean>;
  /** Moves a member after `afterProjectId`, or first on null. */
  moveProject(
    organizationId: string,
    spaceId: string,
    projectId: string,
    afterProjectId: string | null,
    stamp: WriteStamp,
  ): Promise<MembershipWritten>;
}
