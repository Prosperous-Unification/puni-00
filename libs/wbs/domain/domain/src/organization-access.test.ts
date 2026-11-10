import { describe, expect, it } from 'bun:test';

import type { OrganizationScope } from './organization-access';
import * as access from './organization-access';

/** Legacy role authority has no callable domain API after the current-grant migration. */
describe('retired membership-label authorization', () => {
  for (const symbol of [
    'canWriteInOrganization',
    'mayBindAccountInOrganization',
    'mayDefineMeasuresInOrganization',
    'mayRemoveResourceInOrganization',
    'mayStateDirectoryCapacityInOrganization',
    'canEditProjectInOrganization',
    'mayAdministerMembership',
    'mayInvite',
    'classifyProjectEdit',
  ])
    it('does not expose ' + symbol, () => {
      expect(Reflect.has(access, symbol)).toBe(false);
    });
});

it('keeps compatibility labels outside the organization scope type contract', () => {
  const scope: OrganizationScope = { organizationId: 'org-a', userId: 'ada', cap: null };
  // @ts-expect-error Compatibility labels belong to explicit display, never authenticated scope evidence.
  const label: unknown = scope.role;
  expect(label).toBeUndefined();
});
