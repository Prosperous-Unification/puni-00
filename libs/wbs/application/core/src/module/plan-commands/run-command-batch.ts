import type { AuthenticatedUser } from '@wbs/contracts';

import type { ResourceAccess } from '../../ports/organization-access';
import type { PlanCommand } from '../../service/plan-command';
import type {
  BatchPrelude,
  PlanCommandRunner,
  PreludeRefusal,
  ScopedBatchOutcome,
} from './plan-commands.feature';

export type RunCommandBatchGraph = Pick<PlanCommandRunner, 'runWithin' | 'runDirectoryWithin'>;

export interface RunCommandBatchInput {
  readonly projectId: string | null;
  readonly actor: AuthenticatedUser;
  readonly commands: readonly PlanCommand[];
  /** The caller's organization access, resolved before the batch is admitted. */
  readonly access: ResourceAccess;
}

export type RunCommandBatchOutcome =
  ScopedBatchOutcome | { readonly ok: false; readonly error: 'insufficient_scope' };

/** Admits one authenticated plan command batch independently of any transport. */
export function runCommandBatch(
  graph: RunCommandBatchGraph,
  input: RunCommandBatchInput,
): Promise<RunCommandBatchOutcome> {
  if (!input.actor.scopes.includes('write')) {
    return Promise.resolve({ ok: false, error: 'insufficient_scope' });
  }
  return input.projectId === null
    ? graph.runDirectoryWithin(input.actor.id, input.commands, input.access)
    : graph.runWithin(input.projectId, input.actor.id, input.commands, input.access);
}

/**
 * {@link runCommandBatch} for one project, with `prelude` settled in the same
 * unit of work: see {@link PlanCommandRunner.runAfterWithin}.
 */
export function runCommandBatchAfter<R>(
  graph: Pick<PlanCommandRunner, 'runAfterWithin'>,
  input: RunCommandBatchInput & { readonly projectId: string },
  prelude: BatchPrelude<R>,
): Promise<RunCommandBatchOutcome | PreludeRefusal<R>> {
  // Proof: without this branch, `refuses a read-only actor before the prelude
  // or the runner can write` (admission.test.ts) answered ok:true; watched
  // 2026-09-28.
  if (!input.actor.scopes.includes('write')) {
    return Promise.resolve({ ok: false, error: 'insufficient_scope' });
  }
  return graph.runAfterWithin(
    input.projectId,
    input.actor.id,
    prelude,
    input.commands,
    input.access,
  );
}
