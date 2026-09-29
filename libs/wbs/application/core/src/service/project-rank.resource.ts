import type { Clock } from '../ports/clock';
import type { ResourceAccess } from '../ports/organization-access';
import type { ProjectRankStore, RankedProject } from '../ports/project-rank-store';
import type { ProjectService } from './project.service';

/** One project in rank order, named as the caller's project list names it. */
export interface RankedProjectView extends RankedProject {
  readonly name: string;
}

export type ProjectRankRefusal = 'organization_required' | 'forbidden' | 'not_found';

export type ProjectRankOutcome<R extends ProjectRankRefusal = ProjectRankRefusal> =
  { ok: true; projects: RankedProjectView[] } | { ok: false; refusal: R };

export interface ProjectRankResourceOptions {
  ranks: ProjectRankStore;
  projects: Pick<ProjectService, 'listWithin'>;
  clock: Pick<Clock, 'stampFor'>;
}

/**
 * The organization's project rank (`share-people-across-projects`, spec
 * `project-rank`, ADR 0034).
 *
 * A rank is an organization act, not a plan edit: admins and super-admins move
 * it through a route, with no journal and no undo. Under legacy access there is
 * no organization to order, so both reads answer `organization_required`.
 * Names come from the caller's own project list, so the answer names nothing
 * the project routes would not.
 */
export class ProjectRankResource {
  constructor(private readonly opts: ProjectRankResourceOptions) {}

  /** Every project of the caller's organization in rank order. */
  async read(
    actorId: string,
    access: ResourceAccess,
  ): Promise<ProjectRankOutcome<'organization_required'>> {
    if (access.kind === 'legacy') return { ok: false, refusal: 'organization_required' };
    const order = await this.opts.ranks.orderIn(access.scope.organizationId);
    return { ok: true, projects: await this.named(order, actorId, access) };
  }

  /**
   * Moves `projectId` directly after `afterProjectId`, or first when that is
   * null. A foreign or absent project, on either side, is `not_found`.
   *
   * Proof: the role check removed made `refuses a member and a viewer the
   * move, changing nothing` in `project-rank.controller.db.test.ts` answer
   * 200 instead of 403; watched 2026-09-29.
   */
  async move(
    actorId: string,
    access: ResourceAccess,
    projectId: string,
    afterProjectId: string | null,
  ): Promise<ProjectRankOutcome> {
    if (access.kind === 'legacy') return { ok: false, refusal: 'organization_required' };
    const { role } = access.scope;
    if (role !== 'admin' && role !== 'super_admin') return { ok: false, refusal: 'forbidden' };
    const moved = await this.opts.ranks.moveAfter(
      access.scope.organizationId,
      projectId,
      afterProjectId,
      this.opts.clock.stampFor(actorId),
    );
    if (!moved.ok) return { ok: false, refusal: moved.reason };
    return { ok: true, projects: await this.named(moved.order, actorId, access) };
  }

  /**
   * The order, named by the caller's project list and limited to it. The two
   * read the same organization, so today they hold the same projects; a
   * project the list does not hold is left out rather than named.
   *
   * The ranks are passed through as the store numbered them, which is only
   * sound while nothing is left out. A future visibility filter that drops a
   * project here must renumber what remains: a gap in the ranks would reveal
   * that a hidden project sits there.
   */
  private async named(
    order: readonly RankedProject[],
    actorId: string,
    access: ResourceAccess,
  ): Promise<RankedProjectView[]> {
    const names = new Map(
      (await this.opts.projects.listWithin(actorId, access)).map(
        (project) => [project.id, project.name] as const,
      ),
    );
    return order.flatMap((each) => {
      const name = names.get(each.projectId);
      return name === undefined ? [] : [{ ...each, name }];
    });
  }
}
