import { expect, it } from 'bun:test';

import { readOrganizationLimits } from './organization-limits-shapes';

it('requires the catalog permission vocabulary in the actual limits refusal contract', async () => {
  const accepts = async (body: unknown) => {
    for (const refusal of readOrganizationLimits.refusals) {
      if (refusal.status !== 403) continue;
      const checked = await refusal.schema.validator['~standard'].validate(body);
      if (checked.issues === undefined) return true;
    }
    return false;
  };
  expect(await accepts({ error: 'forbidden', permission: 'organization.read' })).toBe(true);
  expect(await accepts({ error: 'forbidden', permission: 'package.write' })).toBe(true);
  expect(await accepts({ error: 'forbidden', permission: 'organization.unknown' })).toBe(false);
  expect(await accepts({ error: 'forbidden', permission: 0 })).toBe(false);
  expect(await accepts({ error: 'forbidden' })).toBe(false);
});
