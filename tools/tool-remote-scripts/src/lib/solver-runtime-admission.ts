import { readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { assertNoEdgeOwner, edgeStateDirectory } from './edge-admission';
import { withCanonicalLock } from './lock';

/**
 * Admits only a guarded supervisor, independently of installer edge.lock.
 * The callback must outlive every listener and request continuation. Existing
 * unguarded processes still require separate live adoption and drain evidence.
 */
export async function withSolverRuntimeAdmission<T>(
  action: () => Promise<T>,
  directory = edgeStateDirectory(),
): Promise<T> {
  // Proof: omitting normalized spelling guard admitted alias state callback
  // in solver-runtime-admission.test.ts (runtime-canonical mutation, exit 1).
  if (!isAbsolute(directory) || resolve(directory) !== directory)
    throw new Error('solver runtime requires canonical absolute state directory');
  // Proof: omitting enumeration admitted execute/write-only trusted state in
  // solver-runtime-admission.test.ts (runtime-directory mutation, exit 1).
  await readdir(directory);
  // Proof: substituting wrong-runtime.lock lost actual ready CLI contention
  // in solver-runtime-admission.proc.test.ts (runtime-lock mutation, exit 1).
  return withCanonicalLock(join(directory, 'solver-runtime.lock'), async () => {
    // Proof: omitting marker admission reached absent config under both retained
    // markers in solver-runtime-admission.proc.test.ts (runtime-marker mutation, exit 1).
    await assertNoEdgeOwner(directory);
    return action();
  });
}
