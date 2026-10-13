import type { MembershipRefusal, RefusedOrganizationAccess } from '../ports/organization-access';

/**
 * An authenticated caller with no organization authority as its typed 403,
 * never a lookup: a membership refusal by name, or a refused resolution with
 * the credential rule's whole body.
 */
export function organizationRefusal(refused: MembershipRefusal | RefusedOrganizationAccess) {
  if (typeof refused === 'string')
    return { ok: false, status: 403, body: { error: refused } } as const;
  switch (refused.refusal) {
    case 'organization_context_changed':
      return { ok: false, status: 409, body: { error: refused.refusal } } as const;
    case 'sso_required':
      return {
        ok: false,
        status: 403,
        body: {
          error: refused.refusal,
          organizationId: refused.organizationId,
          login: refused.login,
          link: refused.link,
        },
      } as const;
    case 'reauthentication_required':
      return {
        ok: false,
        status: 403,
        body: {
          error: refused.refusal,
          organizationId: refused.organizationId,
          reason: refused.reason,
          login: refused.login,
        },
      } as const;
    default:
      return { ok: false, status: 403, body: { error: refused.refusal } } as const;
  }
}
