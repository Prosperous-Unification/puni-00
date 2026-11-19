import { test as base } from '@playwright/test';

import type { OrdinaryFixture } from './ordinary-context';

export * from '@playwright/test';

/** Checks the strict run metadata once per worker before hooks and requested test fixtures. The reader loads only during worker execution, preserving discovery without browser-state reads. */
export const test = base.extend<Record<never, never>, { ordinaryRun: OrdinaryFixture }>({
  ordinaryRun: [
    // eslint-disable-next-line no-empty-pattern -- Test-only Playwright dependency syntax requires this empty pattern to declare zero worker-fixture dependencies.
    async ({}, use) => {
      const { readOrdinaryFixture } = await import('./ordinary-context');
      await use(readOrdinaryFixture());
    },
    { scope: 'worker', auto: true },
  ],
});

export default test;
