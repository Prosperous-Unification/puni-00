import { writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { captureEdgePolicy } from './edge-policy';
import { verifyActiveSolverPolicy } from './solver-active-admission';

for (const fault of ['expired', 'missing-pointer'] as const) {
  test(`actual active verifier refuses ${fault} before tuple or startup`, async () => {
    const root = scratchSync('solver-active-admission-');
    await writeFile(
      root + '/edge-policy.json',
      JSON.stringify({
        format: 'dependency-edge-policy',
        version: 1,
        phase: 'active',
        edgeState: root,
        ownerPublicationSha256: 'a'.repeat(64),
        handoff: { name: 'edge-owner-000001-handoff-complete.json', sha256: 'b'.repeat(64) },
      }),
      { mode: 0o600 },
    );
    const snapshot = await captureEdgePolicy(root);
    let refusal: unknown;
    try {
      await verifyActiveSolverPolicy(
        snapshot,
        performance.now() + (fault === 'expired' ? -1 : 120000),
      );
    } catch (cause) {
      refusal = cause;
    }
    expect(String(refusal)).toContain(
      fault === 'expired' ? 'active solver admission deadline exceeded' : 'edge-owner.json',
    );
  });
}
