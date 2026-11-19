import type { SubscribeLintInterrupts } from '../lint-interrupts';
import type { LintRuntime } from '../lint-runtime';
import { readLintCandidate,readRepositoryRoot } from '../run-lint';

/**
 * Establish supported Git and the native actual worktree root through the existing child owner.
 * Relative repository operands belong to the explicit caller; lookup stays in the independent
 * runtime. This reads no working-tree files, imposes no HEAD/clean-release admission and captures
 * no commit. The caller owns interruption and any unconfirmed child-cleanup lifetime.
 */
export function readBuildSource(
  request: { readonly repository: string; readonly revision: string },
  context: {
    readonly callerDirectory: string;
    readonly runtime: LintRuntime;
    readonly subscribeInterrupts: SubscribeLintInterrupts;
  },
) {
  return readLintCandidate(
    {
      version: 1,
      callerDirectory: context.callerDirectory,
      request: {
        command: 'lint',
        kind: 'committed',
        repository: request.repository,
        revision: request.revision,
      },
    },
    context.runtime,
    context.subscribeInterrupts,
  );
}

/** Select actual supported Git and native working root without manufacturing a revision or clean-release claim. */
export function readWorkingBuildSource(
  request:{readonly repository:string},
  context:{readonly callerDirectory:string;readonly runtime:LintRuntime;readonly subscribeInterrupts:SubscribeLintInterrupts},
){
  return readRepositoryRoot({repository:request.repository,callerDirectory:context.callerDirectory},context.runtime,context.subscribeInterrupts);
}
