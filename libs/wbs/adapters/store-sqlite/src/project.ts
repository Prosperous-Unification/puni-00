import {
  type GrantRefusal,
  type ProjectAct,
  type ProjectCreated,
  type ProjectCreationAct,
  type ProjectDeleted,
  type ProjectDetail,
  type ProjectDraft,
  type ProjectRenamed,
  type ProjectStore,
  type ProjectSummary,
  retainProjectAct,
  retainProjectCreation,
} from '@wbs/core';
import type {
  ProjectFirstWorkPackage,
  ProjectPackageRefusal,
  WorkPackageMoved,
  WorkPackageMoveRefusal,
} from '@wbs/core/ports/project-store';
import {
  retainProjectFirstWorkPackage,
  retainWorkPackageMove,
} from '@wbs/core/ports/project-store';

import type { Drizzle } from './db';
import type { Gate } from './gate';
import { writeImmediately } from './immediate-write';
import {
  createFirstWorkPackageIn,
  createProjectIn,
  deleteProjectIn,
  moveWorkPackageIn,
  ProjectGrantRefused,
  readProjectDetailIn,
  readProjectSummariesIn,
  renameProjectIn,
} from './project-operations';
import { LastSuperAdmin } from './super-admin';
import { readWorkPackageCreationRefusal } from './work-package-creation';

/** Self-owning project administration; never inserted into borrowed PlanTransactionalStores. */
export class ProjectRepository implements ProjectStore {
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
  ) {}

  async create(
    draft: ProjectDraft,
    act: ProjectCreationAct,
    first?: ProjectFirstWorkPackage,
  ): Promise<ProjectCreated | ProjectPackageRefusal | 'name_taken' | GrantRefusal> {
    ({ draft, act } = retainProjectCreation(draft, act));
    first = retainProjectFirstWorkPackage(draft, act, first);
    try {
      return await writeImmediately(this.db, this.gate, (tx): ProjectCreated | 'name_taken' => {
        const created = createProjectIn(tx, draft, act);
        if (typeof created === 'string' || first === undefined) return created;
        return createFirstWorkPackageIn(tx, draft, act, first);
      });
    } catch (failure: unknown) {
      if (failure instanceof AggregateError) throw failure;
      if (failure instanceof ProjectGrantRefused) return failure.reason;
      const refused = readWorkPackageCreationRefusal(failure);
      if (refused !== null) return { kind: 'work_package_refused', reason: refused };
      throw failure;
    }
  }

  async findIn(organizationId: string, projectId: string): Promise<ProjectDetail | null> {
    await Promise.resolve();
    return readProjectDetailIn(this.db, organizationId, projectId);
  }

  async listIn(organizationId: string): Promise<readonly ProjectSummary[]> {
    await Promise.resolve();
    return readProjectSummariesIn(this.db, organizationId);
  }

  async rename(
    organizationId: string,
    projectId: string,
    name: string,
    act: ProjectAct,
  ): Promise<ProjectRenamed | 'name_taken' | 'not_found'> {
    act = retainProjectAct(organizationId, projectId, act);
    if (typeof name !== 'string' || name === '') throw new Error('project name must be present');
    return await writeImmediately(this.db, this.gate, (tx) =>
      renameProjectIn(tx, organizationId, projectId, name, act),
    );
  }

  async moveWorkPackage(
    organizationId: string,
    workPackageId: string,
    targetProjectId: string,
    act: ProjectAct,
  ): Promise<WorkPackageMoved | WorkPackageMoveRefusal> {
    act = retainWorkPackageMove(organizationId, workPackageId, targetProjectId, act);
    return await writeImmediately(this.db, this.gate, (tx) =>
      moveWorkPackageIn(tx, organizationId, workPackageId, targetProjectId, act),
    );
  }

  async delete(
    organizationId: string,
    projectId: string,
    act: ProjectAct,
  ): Promise<ProjectDeleted | 'not_found' | 'last_super_admin'> {
    act = retainProjectAct(organizationId, projectId, act);
    try {
      return await writeImmediately(this.db, this.gate, (tx) =>
        deleteProjectIn(tx, organizationId, projectId, act),
      );
    } catch (failure: unknown) {
      if (failure instanceof LastSuperAdmin) return 'last_super_admin';
      throw failure;
    }
  }
}
