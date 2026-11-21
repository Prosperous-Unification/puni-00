import { expect, it } from 'bun:test';

import {
  createAgentPool,
  listAgentPools,
  rekeyAgentPool,
  revokeAgentPool,
} from './agent-pool-shapes';
for (const endpoint of [listAgentPools, createAgentPool, rekeyAgentPool, revokeAgentPool]) {
  it('requires the catalog permission vocabulary at ' + endpoint.operationId, async () => {
    const accepts = async (body: unknown) => {
      for (const refusal of endpoint.refusals) {
        if (refusal.status !== 403) continue;
        const checked = await refusal.schema.validator['~standard'].validate(body);
        if (checked.issues === undefined) return true;
      }
      return false;
    };
    expect(await accepts({ error: 'forbidden', permission: 'organization.manage_directory' })).toBe(
      true,
    );
    expect(await accepts({ error: 'forbidden', permission: 'package.write' })).toBe(true);
    expect(await accepts({ error: 'forbidden', permission: 'unknown.permission' })).toBe(false);
    expect(await accepts({ error: 'forbidden', permission: 0 })).toBe(false);
    expect(await accepts({ error: 'forbidden' })).toBe(false);
  });
}
it('requires a catalog permission only for a forbidden pool cleanup cause', async () => {
  const accepts = async (body: unknown) => {
    for (const refusal of revokeAgentPool.refusals) {
      if (refusal.status !== 409) continue;
      const checked = await refusal.schema.validator['~standard'].validate(body);
      if (checked.issues === undefined) return true;
    }
    return false;
  };
  const partial = { error: 'persons_not_removed', poolId: 'pool', revokedCredentials: 1 };
  expect(await accepts(partial)).toBe(true);
  expect(await accepts({ ...partial, cause: 'last_super_admin' })).toBe(true);
  expect(await accepts({ ...partial, cause: 'forbidden', permission: 'package.write' })).toBe(true);
  expect(
    await accepts({ ...partial, cause: 'forbidden', permission: 'organization.manage_directory' }),
  ).toBe(true);
  expect(await accepts({ ...partial, cause: 'forbidden' })).toBe(false);
  expect(await accepts({ ...partial, cause: 'forbidden', permission: 'unknown.permission' })).toBe(
    false,
  );
  expect(await accepts({ ...partial, cause: 'forbidden', permission: 0 })).toBe(false);
});
