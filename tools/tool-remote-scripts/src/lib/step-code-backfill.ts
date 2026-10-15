/**
 * Codes the steps an older release left uncoded, through the path shipped in
 * the backend image. Run in the incoming container once the outgoing one has
 * stopped: until then an older writer can still insert a step without a code.
 */
export function backfillStepCodesCommand(container: string): string[] {
  return ['exec', container, 'bun', 'run', 'src/backfill-step-codes-cli.ts'];
}

/**
 * Runs the post-swap step-code backfill in `container` and answers what it
 * printed, or fails naming the command that finishes the job by hand.
 *
 * Backend swaps run this while the previous writer is stopped and before
 * exposing the candidate. Failure retains the interruption barrier and cannot
 * commit the swap. The operation is idempotent; the error names its manual command.
 *
 * @param container the incoming colour's be-01 container.
 * @param run executes a docker argument list and rejects on a non-zero exit —
 *   `swap.ts`'s `sh` in production.
 * @throws an error naming the container and the manual command, with the
 *   failure as its cause.
 */
export async function runStepCodeBackfill(
  container: string,
  run: (args: string[]) => Promise<string>,
): Promise<string> {
  const command = backfillStepCodesCommand(container);
  try {
    return await run(command);
  } catch (cause) {
    throw new Error(
      `step-code backfill failed on ${container}; the candidate has uncoded steps. ` +
        `Finish it by hand: docker ${command.join(' ')}`,
      { cause },
    );
  }
}
