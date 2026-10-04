import type { WriteStamp } from './write-stamp';

/** One project's place in its organization's project rank (CONTEXT "Project rank"). */
export interface RankedProject {
  readonly projectId: string;
  /** 1-based place in the total order. */
  readonly rank: number;
  /** Whether the project holds a rank row; an unranked one follows every ranked one. */
  readonly ranked: boolean;
}

export type RankMoved = { ok: true; order: RankedProject[] } | { ok: false; reason: 'not_found' };

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
