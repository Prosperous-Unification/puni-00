import type { Refusal } from '@wbs/contracts';

/** Explicit legacy access or one confirmed organization, captured by a resource runtime. */
export type OrganizationContext =
  { readonly kind: 'legacy' } | { readonly kind: 'active'; readonly organizationId: string };

export const LEGACY_ORGANIZATION: OrganizationContext = { kind: 'legacy' };

/** Refusals which withdraw all organization resources rather than only the addressed panel. */
export type OrganizationRefusal = Extract<
  Refusal,
  {
    error:
      | 'organization_context_changed'
      | 'no_active_organization'
      | 'not_a_member'
      | 'unauthenticated'
      | 'sso_required'
      | 'reauthentication_required';
  }
>;

/** One immutable organization and its runtime lifetime; never a source of server authority. */
export interface ResourceScope {
  readonly organization: OrganizationContext;
  readonly isCurrent: () => boolean;
  readonly refuse: (refusal: OrganizationRefusal) => void;
}

/** Organization identity participates in runtime ownership independently of account identity. */
export function sameOrganization(left: OrganizationContext, right: OrganizationContext): boolean {
  return left.kind === 'legacy'
    ? right.kind === 'legacy'
    : right.kind === 'active' && left.organizationId === right.organizationId;
}
