import { lstat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { assertNoEdgeOwner, edgeStateDirectory } from './edge-admission';
import { readOrdinaryEdgePolicy } from './edge-policy';
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
  await assertSolverStateDirectory(directory);
  // Proof: runtime-precheck omission yielded exit 1 for 2 retained-owner/runtime-contention cases in solver-runtime-admission.proc.test.ts.
  await assertNoEdgeOwner(directory);
  // Proof: substituting wrong-runtime.lock lost actual ready CLI contention
  // in solver-runtime-admission.proc.test.ts (runtime-lock mutation, exit 1).
  return withCanonicalLock(join(directory, 'solver-runtime.lock'), async () => {
    // Proof: omitting marker admission reached absent config under both retained
    // markers in solver-runtime-admission.proc.test.ts (runtime-marker mutation, exit 1).
    await assertNoEdgeOwner(directory);
    return action();
  });
}

/** Requires the mandatory ordinary policy under the same process-lifetime runtime lock. */
export async function withSolverPolicyAdmission<T>(
  action: () => Promise<T>,
  directory = edgeStateDirectory(),
): Promise<T> {
  await assertSolverStateDirectory(directory);
  // Proof: policy-precheck omission yielded exit 1 for 2 retained-owner/runtime-contention cases in solver-runtime-admission.proc.test.ts.
  await assertNoEdgeOwner(directory);
  return withCanonicalLock(join(directory, 'solver-runtime.lock'), async () => {
    // Proof: runtime-policy omission reached absent config with no policy;
    // solver-runtime-admission.proc.test.ts exited 1.
    await readOrdinaryEdgePolicy(directory);
    // Proof: policy-runtime-marker omission reached config under retained markers;
    // solver-runtime-admission.proc.test.ts exited 1.
    await assertNoEdgeOwner(directory);
    return action();
  });
}

async function assertSolverStateDirectory(directory: string): Promise<void> {
  // Proof: runtime canonical state tests refuse alias spellings before marker classification.
  if (!isAbsolute(directory) || resolve(directory) !== directory)
    throw new Error('solver runtime requires canonical absolute state directory');
  const state = await lstat(directory);
  // Proof: state-real-directory omission yielded exit 78 for 2 symlink-state cases in solver-runtime-admission.proc.test.ts.
  if (!state.isDirectory() || (await realpath(directory)) !== directory)
    throw new Error('solver runtime requires canonical real state directory');
  // Proof: state-readable omission yielded exit 78 for 2 unreadable-state cases in solver-runtime-admission.proc.test.ts.
  await readdir(directory);
}
