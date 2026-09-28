import { describe, expect, it } from 'bun:test';

import { canEditProjectInOrganization, canWriteInOrganization } from './organization-access';
import { ORGANIZATION_ROLES } from './stored-vocabularies';

const scope = (role: (typeof ORGANIZATION_ROLES)[number], userId = 'ada') => ({
  organizationId: 'org-a',
  userId,
  role,
});

describe('canWriteInOrganization', () => {
  it('lets every role but viewer create and edit ordinary resources', () => {
    expect(ORGANIZATION_ROLES.filter((role) => canWriteInOrganization(role))).toEqual([
      'super_admin',
      'admin',
      'member',
    ]);
  });
});

describe('canEditProjectInOrganization', () => {
  const open = { ownerId: 'grace', restricted: false };
  const restricted = { ownerId: 'grace', restricted: true };

  it('lets a member edit an unrestricted project and refuses a viewer', () => {
    expect(canEditProjectInOrganization(open, scope('member'))).toBe(true);
    expect(canEditProjectInOrganization(open, scope('viewer'))).toBe(false);
  });

  it('refuses a viewer even on a restricted project the viewer created', () => {
    expect(canEditProjectInOrganization(restricted, scope('viewer', 'grace'))).toBe(false);
  });

  it('lets only the creator edit a restricted project, whatever the other role', () => {
    expect(canEditProjectInOrganization(restricted, scope('member', 'grace'))).toBe(true);
    for (const role of ['member', 'admin', 'super_admin'] as const) {
      expect(canEditProjectInOrganization(restricted, scope(role))).toBe(false);
    }
  });
});
