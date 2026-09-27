import { CatalogWithdrawnError, type ProjectCatalog, type ProjectCatalogRoutes } from './contract';

/**
 * The project catalog over its private port, answering only while its session
 * is current.
 *
 * `isCurrent` is asked synchronously when a member is called: a withdrawn
 * session's catalog sends nothing and rejects with {@link CatalogWithdrawnError}.
 * An answer that arrives after a withdrawal is handed on unchanged — the page
 * that asked is gone by then, and the catalog holds no state of its own to
 * keep.
 */
export function createProjectCatalog({
  routes,
  isCurrent,
}: {
  routes: ProjectCatalogRoutes;
  isCurrent: () => boolean;
}): ProjectCatalog {
  // Proof: on 2026-09-27, sending whatever the session said (`true ? send() : …`, w1) failed
  // `sends nothing once its session is withdrawn, and says so` on `expected [ 'list',
  // 'create:Shed', …(3) ] to deeply equal []`.
  const whileCurrent = <T>(send: () => Promise<T>): Promise<T> =>
    isCurrent() ? send() : Promise.reject(new CatalogWithdrawnError());
  return {
    list: () => whileCurrent(() => routes.listProjects()),
    create: (name) => whileCurrent(() => routes.createProject(name)),
    markOpened: (projectId) => whileCurrent(() => routes.openProject(projectId)),
    rename: (projectId, name) => whileCurrent(() => routes.renameProject(projectId, name)),
    importPlan: (document) => whileCurrent(() => routes.importPlan(document)),
  };
}
