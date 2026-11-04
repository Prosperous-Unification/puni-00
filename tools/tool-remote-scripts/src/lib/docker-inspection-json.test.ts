import { expect, test } from 'bun:test';

import { envLayout } from './env';
import { inspectManagedCohort } from './managed-cohort';

test('managed full inventory diagnostics exclude malformed credential excerpts', async () => {
  let caught: unknown;
  try {
    await inspectManagedCohort(
      envLayout('prod'),
      (args) =>
        Promise.resolve(
          args[0] === 'ps' ? 'a'.repeat(64) : '[{"Config":{"Env":[PRIVATE_MANAGED_SENTINEL]}}]',
        ),
      performance.now() + 10000,
    );
  } catch (cause) {
    caught = cause;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(String(caught)).not.toContain('PRIVATE_MANAGED_SENTINEL');
  if (caught instanceof Error) {
    expect(caught.stack).not.toContain('PRIVATE_MANAGED_SENTINEL');
    expect(caught.cause).toBeUndefined();
  }
});
