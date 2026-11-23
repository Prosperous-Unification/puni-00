import {
  type AuthenticatedUser,
  createProject,
  deleteProject,
  listProjects,
  patchProjectSettings,
  readProject,
  readProjectSettings,
  renameProject,
} from '@wbs/contracts';

import type { OrganizationAccess } from '../ports/organization-access';
import type { ProjectCaller, ProjectWriteRefusal } from '../ports/project-administration';
import type { ProjectResource } from '../service/project.resource';
import type { ProjectSettingsOutcome } from '../service/project-settings';
import { bind, EMPTY, type HttpReply, type RequestFailure } from './endpoint';
import { organizationRefusal } from './organization-refusal';

function classifyProjectRequestFailure(failure: RequestFailure) {
  return failure.code === 'invalid_body'
    ? ({ ok: false, status: 422, body: { error: failure.code } } as const)
    : ({ ok: false, status: 400, body: { error: failure.code } } as const);
}
function writeRefusal(refusal: ProjectWriteRefusal) {
  if ('refusal' in refusal) return organizationRefusal(refusal);
  if (refusal.error === 'insufficient_scope')
    return { ok: false, status: 403, body: { error: refusal.error } } as const;
  return {
    ok: false,
    status: 403,
    body: { error: refusal.error, permission: refusal.permission },
  } as const;
}

/**
 * Five engagement-project endpoints over required current-authority ports.
 * Initial resolution supplies retained context evidence; each port revalidates it in its owner.
 * New project operations have no legacy success or body-derived actor/organization.
 */
export function projectRoutes(projects: ProjectResource, organizations: OrganizationAccess) {
  const callerOf = async (principal: AuthenticatedUser) => {
    principal = structuredClone(principal);
    const resolved = await organizations.resolve(principal);
    if (!resolved.ok) return resolved;
    if (resolved.access.kind === 'legacy')
      return { ok: false, refusal: 'no_active_organization' } as const;
    const caller: ProjectCaller = { kind: 'human', principal, expectedAccess: resolved.access };
    return { ok: true, caller } as const;
  };
  const settingsReply = (
    outcome: ProjectSettingsOutcome,
  ): HttpReply<typeof patchProjectSettings> => {
    if (outcome.ok)
      return {
        ok: true,
        status: 200,
        body: {
          settings: { ...outcome.settings, calendarMarkers: [...outcome.settings.calendarMarkers] },
        },
      };
    if ('refusal' in outcome) return organizationRefusal(outcome);
    if (outcome.reason === 'forbidden')
      return {
        ok: false,
        status: 403,
        body: { error: outcome.reason, permission: outcome.permission },
      };
    if (outcome.reason === 'insufficient_scope')
      return { ok: false, status: 403, body: { error: outcome.reason } };
    if (outcome.reason === 'not_found')
      return { ok: false, status: 404, body: { error: outcome.reason } };
    if (outcome.reason === 'invalid_value')
      return { ok: false, status: 422, body: { error: outcome.reason, key: outcome.key } };
    return {
      ok: false,
      status: 409,
      body: { error: outcome.reason, key: outcome.key, level: outcome.level },
    };
  };
  return [
    bind(
      createProject,
      async ({ body, principal }): Promise<HttpReply<typeof createProject>> => {
        const caller = await callerOf(principal);
        if (!caller.ok) return organizationRefusal(caller);
        const created = await projects.create(caller.caller, body.name, body.workPackage);
        if (created === 'name_taken') return { ok: false, status: 409, body: { error: created } };
        if ('ok' in created) return writeRefusal(created);
        if (created.kind === 'work_package_refused')
          return { ok: false, status: 409, body: { error: created.reason } };
        if (created.kind === 'created_with_work_package')
          return {
            ok: true,
            status: 201,
            body: {
              project: created.project,
              workPackage: created.workPackage,
              steps: created.steps.map((step) => ({ ...step })),
            },
          };
        return { ok: true, status: 201, body: { project: created.project } };
      },
      { classifyRequestFailure: classifyProjectRequestFailure },
    ),
    bind(listProjects, async ({ principal }): Promise<HttpReply<typeof listProjects>> => {
      const caller = await callerOf(principal);
      if (!caller.ok) return organizationRefusal(caller);
      const listed = await projects.list(caller.caller);
      return listed.ok
        ? {
            ok: true,
            status: 200,
            body: { projects: listed.value.map((project) => ({ ...project })) },
          }
        : organizationRefusal(listed);
    }),
    bind(readProject, async ({ params, principal }): Promise<HttpReply<typeof readProject>> => {
      const caller = await callerOf(principal);
      if (!caller.ok) return organizationRefusal(caller);
      const found = await projects.read(caller.caller, params.id);
      if (!found.ok) {
        // Proof: omitting this branch gave 500 instead of 403 in 'projects a package-only parent as an exact list shell and refuses full detail without project.read';
        // canonical passed before/after (project.controller.db.test.ts, 2026-11-14). Typed HTTP projection only.
        if ('error' in found)
          return {
            ok: false,
            status: 403,
            body: { error: found.error, permission: found.permission },
          };
        return organizationRefusal(found);
      }
      return found.value === null
        ? { ok: false, status: 404, body: { error: 'not_found' } }
        : {
            ok: true,
            status: 200,
            body: {
              project: {
                ...found.value,
                workPackages: found.value.workPackages.map(({ id, name }) => ({ id, name })),
              },
            },
          };
    }),
    bind(
      renameProject,
      async ({ params, body, principal }): Promise<HttpReply<typeof renameProject>> => {
        const caller = await callerOf(principal);
        if (!caller.ok) return organizationRefusal(caller);
        const renamed = await projects.rename(caller.caller, params.id, body.name);
        if (renamed === 'name_taken') return { ok: false, status: 409, body: { error: renamed } };
        if (renamed === 'not_found') return { ok: false, status: 404, body: { error: renamed } };
        if ('ok' in renamed) return writeRefusal(renamed);
        return { ok: true, status: 200, body: { project: renamed.project } };
      },
      { classifyRequestFailure: classifyProjectRequestFailure },
    ),
    bind(deleteProject, async ({ params, principal }): Promise<HttpReply<typeof deleteProject>> => {
      const caller = await callerOf(principal);
      if (!caller.ok) return organizationRefusal(caller);
      const deleted = await projects.delete(caller.caller, params.id);
      if (deleted === 'not_found') return { ok: false, status: 404, body: { error: deleted } };
      if (deleted === 'last_super_admin')
        return { ok: false, status: 409, body: { error: deleted } };
      if ('ok' in deleted) return writeRefusal(deleted);
      if (deleted.kind === 'not_empty')
        return {
          ok: false,
          status: 409,
          body: { error: deleted.kind, workPackageIds: [...deleted.workPackageIds] },
        };
      return { ok: true, status: 204, body: EMPTY };
    }),
    bind(
      readProjectSettings,
      async ({ params, principal }): Promise<HttpReply<typeof readProjectSettings>> => {
        const projectId = params.id;
        const caller = await callerOf(principal);
        if (!caller.ok) return organizationRefusal(caller);
        const observed = await projects.readSettings(caller.caller, projectId);
        if (observed.ok)
          return {
            ok: true,
            status: 200,
            body: {
              settings: {
                ...observed.settings,
                calendarMarkers: [...observed.settings.calendarMarkers],
              },
            },
          };
        if ('refusal' in observed) return organizationRefusal(observed);
        return observed.reason === 'not_found'
          ? { ok: false, status: 404, body: { error: 'not_found' } }
          : {
              ok: false,
              status: 403,
              body: { error: 'forbidden', permission: observed.permission },
            };
      },
    ),
    bind(
      patchProjectSettings,
      async ({ params, principal, body }): Promise<HttpReply<typeof patchProjectSettings>> => {
        const projectId = params.id;
        const budgetFactor = body.budgetFactor;
        const caller = await callerOf(principal);
        if (!caller.ok) return organizationRefusal(caller);
        return settingsReply(await projects.writeSettings(caller.caller, projectId, budgetFactor));
      },
      { classifyRequestFailure: classifyProjectRequestFailure },
    ),
  ] as const;
}
