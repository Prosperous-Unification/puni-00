import { expect, it } from 'bun:test';

import {
  listComputeProviders,
  registerComputeProvider,
  removeComputeProvider,
  updateComputeProvider,
} from './compute-provider-shapes';

for (const endpoint of [
  listComputeProviders,
  registerComputeProvider,
  updateComputeProvider,
  removeComputeProvider,
]) {
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
