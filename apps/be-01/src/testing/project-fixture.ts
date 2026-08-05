import type { Project, ProjectStore, Role } from '../repository';
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
    update(id, patch) {
      const existing = projects.get(id);
      if (existing === undefined) return Promise.resolve(null);
      const updated: Project = {
        ...existing,
        name: patch.name ?? existing.name,
        restricted: patch.restricted ?? existing.restricted,
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
