import { type } from 'arktype';

import { responseSchema } from './schema-shape';

/**
 * An authenticated caller with no organization authority, answered before
 * any lookup so it reveals nothing about the addressed resource: no bound
 * active organization, no current membership in it, or a credential the
 * organization's rules refuse — enforced SSO (`sso_required`, naming the SSO
 * login path; `link` means "link your company sign-in, then sign in via SSO")
 * or its session policy (`reauthentication_required`, naming the bound
 * exceeded and a login path that forces a fresh sign-in).
 */
export const organizationRefusal = {
  status: 403,
  schema: responseSchema(
    type({ error: "'no_active_organization' | 'not_a_member'" })
      .or({ error: "'sso_required'", organizationId: 'string', login: 'string', link: 'true' })
      .or({
        error: "'reauthentication_required'",
        organizationId: 'string',
        reason: "'max_session' | 'reauthenticate_after'",
        login: 'string',
      }),
  ),
} as const;

/** A stale browser expectation cannot redirect a resource operation to a newly selected organization. */
export const organizationContextRefusal = {
  status: 409,
  schema: responseSchema(type({ error: "'organization_context_changed'" })),
} as const;
