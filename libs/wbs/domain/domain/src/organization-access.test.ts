import { describe, expect, it } from 'bun:test';

import {
  canEditProjectInOrganization,
  canWriteInOrganization,
  classifyProjectEdit,
  mayAdministerMembership,
  mayInvite,
} from './organization-access';
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

describe('mayAdministerMembership', () => {
  const everyChange = ORGANIZATION_ROLES.flatMap((current) =>
    [...ORGANIZATION_ROLES, null].map((requested) => ({ current, requested })),
  );
  const allowed = (actor: (typeof ORGANIZATION_ROLES)[number]) =>
    everyChange
      .filter(({ current, requested }) => mayAdministerMembership(actor, current, requested))
      .map(({ current, requested }) => `${current}->${requested ?? 'removed'}`);

  it('lets an admin move viewers and members between those roles, or remove them', () => {
    expect(allowed('admin')).toEqual([
      'member->member',
      'member->viewer',
      'member->removed',
      'viewer->member',
      'viewer->viewer',
      'viewer->removed',
    ]);
  });

  it('lets only a super-admin grant, revoke or remove an admin or super-admin role', () => {
    expect(allowed('super_admin')).toHaveLength(everyChange.length);
    expect(allowed('admin').some((change) => change.includes('admin'))).toBe(false);
  });

  it('refuses every administration to members and viewers', () => {
    expect(allowed('member')).toEqual([]);
    expect(allowed('viewer')).toEqual([]);
  });
});

describe('mayInvite', () => {
  it('lets an admin invite viewers and members, a super-admin also admins, and nobody super-admins', () => {
    const invitable = (actor: (typeof ORGANIZATION_ROLES)[number]) =>
      ORGANIZATION_ROLES.filter((role) => mayInvite(actor, role));
    expect(invitable('super_admin')).toEqual(['admin', 'member', 'viewer']);
    expect(invitable('admin')).toEqual(['member', 'viewer']);
    expect(invitable('member')).toEqual([]);
    expect(invitable('viewer')).toEqual([]);
  });
});

describe('classifyProjectEdit', () => {
  const open = { ownerId: 'grace', restricted: false };
  const restricted = { ownerId: 'grace', restricted: true };

  it("calls a super-admin's edit of someone else's restricted project a recovery", () => {
    expect(classifyProjectEdit(restricted, scope('super_admin'))).toBe('recovery');
    expect(classifyProjectEdit(restricted, scope('super_admin', 'grace'))).toBe('ordinary');
    expect(classifyProjectEdit(open, scope('super_admin'))).toBe('ordinary');
  });

  it('refuses every other non-creator of a restricted project, and every viewer', () => {
    for (const role of ['admin', 'member', 'viewer'] as const) {
      expect(classifyProjectEdit(restricted, scope(role))).toBe('refused');
    }
    expect(classifyProjectEdit(open, scope('viewer'))).toBe('refused');
    expect(classifyProjectEdit(restricted, scope('viewer', 'grace'))).toBe('refused');
  });
});
