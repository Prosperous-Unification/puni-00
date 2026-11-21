import type { CommandCaller } from '@wbs/core/ports/command-access';
import type { ResourceAccess } from '@wbs/core/ports/organization-access';
import {
  ALL_PROJECTS,
  type SpaceProjectRow,
  type SpaceRead,
  type SpaceRollUpRead,
  type SpaceView,
} from '@wbs/core/ports/space-read';
import type { SpaceContents } from '@wbs/core/ports/space-store';
import type { WorkPackageWithAccess } from '@wbs/core/ports/work-package-store';
import { authorize } from '@wbs/core/service/authorize';
import { RollUpCache } from '@wbs/core/service/space.resource';
import { POSITION_STEP } from '@wbs/domain';
import { asc, eq } from 'drizzle-orm';

import { AccessDecisionRepository } from './access-decisions';
import { SqliteCommandAccess } from './command-access';
import { type Connection, type Drizzle, observeCommitted } from './db';
import { OPEN } from './gate';
import { MachineCredentialRepository } from './machine-credential';
import { type ActiveOrganizationOf, SqliteOrganizationAccess } from './organization-access';
import { readProjectHeaderRow } from './project-operations';
import { refusingSavedCurrentCapture, type SavedCurrentReader } from './saved-current-capture';
import { project } from './schema';
import { SpaceRepository } from './space';
import { captureSpaceRollUpsIn, finishSpaceRollUps } from './space-roll-up';
import { WorkPackageRepository } from './work-package';

export interface SqliteSpaceReadOptions {
  readonly openConnection: () => Connection;
  readonly activeOrganizationOf: (snapshot: Drizzle) => ActiveOrganizationOf;
  readonly now: () => number;
}

/**
 * Captures actual authority, organization structure and readable child DTOs on one pooled
 * connection. Construction acquires nothing. Active loans may finish after Source close;
 * new observations refuse, and releasing the last active loan closes its physical connection.
 */
export class SqliteSpaceRead implements SpaceRead, SpaceRollUpRead {
  constructor(
    private readonly options: SqliteSpaceReadOptions,
    private readonly currentCapture: SavedCurrentReader = refusingSavedCurrentCapture,
    private readonly rollUpCache = new RollUpCache({ now: options.now }),
  ) {}

  async rollUps(
    caller: CommandCaller,
    spaceId: string,
    projectIds: readonly string[],
  ): ReturnType<SpaceRollUpRead['rollUps']> {
    // Proof: caller omission changed a nested expected-organization mutation into context refusal (space-project-rollup-fault-caller-v1).
    const retained = structuredClone(caller);
    // Proof: request-copy omission selected an empty rival project while organization selection was awaited (space-project-rollup-fault-requested-v1).
    const requested = [...projectIds];
    // Proof: no observation transaction mixed the rival parent/effort/date commit into the held read (space-project-rollup-fault-snapshot-v1).
    const observed = await observeCommitted(this.options.openConnection, async (snapshot) => {
      const resolved = await new SqliteCommandAccess(
        snapshot,
        new SqliteOrganizationAccess(
          snapshot,
          this.options.activeOrganizationOf(snapshot),
          this.options.now,
        ),
        new MachineCredentialRepository(snapshot, OPEN),
      ).resolve(retained);
      // Proof: omitting current-authority forwarding lost the typed membership refusal (space-project-rollup-fault-authority-v1; availability only).
      if (!resolved.ok) return resolved;
      const actorId = retained.kind === 'human' ? retained.principal.id : retained.actorId;
      const view = await this.readIn(snapshot, resolved.access, actorId, spaceId);
      // Proof: omitting absence forwarding lost foreign/missing-space not_found (space-project-rollup-fault-space-v1; availability only).
      if (!view.ok) return view;
      const prepared = await captureSpaceRollUpsIn(
        snapshot,
        resolved.access,
        actorId,
        view.value,
        requested,
        this.currentCapture,
      );
      // Proof: omitting prepared-absence forwarding lost required-hidden-endpoint not_found (space-project-rollup-fault-prepared-refusal-v3; availability only).
      return prepared === null
        ? { ok: false as const, refusal: 'not_found' as const }
        : { ok: true as const, value: prepared };
    });
    // Proof: omitting post-observation refusal forwarding lost typed membership refusal after release (space-project-rollup-fault-forwarding-v2; availability only).
    if (!observed.ok) return observed;
    // Proof: moving local finishing onto the loan let its retained SELECT1 probe read instead of throw (space-project-rollup-fault-finish-before-release-v1).
    return {
      ok: true,
      value: finishSpaceRollUps(observed.value, this.currentCapture, this.rollUpCache),
    };
  }

  async read(caller: CommandCaller, spaceId: string): ReturnType<SpaceRead['read']> {
    // Proof: retained-caller omission changed the awaited selection's successful grouped read to a refusal (space-project-read-fault-retained-caller-v1).
    const retained = structuredClone(caller);
    // Proof: omitting the observation transaction mixed a rival commit's grants/header/membership into the first-SQL snapshot (space-project-read-fault-snapshot-v1).
    return await observeCommitted(this.options.openConnection, async (snapshot) => {
      const resolved = await new SqliteCommandAccess(
        snapshot,
        new SqliteOrganizationAccess(
          snapshot,
          this.options.activeOrganizationOf(snapshot),
          this.options.now,
        ),
        new MachineCredentialRepository(snapshot, OPEN),
      ).resolve(retained);
      // Proof: omitting refusal forwarding changed the selected-organization conflict to an access.kind TypeError (space-project-read-fault-authority-refusal-v1).
      if (!resolved.ok) return resolved;
      const actorId = retained.kind === 'human' ? retained.principal.id : retained.actorId;
      return await this.readIn(snapshot, resolved.access, actorId, spaceId);
    });
  }

  private async readIn(
    snapshot: Drizzle,
    access: ResourceAccess,
    actorId: string,
    spaceId: string,
  ): ReturnType<SpaceRead['read']> {
    const spaces = new SpaceRepository(snapshot, OPEN);
    let organizationId = access.kind === 'scoped' ? access.scope.organizationId : null;
    let contents: SpaceContents | null = null;
    if (spaceId !== ALL_PROJECTS) {
      organizationId ??= await spaces.legacyOrganizationId();
      // Proof: omission changed pre-activation missing ownership from organization_required to not_found (space-project-read-fault-legacy-owner-v1).
      if (organizationId === null) return { ok: false, refusal: 'organization_required' };
      contents = await spaces.readContents(organizationId, spaceId);
      // Proof: omission published an ok:true virtual view for a foreign space (space-project-read-fault-space-absence-v1).
      if (contents === null) return { ok: false, refusal: 'not_found' };
    }

    const decisions = new AccessDecisionRepository(snapshot);
    const packages = new WorkPackageRepository(snapshot, OPEN, 'borrowed');
    const readableProjects =
      access.kind === 'legacy'
        ? null
        : await decisions.readableProjectIds(access.principal, access.scope.organizationId);
    const workPackages =
      access.kind === 'legacy'
        ? await packages.listFor(actorId)
        : // Proof: replacing the authority-constrained projection with listFor exposed the healthy restricted child before the private-corruption tail (space-project-read-fault-package-admission-v1).
          await packages.listReadableForInOrganization(actorId, access.scope.organizationId, [
            ...(await decisions.readablePackageIds(access.principal, access.scope.organizationId)),
          ]);
    const children = new Map<string, WorkPackageWithAccess[]>();
    for (const child of workPackages) {
      // An absent bucket means this readable child is the first for its actual project.
      const group = children.get(child.projectId) ?? [];
      group.push(child);
      children.set(child.projectId, group);
    }
    for (const group of children.values())
      group.sort(
        (left, right) =>
          Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)) ||
          Buffer.compare(Buffer.from(left.id), Buffer.from(right.id)),
      );
    const candidates = snapshot
      .select({ id: project.id, organizationId: project.organizationId, name: project.name })
      .from(project)
      // Proof: with the physical membership trigger broken, omission exposed an empty foreign project in a legacy-owned space (space-project-read-fault-project-owner-v1).
      .where(organizationId === null ? undefined : eq(project.organizationId, organizationId))
      .orderBy(asc(project.name), asc(project.id))
      .all();
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const ordered =
      // Proof: bypassing named membership included the project outside this space (space-project-read-fault-space-members-v1).
      contents === null
        ? candidates.map((candidate) => ({ candidate, position: null }))
        : contents.projects.flatMap(({ projectId, position }) => {
            const candidate = byId.get(projectId);
            // Raw membership grants nothing: a foreign project was excluded by the owner query.
            // Proof: removing foreign-member omission changed the broken-trigger owner case to a candidate.id TypeError (space-project-read-fault-member-owner-v1; availability only).
            return candidate === undefined ? [] : [{ candidate, position }];
          });
    const projects: SpaceProjectRow[] = [];
    for (const { candidate, position } of ordered) {
      // No bucket means the project has no readable children; full project.read can still admit it.
      const workPackages = children.get(candidate.id) ?? [];
      // Proof: omission exposed project shells without either project.read or a readable child (space-project-read-fault-project-admission-v1).
      if (
        readableProjects !== null &&
        !readableProjects.has(candidate.id) &&
        workPackages.length === 0
      )
        continue;
      // Proof: bypassing this decoder published a BLOB project name instead of throwing (space-project-read-fault-project-header-v1).
      const header = readProjectHeaderRow(candidate);
      projects.push({
        project: { id: header.id, name: header.name },
        // Only virtual groups have a modeled null position; named positions were validated in contents.
        position: position ?? (projects.length + 1) * POSITION_STEP,
        workPackages,
      });
    }
    const writable =
      // Proof: omission made an administrator's virtual All projects writable (space-project-read-fault-virtual-read-only-v1).
      contents !== null &&
      // Proof: omitting the grant decision kept a named space writable after grant deletion (space-project-read-fault-management-grant-v1).
      (access.kind === 'legacy' ||
        (
          await authorize(
            decisions,
            access.principal,
            { kind: 'organization', organizationId: access.scope.organizationId },
            'organization.manage_spaces',
          )
        ).ok);
    const value: SpaceView = {
      space: {
        id: spaceId,
        name: contents === null ? 'All projects' : contents.space.name,
        virtual: contents === null,
        projectCount: projects.length,
        workPackageCount: projects.reduce((count, group) => count + group.workPackages.length, 0),
        revision: contents === null ? 0 : contents.space.revision,
        createdById: contents === null ? null : contents.space.createdBy,
        createdAt: contents === null ? null : contents.space.createdAt,
      },
      writable,
      projects,
      personIds: contents === null ? [] : contents.personIds,
      serviceTeamIds: contents === null ? [] : contents.serviceTeamIds,
    };
    return { ok: true, value: structuredClone(value) };
  }
}
