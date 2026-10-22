import { findTypedEndpointDefect, type PriorityBand, type StoredStepBlockage } from '@wbs/domain';

import type { CalendarMarker } from '../../ports/calendar-marker-store';
import type { DependencyContext } from '../../ports/dependency-context';
import {
  type ExternalDependencyAuthoring,
  permitsExternalDependencies,
} from '../../ports/external-dependency-authoring';
import type { ImportDirectory } from '../../ports/import-directory';
import type { ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { NewProject } from '../../ports/project-values';
import type { StoredAttempt } from '../../ports/step-node-attempt-store';
import type { Step } from '../../ports/step-store';
import type { SubtreeCopy } from '../../ports/subtree-store';
import type { TreeAnnouncement } from '../../ports/tree-announcement';
import type { Scope } from '../../ports/unit-of-work';
import type { WorkItemPatch } from '../../ports/work-item-store';
import type { WriteStamp } from '../../ports/write-stamp';
import { findImportDependencyDuplicate } from './import-values';
import type { LocatedImportDependency } from './resolve-import-dependencies';

/** The ports one import uses to reconcile directory entries and announce its tree. */
export interface ImportServices {
  directory: ImportDirectory;
  workItems: TreeAnnouncement;
}

/**
 * Builds {@link ImportServices} over the scope one import's own unit of work
 * admitted, publishing into that import's collector.
 */
export type ImportGraphFactory = (scope: Scope, broadcast: Broadcaster) => ImportServices;

/** Whether an admitted import keeps its writes, and what it answers either way. */
export type ImportDecision<T> = { commit: true; value: T } | { commit: false; value: T };

/** The complete resources an import may use during its own admitted turn. */
export interface ImportedPlan {
  writes: ImportedPlanResource;
  services: ImportServices;
}

/**
 * A mapped import transaction: scoped calls recheck current authority on the
 * borrowed writer before capture, record shared consequences with successful
 * writes, then deliver committed rows after release. Legacy calls retain the
 * existing raw path. Only composition supplies the source and graph factory.
 */
export interface ImportTransaction {
  run<T>(
    actorId: string,
    access: ResourceAccess,
    forbidden: T,
    broadcast: Broadcaster,
    act: (plan: ImportedPlan) => Promise<ImportDecision<T>>,
  ): Promise<T>;
}

/** The labels a created row receives once every directory entry it names exists. */
export type ImportedLabels = Required<
  Pick<WorkItemPatch, 'tagIds' | 'serviceIds' | 'typeIds' | 'externalRefs'>
>;

/** A label write's answer; a refusal names the store's reason. */
export type LabelOutcome = { ok: true } | { ok: false; reason: string };

/** Modeled endpoint, shape, tuple or graph refusal from transaction admission. */
export interface ImportDependencyRefusal {
  readonly ok: false;
  readonly code: 'unknown_ref' | 'invalid_typed_dependency';
  readonly path: string;
  readonly detail: string | null;
}

/** Bound by composition; no feature receives a scope or dependency context. */
export interface ImportAuthority {
  readonly actorId: string;
  readonly access: ResourceAccess;
  readonly externalDependencies: ExternalDependencyAuthoring;
  assertActive(): void;
  contextFor(projectId: string): DependencyContext;
}

/**
 * The repository writes of one admitted Plan import, over the scope its unit of
 * work supplied.
 *
 * Every read and write goes through that scope, so it commits or rolls back
 * with the import. A write the created project refuses is an internal error:
 * preparation already admitted the document, so each such refusal throws and
 * abandons the unit of work. Dependency admission answers modeled reference,
 * shape, duplicate and graph refusals; labels answer `source_refused`.
 */
export class ImportedPlanResource {
  readonly #scope: Scope;
  readonly #authority: ImportAuthority;
  #createdProjectId: string | null = null;

  constructor(scope: Scope, authority: ImportAuthority) {
    this.#scope = scope;
    this.#authority = authority;
  }

  // Proof: removing this assertion let retained slug reads succeed after all three settlement arms (scoped-import-dependencies.db.test.ts, 2026-10-22).
  get #stores() {
    this.#authority.assertActive();
    return this.#scope.stores;
  }

  /** Refuses external declarations before allocation; legacy never gains remote authority. */
  checkExternalAuthoring(path: string) {
    this.#authority.assertActive();
    // Proof: independently bypassing inactive capability or scoped access failed the dormant/inactive and active+legacy SQLite cases (2026-10-22).
    if (
      !permitsExternalDependencies(this.#authority.externalDependencies) ||
      this.#authority.access.kind !== 'scoped'
    )
      return { ok: false, code: 'external_dependencies_inactive', path, detail: null } as const;
    return null;
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
        ? await this.#stores.projects.findBySolutionSlugInOrganization(
            slug,
            access.scope.organizationId,
          )
        : await this.#stores.projects.findBySolutionSlug(slug);
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
  ): Promise<'abbreviation_taken' | 'abbreviation_exhausted' | null> {
    const created =
      access.kind === 'scoped'
        ? await this.#stores.projects.createInOrganization(
            project,
            steps,
            stamp,
            access.scope.organizationId,
          )
        : await this.#stores.projects.create(project, steps, stamp);
    this.#authority.assertActive();
    if (typeof created === 'string') return created;
    this.#createdProjectId = project.id;
    return null;
  }

  /** @throws when the created project refuses its priority bands. */
  async replacePriorityBands(
    projectId: string,
    bands: readonly PriorityBand[],
    stamp: WriteStamp,
  ): Promise<void> {
    const written = await this.#stores.priorityBands.replace(projectId, bands, stamp);
    if (!written.ok) throw new Error(`created project refused its priority bands: ${projectId}`);
  }

  /** @throws when the created project refuses the team's capacity. */
  async setCapacity(
    projectId: string,
    teamId: string,
    size: number | null,
    stamp: WriteStamp,
  ): Promise<void> {
    const written = await this.#stores.capacity.set(projectId, teamId, size, stamp);
    if (!written.ok) throw new Error(`created project refused its capacity: ${projectId}`);
  }

  /** @throws when the created project refuses the resource's capacity (`wbs-resources`). */
  async setResourceCapacity(
    projectId: string,
    resourceId: string,
    units: number,
    stamp: WriteStamp,
  ): Promise<void> {
    const written = await this.#stores.resourceCapacity.set(projectId, resourceId, units, stamp);
    if (!written.ok)
      throw new Error(`created project refused its resource capacity: ${written.reason}`);
  }

  /** @throws when a created row refuses its demand (`wbs-resources`). */
  async setDemand(
    workItemId: string,
    resourceId: string,
    units: number,
    stamp: WriteStamp,
  ): Promise<void> {
    const written = await this.#stores.demands.set(workItemId, resourceId, units, stamp);
    if (written !== 'written') throw new Error(`created row refused its demand: ${written}`);
  }

  /** @throws when the created project refuses the marker, naming the store's reason. */
  async createCalendarMarker(marker: CalendarMarker): Promise<void> {
    const written = await this.#stores.calendarMarkers.create(marker);
    if (!written.ok)
      throw new Error(`created project refused its calendar marker: ${written.reason}`);
  }

  /** Inserts the whole prepared tree, parents first, with its step values and edges. */
  async insertSubtree(copy: SubtreeCopy, stamp: WriteStamp): Promise<void> {
    await this.#stores.subtrees.insertSubtree(copy, stamp);
  }

  /**
   * Stores the created project's zone. `createProject` writes the column's
   * `UTC`, so only a document naming another zone calls this.
   *
   * @throws when the created project is not there to take it.
   */
  async setTimezone(projectId: string, timezone: string, stamp: WriteStamp): Promise<void> {
    if (!(await this.#stores.projects.setTimezone(projectId, timezone, stamp)))
      throw new Error(`created project refused its timezone: ${projectId}`);
  }

  /** Restores an exact imported fact within the admitted unit of work; refuses a lost step. */
  async restoreBlockage(fact: StoredStepBlockage, stamp: WriteStamp): Promise<void> {
    const written = await this.#stores.blockages.set(fact, stamp);
    // Proof: bypassing refusal resolved `rolls back direct blockage import after refused`, leaking the import (2026-10-14).
    if (written !== 'written')
      throw new Error(`created project refused its blockage: ${fact.workItemId}/${fact.stepId}`);
  }

  /** Writes one attempt verbatim under its own number onto a created leaf. */
  async restoreAttempt(attempt: StoredAttempt, stamp: WriteStamp): Promise<void> {
    await this.#stores.attempts.restore(attempt, stamp);
  }

  /**
   * Admits the complete newly created owner's set against staged endpoint and
   * connected graph evidence before its first typed insert. Refusals leave
   * rollback to the outer import writer; trusted faults and store failures throw.
   */
  async writeDependencies(
    projectId: string,
    located: readonly LocatedImportDependency[],
    stamp: WriteStamp,
  ): Promise<ImportDependencyRefusal | null> {
    this.#authority.assertActive();
    // Proof: independently dropping owner or actor equality failed its forged trusted-boundary SQLite case (2026-10-22).
    if (projectId !== this.#createdProjectId || stamp.by !== this.#authority.actorId)
      throw new Error('import dependency owner or actor mismatch');
    if (located.length === 0) return null;
    const context = this.#authority.contextFor(projectId);
    context.assertUsable(projectId, stamp.by);
    for (const { relationship, path } of located) {
      // Proof: independently dropping owner or successor-owner equality failed its forged relationship SQLite case (2026-10-22).
      if (relationship.projectId !== projectId || relationship.successor.projectId !== projectId)
        throw new Error('import relationship owner mismatch');
      if (relationship.predecessor.projectId !== projectId) {
        const dormant = this.checkExternalAuthoring(path);
        // Proof: omitting this refusal let an injected declaration-gate bypass persist remote links with inactive capability (2026-10-22).
        if (dormant !== null) throw new Error('external import bypassed authoring admission');
      }
      for (const side of ['predecessor', 'successor'] as const) {
        const endpoint = relationship[side];
        const checked = await context.endpoints.readEndpoint(endpoint);
        // Proof: bypassing this consumer failed concealed missing-reference SQLite cases before any typed INSERT (2026-10-22).
        if (!checked.ok)
          return { ok: false, code: 'unknown_ref', path: `${path}.${side}`, detail: null };
        const defect = findTypedEndpointDefect(endpoint, {
          isLeaf: () => checked.evidence.isLeaf,
          hasStep: () => checked.evidence.step !== null,
        });
        // Proof: bypassing this modeled refusal failed both parent-node and leaf-descendant SQLite cases (2026-10-22).
        if (defect !== null)
          return {
            ok: false,
            code: 'invalid_typed_dependency',
            path: `${path}.${side}`,
            detail: defect,
          };
      }
    }
    const duplicate = findImportDependencyDuplicate(
      located.map(({ path, relationship }) => ({ path, ...relationship })),
    );
    // Proof: bypassing this invocation's refusal failed the allocated internal/external collision case (2026-10-22).
    if (duplicate !== null)
      return { ok: false, code: 'invalid_typed_dependency', path: duplicate, detail: 'duplicate' };
    const relationships = located.map(({ relationship }) => relationship);
    // Proof: bypassing the complete-set graph check failed reverse-mapping and seeded-corruption SQLite cases (2026-10-22).
    const cycle = await context.graph.findCycle(projectId, { typed: relationships });
    if (cycle !== null) {
      let path = 'typedDependencies';
      for (const declaration of located)
        if (cycle.relationshipIds.includes(declaration.relationship.id)) path = declaration.path;
      // Proof: omitting this diagnosis failed the later external component's original-path assertion (2026-10-22).
      if (path === 'typedDependencies') {
        // Only after complete-set refusal: find which declaration reached a
        // pre-existing corrupt component whose cycle names no imported edge.
        const local = relationships.filter(
          (relationship) => relationship.predecessor.projectId === projectId,
        );
        for (const declaration of located) {
          if (declaration.relationship.predecessor.projectId === projectId) continue;
          const defect = await context.graph.findCycle(projectId, {
            typed: [...local, declaration.relationship],
          });
          if (defect !== null) {
            path = declaration.path;
            break;
          }
        }
      }
      return { ok: false, code: 'invalid_typed_dependency', path, detail: cycle.kind };
    }
    for (const relationship of relationships) {
      context.assertUsable(projectId, stamp.by);
      // Proof: omitting persistence failed the real scoped whole-predecessor import (2026-10-22).
      await this.#stores.typedDependencies.add(relationship, stamp);
      context.assertUsable(projectId, stamp.by);
    }
    return null;
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
    const written = await this.#stores.workItems.patch(workItemId, labels, stamp);
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
        ? await this.#stores.projects.listForInOrganization(actorId, access.scope.organizationId)
        : await this.#stores.projects.list();
    return told.map(({ id }) => id);
  }
}
