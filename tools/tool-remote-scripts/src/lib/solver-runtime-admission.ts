import { lstat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import {
  assertNoEdgeOwner,
  isRetainedEdgeOwnerRefusal,
  throwRetainedSolverRefusal,
} from './edge-admission';
import { captureEdgePolicy } from './edge-policy';
import { withCanonicalLock } from './lock';
import { assertSame } from './managed-cohort';
import { verifyActiveSolverPolicy } from './solver-active-admission';
import { verifyRestoringSolverPolicy } from './solver-restoration';

/** Legacy startup admits only absent/ordinary policy with both markers absent under its lifetime lock. */
export function withSolverRuntimeAdmission<T>(
  action: () => Promise<T>,
  directory = '/home/puni1/wbs/state',
): Promise<T> {
  return withSolverAdmission('legacy', action, directory);
}

/** Required startup closes ordinary, restoring and complete initial active admission under the same lifetime lock. */
export function withSolverPolicyAdmission<T>(
  action: () => Promise<T>,
  directory = '/home/puni1/wbs/state',
): Promise<T> {
  return withSolverAdmission('required', action, directory);
}

async function withSolverAdmission<T>(
  mode: 'legacy' | 'required',
  action: () => Promise<T>,
  directory: string,
): Promise<T> {
  await assertSolverStateDirectory(directory);
  let retained: unknown;
  try {
    // Proof: runtime-precheck omission yielded exit 1 for 2 retained-owner/runtime-contention cases in solver-runtime-admission.proc.test.ts.
    await assertNoEdgeOwner(directory);
  } catch (cause) {
    if (!isRetainedEdgeOwnerRefusal(cause) || mode === 'legacy') throw cause;
    retained = cause;
    try {
      const opening = await captureEdgePolicy(directory);
      if (opening.policy.phase === 'ordinary') throw cause;
    } catch {
      throw cause;
    }
  }
  // Proof: substituting wrong-runtime.lock lost actual ready CLI contention
  // in solver-runtime-admission.proc.test.ts (runtime-lock mutation, exit 1).
  return withCanonicalLock(join(directory, 'solver-runtime.lock'), async () => {
    const deadline = performance.now() + 120000;
    try {
      // Proof: runtime-policy omission reached absent config with no policy;
      // solver-runtime-admission.proc.test.ts exited 1.
      const snapshot =
        mode === 'legacy'
          ? await captureOptionalSolverPolicy(directory)
          : await captureEdgePolicy(directory);
      if (snapshot === undefined || snapshot.policy.phase === 'ordinary') {
        // Proof: restoring-no-ordinary-fallback omission entered the callback after phase/marker substitution; phase-drift runtime test failed (exit 1).
        if (retained !== undefined) throw new Error('solver restoration policy phase changed');
        // Proof: omitting marker admission reached absent config under both retained
        // markers in solver-runtime-admission.proc.test.ts (runtime-marker mutation, exit 1).
        await assertNoEdgeOwner(directory);
        const closing =
          mode === 'legacy'
            ? await captureOptionalSolverPolicy(directory)
            : await captureEdgePolicy(directory);
        assertSame(snapshot, closing, 'solver ordinary policy readback');
      } else if (mode === 'legacy') {
        throw new Error('legacy solver runtime requires ordinary edge policy');
      } else {
        try {
          await assertNoEdgeOwner(directory);
        } catch (cause) {
          if (!isRetainedEdgeOwnerRefusal(cause)) throw cause;
          retained = cause;
        }
        if (snapshot.policy.phase === 'restoring') await verifyRestoringSolverPolicy(snapshot);
        else {
          await verifyActiveSolverPolicy(snapshot, deadline);
          if (performance.now() >= deadline)
            throw new Error('active solver admission deadline exceeded');
        }
      }
    } catch (cause) {
      // Proof: terminal-restoring-refusal omission changed wrong-executable admission from exit 78 to 1; actual built CLI test failed (exit 1).
      throwRetainedSolverRefusal(retained, cause);
    }
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

/** Only an absent fixed policy leaf permits legacy startup; malformed or unreadable bytes refuse. */
async function captureOptionalSolverPolicy(directory: string) {
  try {
    await lstat(join(directory, 'edge-policy.json'));
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return undefined;
    throw cause;
  }
  return captureEdgePolicy(directory);
}
