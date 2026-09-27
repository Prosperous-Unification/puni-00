import type { OrganizationScope } from '@wbs/domain';

/**
 * How a protected request may reach organization-owned resources.
 *
 * `legacy` exists only while the durable activation marker says
 * `pre_activation`: every authenticated account keeps the deployment-wide
 * access it had before organizations. `scoped` is the only answer after
 * activation. There is deliberately no optional scope whose absence means
 * legacy: a caller that forgot to resolve access cannot compile.
 */
export type ResourceAccess =
  { readonly kind: 'legacy' } | { readonly kind: 'scoped'; readonly scope: OrganizationScope };

/**
 * Why an authenticated request may not act in any organization. Both answer a
 * typed 403: the credential is valid, the organization authority is not.
 *
 * - `no_active_organization`: the session carries no bound organization.
 * - `not_a_member`: the bound organization no longer lists the user, for
 *   example after removal while a token was still live.
 */
export type OrganizationAccessRefusal = 'no_active_organization' | 'not_a_member';

export type OrganizationAccessResolution =
  | { readonly ok: true; readonly access: ResourceAccess }
  | { readonly ok: false; readonly refusal: OrganizationAccessRefusal };

/**
 * Resolves one authenticated user's access for one request.
 *
 * Implementations re-read the activation marker on every call: blue and green
 * share SQLite, so another process can activate isolation while this one runs.
 *
 * @throws when trusted state (the marker, membership) is absent, unreadable or
 * malformed. That is a server fault and never a reason to answer `legacy`.
 */
export interface OrganizationAccess {
  resolve(userId: string): Promise<OrganizationAccessResolution>;
}
