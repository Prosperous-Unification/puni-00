import { fileURLToPath } from 'node:url';

import { mock } from 'bun:test';

const admission = await import('../lib/edge-admission');
const observer = await import('../lib/edge-init-observer');
await mock.module(fileURLToPath(new URL('../lib/edge-admission.ts', import.meta.url)), () => ({
  ...admission,
  requireInheritedEdgeLock: () => Promise.resolve(),
}));
await mock.module(fileURLToPath(new URL('../lib/edge-init-observer.ts', import.meta.url)), () => ({
  ...observer,
  runProductionInitAdoption: () =>
    Promise.resolve({
      attempt: 'synthetic-output-only',
      stage: 'prepared',
      packetSha256: 'a'.repeat(64),
      receiptDirectory: '/private/synthetic-output-only',
      receiptSha256: null,
    }),
}));
