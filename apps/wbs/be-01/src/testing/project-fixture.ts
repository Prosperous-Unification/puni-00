import type { ProjectRead } from '@wbs/core/ports/project-read';
import type { User } from '@wbs/core/ports/user-store';
import { ProjectResource } from '@wbs/core/service/project.resource';
import { inMemoryUsers, memoryUserTable } from '@wbs/store-memory/auth-fixture';
import type { MemoryPackageCreationContext } from '@wbs/store-memory/package-creation-fixture';
import type { MemoryWorkPackageTables } from '@wbs/store-memory/work-package-fixture';
import {
  inMemoryWorkPackages,
  memoryWorkPackageTables,
} from '@wbs/store-memory/work-package-fixture';
import { openDatabase } from '@wbs/store-sqlite/db';

import { testClock } from './clock-fixture';

/** Explicit unavailable project observations for unrelated composition fixtures. */
export const refusingProjectRead: ProjectRead = {
  list: () => Promise.resolve({ ok: false, refusal: 'no_active_organization' }),
  read: () => Promise.resolve({ ok: false, refusal: 'no_active_organization' }),
};
/** Required composition outside project tests; invocation always refuses rather than inventing authority. */
export const refusingProjects = new ProjectResource({
  settings: {
    read: () => Promise.resolve({ ok: false, refusal: 'no_active_organization' }),
    writeBudget: () => Promise.resolve({ ok: false, refusal: 'no_active_organization' }),
  },
  administration: {
    create: () => Promise.resolve({ ok: false, refusal: 'no_active_organization' }),
    rename: () => Promise.resolve({ ok: false, refusal: 'no_active_organization' }),
    delete: () => Promise.resolve({ ok: false, refusal: 'no_active_organization' }),
    moveWorkPackage: () => Promise.resolve({ ok: false, refusal: 'no_active_organization' }),
  },
  read: refusingProjectRead,
  clock: testClock,
});

/** Seeds a deliberately named legacy parent in a fresh migrated fixture; production never calls this. */
export function seedLegacyProject(path: string, organizationId: string, projectId: string): void {
  const sqlite = openDatabase(path);
  try {
    sqlite.run('INSERT INTO organization(id,name,legacy,created_at) VALUES(?,?,1,1)', [
      organizationId,
      organizationId,
    ]);
    sqlite.run('INSERT INTO project(id,organization_id,name,created_at) VALUES(?,?,?,1)', [
      projectId,
      organizationId,
      projectId,
    ]);
  } finally {
    sqlite.close(true);
  }
}

/** Explicit standalone fixture rows; these do not establish full MemorySource current-mode parity. */
export function createLegacyPackageContext(
  users: ReadonlyMap<string, User>,
  tables: MemoryWorkPackageTables,
  organizationId: string,
  projectId: string,
): MemoryPackageCreationContext {
  tables.creation.activation.state = 'pre_activation';
  tables.creation.projects.set(projectId, {
    spaceId: null,
    spacePosition: null,
    id: projectId,
    organizationId,
    name: projectId,
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: null,
  });
  return {
    users,
    organizations: new Map([[organizationId, { legacy: true }]]),
    memberships: new Map(),
    ownership: tables.owning,
  };
}

/** Builds actual named account/parent rows for standalone current service fixtures, without Source authority. */
export async function createLegacyWorkPackages(
  actorId: string,
  organizationId: string,
  projectId: string,
) {
  const userTable = memoryUserTable(),
    users = inMemoryUsers(userTable);
  await users.create(
    { id: actorId, username: actorId, passwordHash: null, createdAt: 1 },
    { at: 1, by: actorId },
  );
  const tables = memoryWorkPackageTables();
  return inMemoryWorkPackages(
    users,
    tables,
    createLegacyPackageContext(userTable.byId, tables, organizationId, projectId),
  );
}
