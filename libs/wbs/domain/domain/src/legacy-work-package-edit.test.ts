import { describe, expect, it } from 'bun:test';

import { canEditLegacyWorkPackage } from './legacy-work-package-edit';

describe('canEditLegacyWorkPackage', () => {
  it('admits an unrestricted ordinary legacy edit without actor metadata', () => {
    expect(canEditLegacyWorkPackage({ restricted: false })).toBe(true);
  });
  it('refuses every restricted ordinary legacy edit', () => {
    expect(canEditLegacyWorkPackage({ restricted: true })).toBe(false);
  });
  it('does not recover retired owner or package creator authority', () => {
    const metadata = { restricted: true, ownerId: 'former-owner', createdBy: 'former-owner' };
    expect(canEditLegacyWorkPackage(metadata)).toBe(false);
  });
});
