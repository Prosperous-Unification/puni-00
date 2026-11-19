import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runForgeExecution } from './forge-execution';
import type { ForgeSupervisorContext } from './forge-supervisor-core';
export type { ForgeSupervisorContext } from './forge-supervisor-core';
export { hashWorktreePath, fingerprintWorktree, fingerprintSupervisor, supervisorActionOf, installDependencies, INSTALL_REQUIRED, SUPERVISOR_PATHS } from './forge-supervisor-state';
/** Internal trusted-source API: capture callers and execute its own observed compiled core. This is not an installed client entry or source fallback; it makes no selected-core byte/revision equivalence claim. Reusable calls return/throw and never exit. */
export async function superviseForge(root: string, supplied: ForgeSupervisorContext): Promise<number> {
  const context: ForgeSupervisorContext = {
    ...supplied, environment: { ...supplied.environment },
    selection: { ...supplied.selection, // Proof: the original Buffer.slice alias let a caller zero its Buffer after real install0;
      // the retained-input owner reached native joins/changed caller hash/unchanged disk then saw
      // development0 instead of1 (30 expects). This observes the outer constructor copy, not
      // independent inner-copy necessity or the later outcome assertions.
      bytes: Uint8Array.from(supplied.selection.bytes) },
    subscribeStop: supplied.subscribeStop, report: supplied.report,
  };
  const source = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  return await runForgeExecution(source, root, context);
}
