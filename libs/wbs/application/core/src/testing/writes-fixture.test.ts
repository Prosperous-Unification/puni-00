import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import { countingUnitOfWork } from './writes-fixture';

test('counting unit of work rejects unexpected store access and records rollback', async () => {
  const uow = countingUnitOfWork();
  await rejects(
    uow.run((scope) => Promise.resolve({ commit: true, value: scope.stores.projects })),
    /the counting unit of work has no stores; something asked it for projects/,
  );
  expect(uow.calls).toEqual(['begin', 'rollback']);
});
