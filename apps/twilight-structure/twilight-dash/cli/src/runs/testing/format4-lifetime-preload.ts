import { removeProcessRoot } from '@tools/test-scratch';
import { afterAll } from 'bun:test';

import {
  closeFormat4Lifetime,
  inspectFormat4Provider,
  installFormat4Lifetime,
} from './format4-provider';

installFormat4Lifetime();
afterAll(async () => {
  // Proof: Task3 076 put scratch removal in finally; a native-close failure retained its provider archive but deleted the generic scratch root, failing the parent retention assertion.
  await closeFormat4Lifetime();
  const provider = inspectFormat4Provider();
  if (provider !== undefined)
    console.log(
      JSON.stringify({
        event: 'format4-provider-closed',
        directory: provider.directory,
        sourceCommit: provider.sourceCommit,
        moduleLoadCount: provider.moduleLoadCount,
        leaseCount: provider.leaseCount,
        rss: process.memoryUsage().rss,
      }),
    );
  removeProcessRoot();
}, 30_000);
