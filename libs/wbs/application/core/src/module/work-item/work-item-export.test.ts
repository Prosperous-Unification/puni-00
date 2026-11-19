import {openTestSource} from '@wbs/store-memory/testing/owned-source-fixture';
import { testWorkItemService } from '@wbs/store-memory/testing/service-fixtures';
import { expect, test } from 'bun:test';

import { LEGACY_ACCESS } from '../../ports/organization-access';
import type { PlanExportReader } from '../../ports/plan-export-reader';

test('export requires its supplied purpose reader even when ordinary livePlans is absent', async () => {
  const workItems = testWorkItemService(openTestSource()),
    calls: unknown[] = [];
  const reader: PlanExportReader = {
    readExport: (id, access) => {
      calls.push({ id, access });
      return Promise.resolve({ kind: 'not_found' });
    },
  };
  expect(await workItems.exportWithin('selected', LEGACY_ACCESS, reader)).toEqual({
    kind: 'not_found',
  });
  expect(calls).toEqual([{ id: 'selected', access: LEGACY_ACCESS }]);
});

test('export preserves an actual capture refusal and never substitutes an ordinary tree read', async () => {
  const workItems = testWorkItemService(openTestSource());
  const reader: PlanExportReader = {
    readExport: () => Promise.resolve({ kind: 'access_refused', refusal: 'not_a_member' }),
  };
  expect(await workItems.exportWithin('selected', LEGACY_ACCESS, reader)).toEqual({
    kind: 'access_refused',
    refusal: 'not_a_member',
  });
});

test('export propagates the supplied capture failure without a late store fallback', async () => {
  const workItems = testWorkItemService(openTestSource()),
    failure = new Error('owned capture unavailable');
  const reader: PlanExportReader = { readExport: () => Promise.reject(failure) };
  const caught = await workItems.exportWithin('selected', LEGACY_ACCESS, reader).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(caught).toBe(failure);
});
