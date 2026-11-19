import type { WriteStamp } from './write-stamp';

/** How many of one team may be at work at once on one work package's plan. */
export interface TeamCapacity {
  serviceTeamId: string;
  /** At least 1. There is no `null` here: unstated is the absence of an entry. */
  size: number;
}

/**
 * What a capacity write decided. `not_found` is a work package or a team nothing
 * holds, and it is decided by reading both inside the write's own transaction
 * rather than in front of it.
 */
export type CapacityWritten = { ok: true } | { ok: false; reason: 'not_found' };

/**
 * How many of each team may be at work at once, per work package.
 *
 * This is C1's `slotsOf` seam with the lookup behind it at last, and the reason
 * it is a store of its own rather than four methods on {@link DirectoryStore}:
 * the fact is a **work package's**, not the directory's, and the directory store is
 * the thing the global list is read through. See
 * `openspec/changes/capacity-per-work-package/design.md` D3 and D6.
 *
 * There is deliberately no read of `serviceTeam.size` anywhere in here. A pair
 * with no row is _unstated_ and constrains nothing — Dany's call, 2026-08-13,
 * and the whole of D1.
 */
export interface CapacityStore {
  /**
   * The slots this work package may take of each team it has stated a number for —
   * keyed on the team alone, because one call is one work package.
   *
   * A team the work package has stated nothing about is **absent from the map**, not
   * present as `null` or as `Infinity`: the engine reads an absent key as
   * unconstrained, which is exactly what unstated means.
   */
  slotsFor(workPackageId: string): Promise<Map<string, number>>;
  /** The same fact in the shape the payload carries, in team-id order. */
  listFor(workPackageId: string): Promise<TeamCapacity[]>;
  /**
   * Sets this work package's capacity for one team, or clears it on `null`.
   *
   * `null` **deletes the row**, because unstated has one spelling and it is the
   * absence of one. A stored null would be a second, and every reader would
   * then have to handle both — `schema.ts` has the argument on the column.
   */
  set(
    workPackageId: string,
    serviceTeamId: string,
    size: number | null,
    stamp: WriteStamp,
  ): Promise<CapacityWritten>;
}
