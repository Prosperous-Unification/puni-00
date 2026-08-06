import { and, desc, eq, sql } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import type { Project, ProjectPatch, ProjectStore, ProjectWithAccess, Role } from './index';
import { project, projectAccess, role } from './schema';

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

  /**
   * The caller's own order, in one query.
   *
   * The ordering rests on a SQLite fact worth naming: `ORDER BY x DESC` puts
   * NULLs **last**, because NULL sorts below every value. That is exactly the
   * rule this needs — never-opened projects after opened ones — and it is not
   * portable, so a test watches it rather than a comment claiming it.
   *
   * The join is on both columns: `project_access` holds one row per pair, and
   * joining on the project alone would attach somebody else's history to this
   * caller's list — every project would then look opened, in the order the
   * busiest account visited them.
   */
  listFor(userId: string): Promise<ProjectWithAccess[]> {
    return this.db
      .select({
        id: project.id,
        name: project.name,
        ownerId: project.ownerId,
        restricted: project.restricted,
        createdAt: project.createdAt,
        lastOpenedAt: projectAccess.lastOpenedAt,
      })
      .from(project)
      .leftJoin(
        projectAccess,
        and(eq(projectAccess.projectId, project.id), eq(projectAccess.userId, userId)),
      )
      .orderBy(desc(projectAccess.lastOpenedAt), desc(project.createdAt));
  }

  async recordOpen(userId: string, projectId: string, at: number): Promise<void> {
    await this.db
      .insert(projectAccess)
      .values({ userId, projectId, lastOpenedAt: at })
      // The pair is the primary key, so a second open is an update rather than
      // a constraint violation — and `at` is taken as given rather than
      // maxed: the caller's clock is the one that saw the open happen.
      .onConflictDoUpdate({
        target: [projectAccess.userId, projectAccess.projectId],
        set: { lastOpenedAt: sql`excluded.last_opened_at` },
      });
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
