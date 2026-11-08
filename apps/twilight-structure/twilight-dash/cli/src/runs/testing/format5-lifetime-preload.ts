import { afterAll } from 'bun:test';

import {
  closeFormat5Lifetime,
  inspectFormat5Provider,
  installFormat5Lifetime,
} from './format5-provider';

installFormat5Lifetime();
afterAll(async () => {
  await closeFormat5Lifetime();
  const provider = inspectFormat5Provider();
  if (provider !== undefined)
    console.log(
      JSON.stringify({
        event: 'format5-provider-closed',
        directory: provider.directory,
        sourceCommit: provider.sourceCommit,
        moduleLoadCount: provider.moduleLoadCount,
        leaseCount: provider.leaseCount,
        rss: process.memoryUsage().rss,
      }),
    );
  // The earlier format4 preload owns shared scratch deletion; this owner only releases its exact archive.
}, 30_000);
