import { moveWorkPackage } from '@wbs/contracts';

import type { OrganizationAccess } from '../ports/organization-access';
import type { ProjectCaller } from '../ports/project-administration';
import type { ProjectResource } from '../service/project.resource';
import { bind, type HttpReply, type RequestFailure } from './endpoint';
import { organizationRefusal } from './organization-refusal';

function classifyMoveRequestFailure(failure: RequestFailure) {
  return failure.code === 'invalid_body'
    ? ({ ok: false, status: 422, body: { error: failure.code } } as const)
    : ({ ok: false, status: 400, body: { error: failure.code } } as const);
}

/**
 * Retains both addressed identities and the complete authenticated principal
 * before request resolution; the required SQL port repeats current admission in
 * its writer. Legacy has no success. Storage-only kind/cross_organization never
 * become a public reply, and body fields cannot supply actor or organization.
 */
export function workPackageMoveRoutes(
  projects: ProjectResource,
  organizations: OrganizationAccess,
) {
  return [
    bind(
      moveWorkPackage,
      async ({ principal, params, body }): Promise<HttpReply<typeof moveWorkPackage>> => {
        principal = structuredClone(principal);
        const workPackageId = params.id;
        const targetProjectId = body.projectId;
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (resolved.access.kind === 'legacy')
          return organizationRefusal({ ok: false, refusal: 'no_active_organization' });
        const caller: ProjectCaller = {
          kind: 'human',
          principal,
          expectedAccess: resolved.access,
        };
        const moved = await projects.moveWorkPackage(caller, workPackageId, targetProjectId);
        if (moved === 'not_found') return { ok: false, status: 404, body: { error: 'not_found' } };
        if ('ok' in moved) {
          if ('refusal' in moved) return organizationRefusal(moved);
          if (moved.error === 'insufficient_scope')
            return { ok: false, status: 403, body: { error: moved.error } };
          return {
            ok: false,
            status: 403,
            body: { error: moved.error, permission: moved.permission },
          };
        }
        if (moved.kind === 'dependency_crosses_project')
          return {
            ok: false,
            status: 409,
            body: { error: moved.kind, dependencyIds: [...moved.dependencyIds] },
          };
        return {
          ok: true,
          status: 200,
          body: {
            workPackageId: moved.workPackageId,
            projectId: moved.projectId,
            revision: moved.revision,
            sourceProject: { id: moved.sourceProject.id, revision: moved.sourceProject.revision },
            targetProject: { id: moved.targetProject.id, revision: moved.targetProject.revision },
          },
        };
      },
      { classifyRequestFailure: classifyMoveRequestFailure },
    ),
  ] as const;
}
