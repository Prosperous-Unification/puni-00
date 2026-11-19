import { importWorkPackage } from '@wbs/contracts';

import { classifyPlanDocument } from '../module/plan-document/plan-document.resource';
import type { ImportOutcome, ImportService } from '../module/plan-import/plan-import.feature';
import type { OrganizationAccess } from '../ports/organization-access';
import { bind, type HttpReply, type RequestFailure } from './endpoint';
import { organizationRefusal } from './organization-refusal';
import { classifyParentBodyFailure } from './work-package-parent';

type PlanImporter = Pick<ImportService, 'import'>;
type ImportReply = HttpReply<typeof importWorkPackage>;
type ImportRefusalReply = Extract<ImportReply, { ok: false }>;

function refusal(outcome: Extract<ImportOutcome, { code: string }>): ImportRefusalReply {
  if (outcome.code === 'import_settings_conflict')
    return {
      ok: false,
      status: 409,
      body: { error: 'import_settings_conflict', key: outcome.key },
    };
  if(outcome.code==='unknown_step')return{ok:false,status:404,body:{error:outcome.code,path:outcome.path,detail:outcome.detail}};
  if(outcome.code==='step_not_resolved')return{ok:false,status:422,body:{error:outcome.code,path:outcome.path,detail:outcome.detail}};
  if(outcome.code==='type_conflict')return{ok:false,status:409,body:{error:outcome.code,path:outcome.path,detail:outcome.detail}};
  if (outcome.code === 'not_found') return { ok: false, status: 404, body: { error: 'not_found' } };
  if (outcome.code === 'forbidden')
    return {
      ok: false,
      status: 403,
      body: {
        error: 'forbidden',
        ...(outcome.permission === undefined ? {} : { permission: outcome.permission }),
      },
    };
  if (outcome.code === 'external_dependencies_inactive')
    return {
      ok: false,
      status: 409,
      body: { error: 'external_dependencies_inactive', detail: outcome.path },
    };
  if (outcome.code === 'agent_person_limit')
    return {
      ok: false,
      status: 409,
      body: {
        error: outcome.code,
        cap: outcome.cap,
        current: outcome.current,
        added: outcome.added,
      },
    };
  if (outcome.code === 'capacity_limit')
    return {
      ok: false,
      status: 409,
      body: {
        error: outcome.code,
        resourceId: outcome.resourceId,
        cap: outcome.cap,
        declared: outcome.declared,
        asked: outcome.asked,
      },
    };
  if (
    outcome.code === 'engine_unavailable' ||
    outcome.code === 'source_refused' ||
    outcome.code === 'abbreviation_taken' ||
    outcome.code === 'abbreviation_exhausted'
  ) {
    return {
      ok: false,
      status: 409,
      body: { error: outcome.code, path: outcome.path, detail: outcome.detail },
    };
  }
  return {
    ok: false,
    status: 400,
    body: { error: outcome.code, path: outcome.path, detail: outcome.detail },
  };
}

function classifyFailure(failure: RequestFailure): ImportRefusalReply {
  if (failure.part !== 'body') {
    return {
      ok: false,
      status: 400,
      body: { error: 'invalid_body', path: failure.part, detail: null },
    };
  }
  return classifyParentBodyFailure(failure);
}

/** Binds the archival request classifier to the atomic import service. */
/**
 * Imports resolve organization access before reading the document's
 * directory, so an unbound or removed caller learns nothing.
 * Proof: skipping the resolution made `refuses an unbound session and a
 * removed member before any import` in
 * `import-export-organization.controller.db.test.ts` answer 500 instead of
 * 403; watched 2026-09-27.
 */
export function importRoutes(imports: PlanImporter, organizations: OrganizationAccess) {
  return [
    bind(
      importWorkPackage,
      async ({ body, principal }): Promise<HttpReply<typeof importWorkPackage>> => {
        const classified = await classifyPlanDocument(body.document);
        if (!classified.ok)
          return {
            ok: false,
            status: 400,
            body: { error: classified.code, path: classified.path, detail: null },
          };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        // Proof: synthesizing an id/scopes-only principal failed exact binding/authentication/delegation preservation (import.routes.test.ts, 2026-10-22).
        const outcome = await imports.import(
          classified.value,
          {
            kind: 'human',
            principal,
            expectedAccess: resolved.access,
          },
          body.projectId,
        );
        if (!outcome.ok) {
          if ('refusal' in outcome) return organizationRefusal(outcome);
          if ('error' in outcome) return { ok: false, status: 403, body: { error: outcome.error } };
          return refusal(outcome);
        }
        return {
          ok: true,
          status: 201,
          body: {
            workPackageId: outcome.workPackageId,
            rows: outcome.rows,
            created: outcome.created,
            solutionRef: outcome.solutionRef,
          },
        };
      },
      { classifyRequestFailure: classifyFailure },
    ),
  ] as const;
}
