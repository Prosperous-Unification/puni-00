import type { PriorityBand } from '@wbs/domain';

import type { CalendarMarker } from '../../ports/calendar-marker-store';
import type { ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { NewProject } from '../../ports/project-values';
import type { Step } from '../../ports/step-store';
import type { SubtreeCopy } from '../../ports/subtree-store';
import type { StoredTypedDependency } from '../../ports/typed-dependency-store';
import type { Scope, UnitOfWork } from '../../ports/unit-of-work';
import type { WorkItemPatch } from '../../ports/work-item-store';
import type { WriteStamp } from '../../ports/write-stamp';
import type { DirectoryService } from '../directory/directory.resource';
import type { WorkItemService } from '../work-item/work-item.resource';

/** The Directory and Work item resources one import reconciles and announces through. */
export interface ImportServices {
  directory: DirectoryService;
  workItems: Pick<WorkItemService, 'announceTreeNow'>;
}

/**
 * Builds {@link ImportServices} over the scope one import's own unit of work
 * admitted, publishing into that import's collector.
 */
export type ImportGraphFactory = (scope: Scope, broadcast: Broadcaster) => ImportServices;

/** Whether an admitted import keeps its writes, and what it answers either way. */
export type ImportDecision<T> = { commit: true; value: T } | { commit: false; value: T };

/** The labels a created row receives once every directory entry it names exists. */
export type ImportedLabels = Required<
  Pick<WorkItemPatch, 'tagIds' | 'serviceIds' | 'typeIds' | 'externalRefs'>
>;

/** A label write's answer; a refusal names the store's reason. */
export type LabelOutcome = { ok: true } | { ok: false; reason: string };

/**
 * The repository writes of one admitted Plan import, over the scope its unit of
 * work supplied.
 *
 * Every read and write goes through that scope, so it commits or rolls back
 * with the import. A write the created project refuses is an internal error:
 * preparation already admitted the document, so each such refusal throws and
 * abandons the unit of work. Only a row's label write answers a refusal,
 * because the import reports that one as `source_refused`.
 */
export class ImportedPlanResource {
  readonly #scope: Scope;

  constructor(scope: Scope) {
    this.#scope = scope;
  }

  /**
   * Whether a project the caller can collide with already holds the slug.
   * Under scoped access only the organization's own slugs collide, so another
   * organization's link neither blocks the slug nor shows.
   *
   * Proof: looking the slug up deployment-wide made `keeps a slug only another
   * organization holds` in `import-export-organization.controller.db.test.ts`
   * answer `left-off`; watched 2026-09-28, and again here on 2026-09-29 by
   * taking the deployment-wide arm under scoped access (9 pass, 1 fail).
   */
  async isSolutionSlugHeld(slug: string, access: ResourceAccess): Promise<boolean> {
    const holder =
      access.kind === 'scoped'
        ? await this.#scope.stores.projects.findBySolutionSlugInOrganization(
            slug,
            access.scope.organizationId,
          )
        : await this.#scope.stores.projects.findBySolutionSlug(slug);
    return holder !== null;
  }

  /**
   * Writes the project and its steps, in the caller's organization under scoped access.
   *
   * Proof: creating the project unmapped under scoped access made `imports into
   * the organization, resolving names among its own entries` in
   * `import-export-organization.controller.db.test.ts` find no imported project
   * in A's list; watched 2026-09-27, and again here on 2026-09-29 (8 pass, 2 fail).
   */
  async createProject(
    project: NewProject,
    steps: readonly Step[],
    stamp: WriteStamp,
    access: ResourceAccess,
  ): Promise<void> {
    if (access.kind === 'scoped') {
      await this.#scope.stores.projects.createInOrganization(
        project,
        steps,
        stamp,
        access.scope.organizationId,
      );
    } else {
      await this.#scope.stores.projects.create(project, steps, stamp);
    }
  }

  /** @throws when the created project refuses its priority bands. */
  async replacePriorityBands(
    projectId: string,
    bands: readonly PriorityBand[],
    stamp: WriteStamp,
  ): Promise<void> {
    const written = await this.#scope.stores.priorityBands.replace(projectId, bands, stamp);
    if (!written.ok) throw new Error(`created project refused its priority bands: ${projectId}`);
  }

  /** @throws when the created project refuses the team's capacity. */
  async setCapacity(
    projectId: string,
    teamId: string,
    size: number | null,
    stamp: WriteStamp,
  ): Promise<void> {
    const written = await this.#scope.stores.capacity.set(projectId, teamId, size, stamp);
    if (!written.ok) throw new Error(`created project refused its capacity: ${projectId}`);
  }

  /** @throws when the created project refuses the marker, naming the store's reason. */
  async createCalendarMarker(marker: CalendarMarker): Promise<void> {
    const written = await this.#scope.stores.calendarMarkers.create(marker);
    if (!written.ok)
      throw new Error(`created project refused its calendar marker: ${written.reason}`);
  }

  /** Inserts the whole prepared tree, parents first, with its step values and edges. */
  async insertSubtree(copy: SubtreeCopy, stamp: WriteStamp): Promise<void> {
    await this.#scope.stores.subtrees.insertSubtree(copy, stamp);
  }

  async addTypedDependency(row: StoredTypedDependency, stamp: WriteStamp): Promise<void> {
    await this.#scope.stores.typedDependencies.add(row, stamp);
  }

  /**
   * Sets a created row's labels, answering the store's refusal rather than throwing.
   *
   * Proof: answering `{ ok: true }` for a refused write made `rolls back visible
   * admitted writes after a later store refused` in the memory import source
   * contract fail (30 pass, 1 fail); watched 2026-09-29.
   */
  async labelWorkItem(
    workItemId: string,
    labels: ImportedLabels,
    stamp: WriteStamp,
  ): Promise<LabelOutcome> {
    const written = await this.#scope.stores.workItems.patch(workItemId, labels, stamp);
    return written.ok ? { ok: true } : { ok: false, reason: written.reason };
  }

  /**
   * The projects told that the directory changed: under scoped access only the
   * organization's own, because another organization's plans draw nothing this
   * import created.
   *
   * Proof: telling every project made `tells only the organization's projects
   * that its directory changed` in `import-export-organization.controller.db.test.ts`
   * find B's project told; watched 2026-09-27, and again here on 2026-09-29
   * (9 pass, 1 fail).
   */
  async listToldProjectIds(actorId: string, access: ResourceAccess): Promise<string[]> {
    const told =
      access.kind === 'scoped'
        ? await this.#scope.stores.projects.listForInOrganization(
            actorId,
            access.scope.organizationId,
          )
        : await this.#scope.stores.projects.list();
    return told.map(({ id }) => id);
  }
}

/**
 * Runs one import as one unit of work, handing it the scope's own
 * {@link ImportedPlanResource} and the graph `graphOver` builds over that scope
 * and `broadcast`.
 *
 * The scope never leaves this function, so the feature reaches the repository
 * only through the resource.
 */
export function runImportAdmission<T>(
  uow: UnitOfWork,
  graphOver: ImportGraphFactory,
  broadcast: Broadcaster,
  act: (writes: ImportedPlanResource, graph: ImportServices) => Promise<ImportDecision<T>>,
): Promise<T> {
  return uow.run<T>(
    async (scope) => await act(new ImportedPlanResource(scope), graphOver(scope, broadcast)),
  );
}
