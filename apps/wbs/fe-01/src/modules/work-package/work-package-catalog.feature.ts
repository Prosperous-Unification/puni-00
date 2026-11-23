import {
  CatalogWithdrawnError,
  type WorkPackageCatalog,
  type WorkPackageCatalogRoutes,
} from './contract';

/**
 * The work package catalog over its private port, answering only while its session
 * is current.
 *
 * `isCurrent` is asked synchronously when a member is called: a withdrawn
 * session's catalog sends nothing and rejects with {@link CatalogWithdrawnError}.
 * An answer that arrives after a withdrawal is handed on unchanged — the page
 * that asked is gone by then, and the catalog holds no state of its own to
 * keep.
 */
export function createWorkPackageCatalog({
  routes,
  isCurrent,
}: {
  routes: WorkPackageCatalogRoutes;
  isCurrent: () => boolean;
}): WorkPackageCatalog {
  // Proof: on 2026-09-27, sending whatever the session said (`true ? send() : …`, w1) failed
  // `sends nothing once its session is withdrawn, and says so` on `expected [ 'list',
  // 'create:Shed', …(3) ] to deeply equal []`.
  const whileCurrent = <T>(send: () => Promise<T>): Promise<T> =>
    isCurrent() ? send() : Promise.reject(new CatalogWithdrawnError());
  return {
    list: () => whileCurrent(() => routes.listWorkPackages()),
    listProjects: () => whileCurrent(() => routes.listProjects()),
    createProjectWithWorkPackage: (projectName, workPackageName) =>
      whileCurrent(() => routes.createProjectWithWorkPackage(projectName, workPackageName)),
    create: (projectId, name) => whileCurrent(() => routes.createWorkPackage(projectId, name)),
    markOpened: (workPackageId) => whileCurrent(() => routes.openWorkPackage(workPackageId)),
    rename: (workPackageId, name) =>
      whileCurrent(() => routes.renameWorkPackage(workPackageId, name)),
    // Proof: bypassing whileCurrent here failed `sends nothing once its session is
    // withdrawn`: sent contained abbreviation:p1:puni2 instead of []. Watched 2026-10-22.
    setAbbreviation: (workPackageId, abbreviation) =>
      whileCurrent(() => routes.setAbbreviation(workPackageId, abbreviation)),
    importPlan: (projectId, document, options) =>
      whileCurrent(() => routes.importPlan(projectId, document, options)),
  };
}
