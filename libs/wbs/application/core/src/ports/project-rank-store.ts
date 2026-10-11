import type { CapacityMode } from '@wbs/domain';

import type { WriteStamp } from './write-stamp';

/** One project's place in its organization's project rank (CONTEXT "Project rank"). */
export interface RankedProject {
  readonly projectId: string;
  /** 1-based place in the total order. */
  readonly rank: number;
  /** Whether the project holds a rank row; an unranked one follows every ranked one. */
  readonly ranked: boolean;
}

export type RankMoved =
  { ok: true; order: RankedProject[] } | { ok: false; reason: 'not_found' | 'forbidden' };

/**
 * The organization's total order over its projects
 * (`openspec/changes/share-people-across-projects`, spec `project-rank`).
 */
export interface ProjectRankStore {
  /**
   * Every project the organization owns, in rank order: ranked ones by
   * position then project id, then every unranked one by creation then id.
   */
  orderIn(organizationId: string): Promise<RankedProject[]>;
  /**
   * Places `projectId` directly after `afterProjectId`, or first when that is
   * null, and answers the new order. Every project of the organization is
   * ranked afterwards, in the order the move left them. A project placed after
   * itself is a no-op answering the current order. `not_found`, writing
   * nothing, when either project is not the organization's.
   */
  moveAfter(
    organizationId: string,
    projectId: string,
    afterProjectId: string | null,
    stamp: WriteStamp,
  ): Promise<RankMoved>;
}

/**
 * Whether an organization shares its people (CONTEXT "Shared people"): the
 * mode and its audited setter on the borrowed writer. Stored beside the rank
 * because both decide whose bookings a project is scheduled around.
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
  { ok: true; changed: boolean } | { ok: false; reason: 'forbidden' };

/**
 * The public capacity-mode owner: one complete write turn that re-checks the
 * actor's current super-admin membership on the writer, sets and audits the
 * mode, and records one `elsewhere_changed` per project of the organization
 * when it changed; delivery follows the turn.
 */
export interface CapacityModeSwitch {
  capacityModeIn(organizationId: string): Promise<CapacityMode>;
  switchCapacityMode(
    organizationId: string,
    mode: CapacityMode,
    stamp: WriteStamp,
    auditId: string,
  ): Promise<CapacityModeSwitched>;
}
