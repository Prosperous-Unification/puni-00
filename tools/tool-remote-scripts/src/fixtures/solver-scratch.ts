import { rm } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';

type SolverChildObservations = readonly [
  exited: Promise<number>,
  stdout: Promise<unknown>,
  stderr: Promise<unknown>,
  ...continuations: Promise<unknown>[],
];

/**
 * Owns one existing scratch child through its caller's lexical async scope.
 * Acquire with `await using` before fixture construction. Explicit native launches
 * first register retirement, then supply their original exit and pipe promises.
 * Disposal waits for every original observation; pending or rejected observations
 * retain the root, including when an earlier retirement-marker write rejects.
 * No cancellation or replacement observation can authorize removal.
 */
export function createSolverScratch(prefix: string) {
  const root = scratchSync(prefix);
  const retirements: Promise<readonly PromiseSettledResult<unknown>[]>[] = [];
  return {
    root,
    requireRetirement() {
      const original = Promise.withResolvers<readonly PromiseSettledResult<unknown>[]>();
      retirements.push(original.promise);
      return async (observations: SolverChildObservations) => {
        original.resolve(await Promise.allSettled(observations));
      };
    },
    async [Symbol.asyncDispose]() {
      // Proof: bypassing original-retirement waiting removes the EACCES marker
      // fixture while its child/pipe remain live; marker-retirement control fails.
      const originals = (await Promise.all(retirements)).flat();
      const failures = originals.filter((original) => original.status === 'rejected');
      // Proof: omitting this refusal accepts a rejected original read and removes
      // its root; rejected-continuation lifecycle control fails its rejection oracle.
      if (failures.length > 0)
        throw new AggregateError(
          failures.map((original): unknown => original.reason),
          'solver fixture original retirement unknown',
        );
      // Proof: omitting removal fails settled/retired lifecycle roots; eager
      // removal fails the real held-child/root-retention case before retirement.
      await rm(root, { recursive: true });
    },
  };
}

/**
 * Registers before launch and reads only this exact fixture child's original pipes.
 * A launch/pipe-setup throw before original promises are captured leaves retirement
 * pending: an arbitrary launcher may already have started an unreturned child.
 */
export async function readSolverChild(
  scratch: ReturnType<typeof createSolverScratch>,
  launch: () => Bun.Subprocess<'ignore', 'pipe', 'pipe'>,
) {
  // Proof: omitting this registration lets a caller's EACCES marker failure
  // delete the still-live child's root; child-reader marker control fails.
  const observeRetirement = scratch.requireRetirement();
  const child = launch();
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  const code = child.exited;
  await observeRetirement([code, stdout, stderr]);
  return { child, stdout: await stdout, stderr: await stderr, code: await code };
}
