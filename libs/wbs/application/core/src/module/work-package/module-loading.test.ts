import { expect, test } from 'bun:test';

// Keep module acquisition inside the named observation: a missing declared DI
// export must fail this test, rather than disappearing into between-tests setup.
test('the work package module loads its declared live service export', async () => {
  const installed = await import('./module');
  expect(installed.workPackageModule).toBeDefined();
});
