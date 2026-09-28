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
