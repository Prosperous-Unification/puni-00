import { issueBearerContext } from '@wbs/contracts';

import { bind } from '../http/endpoint';
import { bearerContextCredential, type IssueBearerContext } from '../runtime/bearer-context';

/** Native session exchange for one selected organization and fixed direct audience. */
export function bearerContextRoutes(issue: IssueBearerContext) {
  return [
    bind(issueBearerContext, async ({ request, body }) => {
      // Proof (2026-09-28): skipping this check made `context route stays
      // inert before activation and production binding` answer 403 for an
      // empty organization id instead of 400.
      if (body.organizationId.length === 0)
        return { ok: false, status: 400, body: { error: 'invalid_body' } } as const;
      const credential = bearerContextCredential(request.headers);
      if (credential === null)
        return { ok: false, status: 401, body: { error: 'invalid_binding' } } as const;
      // Proof (2026-09-28): substituting x-wbs-organization for this body
      // selection made `issues a native direct context only for its own current
      // membership` answer 403 instead of 200 for ada's org-a selection.
      const outcome = await issue(credential, body.organizationId);
      switch (outcome.kind) {
        case 'issued':
          return { ok: true, status: 200, body: { token: outcome.token } } as const;
        case 'inactive':
          return { ok: false, status: 403, body: { error: 'context_inactive' } } as const;
        case 'invalid_binding':
          return { ok: false, status: 401, body: { error: 'invalid_binding' } } as const;
        case 'forbidden':
          return { ok: false, status: 403, body: { error: 'forbidden' } } as const;
      }
    }),
  ] as const;
}
