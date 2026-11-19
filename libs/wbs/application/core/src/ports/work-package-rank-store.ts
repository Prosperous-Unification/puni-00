import type { Permission } from '@wbs/domain';
import type { CapacityMode } from '@wbs/domain';

import type { CommandCaller } from './command-access';
import type { RefusedOrganizationAccess } from './organization-access';
import type { WriteStamp } from './write-stamp';

/** One work package's place in its organization's work package rank (CONTEXT "Work package rank"). */
export interface RankedWorkPackage {
  readonly workPackageId: string;
  /** 1-based place in the total order. */
  readonly rank: number;
  /** Whether the work package holds a rank row; an unranked one follows every ranked one. */
  readonly ranked: boolean;
}

export type RankMoved =
  | { ok: true; order: RankedWorkPackage[] }
  | { ok: false; reason: 'not_found' | 'forbidden'; readonly permission?: Permission }
  | { ok: false; authority: RefusedOrganizationAccess };

/**
 * The organization's total order over its work packages
 * (`openspec/changes/share-people-across-work-packages`, spec `work-package-rank`).
 */
export interface WorkPackageRankStore {
  /**
   * Every work package the organization owns, in rank order: ranked ones by
   * position then work package id, then every unranked one by creation then id.
   */
  orderIn(organizationId: string): Promise<RankedWorkPackage[]>;
  /**
   * Places `workPackageId` directly after `afterWorkPackageId`, or first when that is
   * null, and answers the new order. Every work package of the organization is
   * ranked afterwards, in the order the move left them. A work package placed after
   * itself is a no-op answering the current order. `not_found`, writing
   * nothing, when either work package is not the organization's.
   */
  moveAfter(
    organizationId: string,
    workPackageId: string,
    afterWorkPackageId: string | null,
    stamp: WriteStamp,
    caller?: CommandCaller,
  ): Promise<RankMoved>;
}

/**
 * Whether an organization shares its people (CONTEXT "Shared people"): the
 * mode and its audited setter on the borrowed writer. Stored beside the rank
 * because both decide whose bookings a work package is scheduled around.
 */
export interface SharedPeopleStore {
  /**
   * The organization's stored mode.
   *
   * @throws when the organization is absent or its encoding is malformed:
   * every caller resolved it from a session a moment ago.
   */
  capacityModeIn(organizationId: string): Promise<CapacityMode>;
  /**
   * Sets the mode by `stamp.by` at `stamp.at` and, when that changes it,
   * records the switch under `auditId` in the same transaction. Setting the
   * mode an organization already has writes nothing and answers
   * `changed: false`.
   */
  setCapacityMode(
    organizationId: string,
    mode: CapacityMode,
    stamp: WriteStamp,
    auditId: string,
  ): Promise<{ changed: boolean }>;
}

export type CapacityModeSwitched =
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'forbidden'; readonly permission?: Permission }
  | { ok: false; authority: RefusedOrganizationAccess };

/**
 * The public capacity-mode owner: one complete write turn that re-checks the
 * authenticated caller and current manage_capacity_mode grants on the writer, sets and audits the
 * mode, and records one `elsewhere_changed` per work package of the organization
 * when it changed; delivery follows the turn.
 */
export interface CapacityModeSwitch {
  capacityModeIn(organizationId: string): Promise<CapacityMode>;
  switchCapacityMode(
    organizationId: string,
    mode: CapacityMode,
    stamp: WriteStamp,
    auditId: string,
    caller?: CommandCaller,
  ): Promise<CapacityModeSwitched>;
}
