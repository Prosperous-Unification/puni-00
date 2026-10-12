import type { DomainChallenges } from '../ports/domain-challenges';
import type { EnterpriseConnections } from '../ports/enterprise-connections';
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
  listMembers: () =>
    Promise.reject(new Error('member listing was reached in a pre-activation suite')),
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
  readClaimForVerification: () =>
    Promise.reject(new Error('domain verification was reached in a pre-activation suite')),
  verifyClaim: () =>
    Promise.reject(new Error('domain promotion was reached in a pre-activation suite')),
  rotateClaim: () =>
    Promise.reject(new Error('domain rotation was reached in a pre-activation suite')),
  releaseClaim: () =>
    Promise.reject(new Error('domain release was reached in a pre-activation suite')),
  isVerifiedDomain: () =>
    Promise.reject(new Error('domain approval status was reached in a pre-activation suite')),
};

/**
 * Enterprise connections for suites that are not about enterprise SSO. Their
 * routes refuse before activation, and these suites route no login by slug or
 * email and sign no enterprise subject in, so any call is a wiring fault.
 */
export const refusingEnterpriseConnections: EnterpriseConnections = {
  list: () => Promise.reject(new Error('SSO connections were listed in a suite not about SSO')),
  create: () => Promise.reject(new Error('an SSO connection was created in a suite not about SSO')),
  update: () => Promise.reject(new Error('an SSO connection was changed in a suite not about SSO')),
  setEnforced: () =>
    Promise.reject(new Error('SSO enforcement was switched in a suite not about SSO')),
  remove: () => Promise.reject(new Error('an SSO connection was deleted in a suite not about SSO')),
  routeBySlug: () =>
    Promise.reject(new Error('a login was routed by slug in a suite not about SSO')),
  routeByDomain: () =>
    Promise.reject(new Error('a login was routed by email in a suite not about SSO')),
  reauthenticationRoute: () =>
    Promise.reject(new Error('a reauthentication login was routed in a suite not about SSO')),
  provenFor: () =>
    Promise.reject(new Error('an enterprise subject was resolved in a suite not about SSO')),
  linkThroughConnection: () =>
    Promise.reject(new Error('a link was routed through a connection in a suite not about SSO')),
};
