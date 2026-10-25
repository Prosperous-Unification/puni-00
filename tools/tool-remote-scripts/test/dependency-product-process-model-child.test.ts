import { afterAll, mock } from 'bun:test';

import { consumeManifestTrace, observeConstructions } from './model-manifest-observer';

const context = consumeManifestTrace(process.env);
if (context !== undefined) {
  const { sourceDatabaseFixture } = await import('../src/fixtures/source-database-binding');
  const construct = sourceDatabaseFixture;
  const observer = observeConstructions(context, construct);
  await mock.module('../src/fixtures/source-database-binding', () => ({
    sourceDatabaseFixture: observer.call,
  }));
  afterAll(() => {
    observer.assertUsable();
  });
}

await import('../src/lib/dependency-product-process-model.model');
