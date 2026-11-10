import { Buffer } from 'node:buffer';

import { runLintChild } from '../lint-child';
import type { SubscribeLintInterrupts } from '../lint-interrupts';
import type { LintRuntime } from '../lint-runtime';

/** Caller-established native repository and independent frozen Git authority. */
export interface PreparationGitContext {
  readonly repository: string;
  readonly runtime: LintRuntime;
  readonly subscribeInterrupts: SubscribeLintInterrupts;
}

/** Run one owned preparation query, retaining byte output and original diagnostics. */
export async function runPreparationGit(
  argv: readonly string[],
  context: PreparationGitContext,
  stdin?: Uint8Array,
) {
  const errors: Uint8Array[] = [];
  const outcome = await runLintChild({
    argv: ['git', '-C', context.repository, ...argv],
    // Proof: capture-git-cwd; `requests each selected object once through explicit owned Git authority` failed under its recorded source fault and passed after restoration.
    directory: context.runtime.directory,
    // Proof: capture-git-environment; `requests each selected object once through explicit owned Git authority` failed under its recorded source fault and passed after restoration.
    environment: context.runtime.environment,
    stage: 'preparation Git',
    // Proof: capture-git-stdin; `captures committed binary bytes, modes and exact Unicode BOM whitespace paths without live checkout reads` failed under its recorded source fault and passed after restoration.
    stdin,
    stdout: () => ({ kind: 'written' }),
    stderr: (bytes) => {
      // Proof: capture-git-stderr; `refuses failed batch capture query with original diagnostics` failed under its recorded source fault and passed after restoration.
      errors.push(bytes.slice());
      return { kind: 'written' };
    },
    // Proof: capture-git-cancellation; `returns cancellation before parsing a captured batch prefix and confirms group absence` failed under its recorded source fault and passed after restoration.
    subscribeInterrupts: context.subscribeInterrupts,
  });
  return { ...outcome, stderr: Buffer.concat(errors) };
}
