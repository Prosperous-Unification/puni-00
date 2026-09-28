import type { DomainChallenges } from '../ports/domain-challenges';
import type { MembershipAdministration } from '../ports/membership-administration';
import type { OrganizationAccess } from '../ports/organization-access';

/**
 * Pre-activation access for suites that are not about organizations: every
 * request resolves to `legacy`, which is what production's marker-reading
 * access answers before activation. Organization behaviour is tested against
 * `SqliteOrganizationAccess` in `project-organization.controller.db.test.ts`.
 */
export const legacyOrganizationAccess: OrganizationAccess = {
  resolve: () => Promise.resolve({ ok: true, access: { kind: 'legacy' } }),
};

/**
 * Membership administration for suites that are not about organizations. The
 * routes never reach it before activation, and these suites never activate,
 * so a call is a wiring fault and throws.
 */
export const refusingMemberships: MembershipAdministration = {
  administer: () =>
    Promise.reject(new Error('membership administration was reached in a pre-activation suite')),
};

/** Domain routes in unrelated suites throw if a test unexpectedly reaches them. */
export const refusingDomains: DomainChallenges = {
  resolver: {
    lookupTxt: () =>
      Promise.reject(new Error('domain resolver was reached in a pre-activation suite')),
  },
  listClaims: () =>
    Promise.reject(new Error('domain claims were reached in a pre-activation suite')),
  reissueClaim: () =>
    Promise.reject(new Error('domain challenges were reached in a pre-activation suite')),
  readPendingClaim: () =>
    Promise.reject(new Error('domain verification was reached in a pre-activation suite')),
  verifyClaim: () =>
    Promise.reject(new Error('domain promotion was reached in a pre-activation suite')),
  rotateClaim: () =>
    Promise.reject(new Error('domain rotation was reached in a pre-activation suite')),
  isVerifiedDomain: () =>
    Promise.reject(new Error('domain approval status was reached in a pre-activation suite')),
};
