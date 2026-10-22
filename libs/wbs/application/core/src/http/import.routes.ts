import { importProject } from '@wbs/contracts';

import { classifyPlanDocument } from '../module/plan-document/plan-document.resource';
import type { ImportOutcome, ImportService } from '../module/plan-import/plan-import.feature';
import type { OrganizationAccess } from '../ports/organization-access';
import { bind, type HttpReply, type RequestFailure } from './endpoint';
import { organizationRefusal } from './organization-refusal';

type PlanImporter = Pick<ImportService, 'import'>;
type ImportReply = HttpReply<typeof importProject>;
type ImportRefusalReply = Extract<ImportReply, { ok: false }>;

function refusal(outcome: Extract<ImportOutcome, { code: string }>): ImportRefusalReply {
  if (outcome.code === 'forbidden') return { ok: false, status: 403, body: { error: 'forbidden' } };
  if (outcome.code === 'external_dependencies_inactive')
    return {
      ok: false,
      status: 409,
      body: { error: 'external_dependencies_inactive', detail: outcome.path },
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

async function classifyFailure(failure: RequestFailure): Promise<ImportRefusalReply> {
  if (failure.part !== 'body') {
    return {
      ok: false,
      status: 400,
      body: { error: 'invalid_body', path: failure.part, detail: null },
    };
  }
  const classified = await classifyPlanDocument(failure.rejected);
  return classified.ok
    ? { ok: false, status: 400, body: { error: 'invalid_body', path: '', detail: null } }
    : {
        ok: false,
        status: 400,
        body: { error: classified.code, path: classified.path, detail: null },
      };
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
      importProject,
      async ({ body, principal }): Promise<HttpReply<typeof importProject>> => {
        const classified = await classifyPlanDocument(body);
        if (!classified.ok)
          return {
            ok: false,
            status: 400,
            body: { error: classified.code, path: classified.path, detail: null },
          };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        // Proof: synthesizing an id/scopes-only principal failed exact binding/authentication/delegation preservation (import.routes.test.ts, 2026-10-22).
        const outcome = await imports.import(classified.value, {
          kind: 'human',
          principal,
          expectedAccess: resolved.access,
        });
        if (!outcome.ok) {
          if ('refusal' in outcome) return organizationRefusal(outcome);
          if ('error' in outcome) return { ok: false, status: 403, body: { error: outcome.error } };
          return refusal(outcome);
        }
        return {
          ok: true,
          status: 201,
          body: {
            projectId: outcome.projectId,
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
