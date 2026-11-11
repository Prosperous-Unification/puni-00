import type { Permission } from './access-role';

/**
 * The organization a request acts in, the acting user, and its permission
 * cap. Current membership establishes presence; actual grants establish authority.
 * Only resolution of trusted session state and current membership produces
 * one; a caller-supplied organization id never does.
 *
 * Proof: retired-domain-canWriteInOrganization; reintroduced the retired callable.
 * 'does not expose canWriteInOrganization' (organization-access.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: retired-domain-mayBindAccountInOrganization; reintroduced the retired callable.
 * 'does not expose mayBindAccountInOrganization' (organization-access.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: retired-domain-mayDefineMeasuresInOrganization; reintroduced the retired callable.
 * 'does not expose mayDefineMeasuresInOrganization' (organization-access.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: retired-domain-mayRemoveResourceInOrganization; reintroduced the retired callable.
 * 'does not expose mayRemoveResourceInOrganization' (organization-access.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: retired-domain-mayStateDirectoryCapacityInOrganization; reintroduced the retired callable.
 * 'does not expose mayStateDirectoryCapacityInOrganization' (organization-access.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: retired-domain-canEditProjectInOrganization; reintroduced the retired callable.
 * 'does not expose canEditProjectInOrganization' (organization-access.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: retired-domain-mayAdministerMembership; reintroduced the retired callable.
 * 'does not expose mayAdministerMembership' (organization-access.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: retired-domain-mayInvite; reintroduced the retired callable.
 * 'does not expose mayInvite' (organization-access.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: retired-domain-classifyProjectEdit; reintroduced the retired callable.
 * 'does not expose classifyProjectEdit' (organization-access.test.ts) failed; restored GREEN, 2026-11-10.
 * Proof: scope-type-role; restored an optional compatibility role to OrganizationScope; only the intended TS2578 appeared.
 * organization-access.test.ts rejects this scope field with the sole unused-expect-error TS2578.
 */
export interface OrganizationScope {
  readonly organizationId: string;
  readonly userId: string;
  /** Contributor permissions for a machine/consent credential; null for an uncapped account. */
  readonly cap: ReadonlySet<Permission> | null;
  /**
   * Present, and true, when the request acts through a delegation or a
   * machine credential's direct context rather than as the user themself
   * (`wbs-machine-credentials` A24): such a request never removes a machine
   * credential, by route or by a person's cascade.
   */
  readonly delegated?: true;
}
