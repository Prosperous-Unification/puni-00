import type { Project, ProjectStore, ProjectWithAccess, Role } from '../repository';
import { ProjectService } from '../service/project.service';

/**
 * A ProjectStore backed by Maps, for controller and service tests that do not
 * need SQLite.
 *
 * It keeps the guarantees the real schema enforces, because a fixture that is
 * laxer than production lets a test pass against behaviour that does not exist:
 * role names are unique within a project, `list` returns newest first, and
 * `update` refuses an id it does not hold rather than inventing a row.
 */
export function inMemoryProjects(): ProjectStore {
  const projects = new Map<string, Project>();
  const roles = new Map<string, Role[]>();
  /** One moment per `userId::projectId`, exactly as the primary key holds it. */
  const opened = new Map<string, number>();

  return {
    create(project, starting) {
      const names = new Set(starting.map((r) => r.name));
      if (names.size !== starting.length) {
        return Promise.reject(new Error(`duplicate role name in ${project.id}`));
      }
      projects.set(project.id, project);
      roles.set(project.id, [...starting]);
      return Promise.resolve(project);
    },
    findById(id) {
      return Promise.resolve(projects.get(id) ?? null);
    },
    list() {
      return Promise.resolve([...projects.values()].sort((a, b) => b.createdAt - a.createdAt));
    },
    listFor(userId) {
      // Sorted the way SQLite's `ORDER BY last_opened_at DESC, created_at DESC`
      // sorts, NULLs last. A fixture ordering it any other way would let a
      // component pass against an order production does not produce.
      const withAccess: ProjectWithAccess[] = [...projects.values()].map((project) => ({
        ...project,
        lastOpenedAt: opened.get(`${userId}::${project.id}`) ?? null,
      }));
      return Promise.resolve(
        withAccess.sort((a, b) => {
          if (a.lastOpenedAt !== b.lastOpenedAt) {
            if (a.lastOpenedAt === null) return 1;
            if (b.lastOpenedAt === null) return -1;
            return b.lastOpenedAt - a.lastOpenedAt;
          }
          return b.createdAt - a.createdAt;
        }),
      );
    },
    recordOpen(userId, projectId, at) {
      opened.set(`${userId}::${projectId}`, at);
      return Promise.resolve();
    },
    update(id, patch) {
      const existing = projects.get(id);
      if (existing === undefined) return Promise.resolve(null);
      const updated: Project = {
        ...existing,
        name: patch.name ?? existing.name,
        restricted: patch.restricted ?? existing.restricted,
        estimateMethod: patch.estimateMethod ?? existing.estimateMethod,
      };
      projects.set(id, updated);
      return Promise.resolve(updated);
    },
    rolesOf(projectId) {
      return Promise.resolve(roles.get(projectId) ?? []);
    },
  };
}

/** A ProjectService over the in-memory store, for tests that only need `buildApp` to construct. */
export function testProjectService(projects: ProjectStore = inMemoryProjects()): ProjectService {
  return new ProjectService({ projects });
}
