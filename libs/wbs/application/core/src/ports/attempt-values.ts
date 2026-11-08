import type { Attempt, RunningAttempt } from '@wbs/domain';

/** One attempt on the step node it ran at: a leaf's work item and one of its project's steps. */
export type StoredAttempt = Attempt & { readonly workItemId: string; readonly stepId: string };

/** A {@link StoredAttempt} that is still running. */
export type RunningStoredAttempt = RunningAttempt & {
  readonly workItemId: string;
  readonly stepId: string;
};
