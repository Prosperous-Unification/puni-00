import type { AuthenticatedUser } from '@wbs/contracts';
import type { Permission } from '@wbs/domain';

import type { AccessDecisions } from '../ports/access-decisions';
import type { Clock } from '../ports/clock';
import type { RefusedOrganizationAccess } from '../ports/organization-access';
import type { ResourceAccess } from '../ports/organization-access';
import type { ProjectList } from '../ports/project-list';
import type { ProjectRankStore, RankedProject } from '../ports/project-rank-store';
import { authorize } from './authorize';

/** One project in rank order, named as the caller's project list names it. */
export interface RankedProjectView extends RankedProject {
  readonly name: string;
}

export type ProjectRankRefusal = 'organization_required' | 'forbidden' | 'not_found';

export type ProjectRankOutcome<R extends ProjectRankRefusal = ProjectRankRefusal> =
  | { ok: true; projects: RankedProjectView[] }
  | { ok: false; refusal: R; readonly permission?: Permission }
  | { ok: false; authority: RefusedOrganizationAccess };

export interface ProjectRankResourceOptions {
  accessDecisions?: AccessDecisions;
  ranks: ProjectRankStore;
  projects: ProjectList;
  clock: Pick<Clock, 'stampFor'>;
}

/**
 * The organization's project rank (`share-people-across-projects`, spec
 * `project-rank`, ADR 0034).
 *
 * Rank moves require current organization.manage_spaces and create no
 * journal or undo entry. Under legacy access there is
 * no organization to order, so both reads answer `organization_required`.
 * Names come from the caller's own project list, so the answer names nothing
 * the project routes would not.
 */
export class ProjectRankResource {
  constructor(private readonly opts: ProjectRankResourceOptions) {}

  /**
   * Every project of the caller's organization in rank order.
   * @throws when trusted actor/scope/principal evidence disagrees, before any read.
   */
  async read(
    actorId: string,
    access: ResourceAccess,
  ): Promise<ProjectRankOutcome<'organization_required'>> {
    if (access.kind === 'legacy') return { ok: false, refusal: 'organization_required' };
    // Proof: rank-read-access-snapshot: retaining caller scoped-evidence aliases across an await.
    // retains direct rank read scoped evidence before its awaited dependency
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    access = structuredClone(access);
    // Proof: rank-read-scope-identity: omitting actor/member identity equality.
    // rejects direct rank read scope mismatch before grant and fact reads
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    // Proof: rank-read-principal-identity: omitting authenticated principal identity equality.
    // rejects direct rank read principal mismatch before grant and fact reads
    // throws before facts for a missing direct rank read grant principal
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    if (access.scope.userId !== actorId || access.principal.id !== actorId)
      throw new Error('rank resource authority differs from its actor');
    const order = await this.opts.ranks.orderIn(access.scope.organizationId);
    return { ok: true, projects: await this.named(order, actorId, access) };
  }

  /**
   * Moves `projectId` directly after `afterProjectId`, or first when that is
   * null. A foreign or absent project, on either side, is `not_found`.
   * @throws when trusted actor/scope/principal evidence disagrees before authority reads.
   */
  async move(
    actor: AuthenticatedUser,
    access: ResourceAccess,
    projectId: string,
    afterProjectId: string | null,
  ): Promise<ProjectRankOutcome> {
    if (access.kind === 'legacy') return { ok: false, refusal: 'organization_required' };
    // Proof: rank-move-actor-snapshot: retaining complete actor aliases across the grant await.
    // retains direct rank move actor id before awaited grant evaluation
    // retains direct rank move actor authentication before awaited grant evaluation
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    // Proof: rank-move-actor-auth-deep: shallow actor copying retains verifier metadata aliases.
    // retains direct rank move actor authentication before awaited grant evaluation
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    actor = structuredClone(actor);
    const actorId = actor.id;
    // Proof: rank-move-access-snapshot: retaining caller scoped-evidence aliases across an await.
    // retains direct rank move scoped evidence before its awaited dependency
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    // Proof: rank-move-access-auth-deep: shallow scope copying retains nested authentication aliases.
    // retains direct rank move access authentication before awaited grant evaluation
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    access = structuredClone(access);
    // Proof: rank-move-scope-identity: omitting actor/member identity equality.
    // rejects direct rank move scope mismatch before grant and fact reads
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    // Proof: rank-move-principal-identity: omitting authenticated principal identity equality.
    // rejects direct rank move principal mismatch before grant and fact reads
    // throws before facts for a missing direct rank move grant principal
    // Named RED with this fault; restored GREEN (task-2.4b rank/mode receipt).
    if (access.scope.userId !== actorId || access.principal.id !== actorId)
      throw new Error('rank resource authority differs from its actor');
    const decision = await authorize(
      this.opts.accessDecisions,
      access.principal,
      { kind: 'organization', organizationId: access.scope.organizationId },
      'organization.manage_spaces',
    );
    // Proof: rank-public-grant fault failed 'refuses public rank authority before a broken' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
    if (!decision.ok)
      return { ok: false, refusal: 'forbidden', permission: 'organization.manage_spaces' };
    const moved = await this.opts.ranks.moveAfter(
      access.scope.organizationId,
      projectId,
      afterProjectId,
      this.opts.clock.stampFor(actorId),
      { kind: 'human', principal: actor, expectedAccess: access },
    );
    if (!moved.ok && 'authority' in moved) return moved;
    if (!moved.ok)
      return {
        ok: false,
        refusal: moved.reason,
        ...(moved.permission === undefined ? {} : { permission: moved.permission }),
      };
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
