import { desc, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { Project, ProjectPatch, ProjectStore, Role } from './index';
import { project, role } from './schema';

/**
 * `create` writes the project and its roles in one transaction. A project that
 * existed briefly without roles would accept an estimate with no role to belong
 * to, and the failure would surface later as a missing join rather than here as
 * a rejected write.
 *
 * Role name uniqueness is left to the schema index: checking first is a race
 * two concurrent additions both win.
 */
export class ProjectRepository implements ProjectStore {
  constructor(private readonly db: SQLiteBunDatabase) {}

  // `async` is load-bearing rather than decorative: `db.transaction` is
  // synchronous, so a constraint violation would otherwise be thrown before the
  // promise this signature advertises exists — and a caller holding it with
  // `.catch()` would never see the rejection.
  async create(toCreate: Project, startingRoles: readonly Role[]): Promise<Project> {
    await Promise.resolve();
    this.db.transaction((tx) => {
      tx.insert(project).values(toCreate).run();
      if (startingRoles.length > 0)
        tx.insert(role)
          .values([...startingRoles])
          .run();
    });
    return toCreate;
  }

  async findById(id: string): Promise<Project | null> {
    const rows = await this.db.select().from(project).where(eq(project.id, id)).limit(1);
    return rows[0] ?? null;
  }

  list(): Promise<Project[]> {
    return this.db.select().from(project).orderBy(desc(project.createdAt));
  }

  async update(id: string, patch: ProjectPatch): Promise<Project | null> {
    // An empty patch would make drizzle emit `SET` with no assignments, which
    // SQLite rejects — so a request that changes nothing reads instead.
    if (patch.name === undefined && patch.restricted === undefined) return this.findById(id);
    const rows = await this.db.update(project).set(patch).where(eq(project.id, id)).returning();
    return rows[0] ?? null;
  }

  rolesOf(projectId: string): Promise<Role[]> {
    return this.db.select().from(role).where(eq(role.projectId, projectId));
  }
}
