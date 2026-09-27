import type { AllowancePercent } from '@wbs/domain';

import type { NewProject, Project, ProjectPatch, ProjectWithAccess } from './project-values';
import type { Step, StepAllowanceWritten } from './step-store';
import type { WriteStamp } from './write-stamp';
export type { NewProject, Project, ProjectPatch, ProjectWithAccess } from './project-values';

export interface ProjectStore {
  /**
   * Writes the project and its starting steps together. A project that existed
   * for even one request without steps would accept an estimate that had no
   * step to belong to, so the two are one transaction rather than two calls.
   */
  create(project: NewProject, steps: readonly Step[], stamp: WriteStamp): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  findBySolutionSlug(slug: string): Promise<Project | null>;
  /** Every project, newest first. Readable by any account, so it is not filtered by owner. */
  list(): Promise<Project[]>;
  /**
   * Every project in `userId`'s own order: the ones that account has opened
   * first, most recent before less recent, then the ones it never opened,
   * newest created first.
   *
   * Not a filter — every account still sees every project, because reading is
   * open. Only the order and the extra `lastOpenedAt` differ per caller; the
   * owner's name on each entry is the same for everybody asking.
   *
   * @throws when a listed project's owner id names no account. Every
   * implementation, the in-memory fixture included: a store that answered a
   * blank owner here would let a test pass against a list production refuses.
   */
  listFor(userId: string): Promise<ProjectWithAccess[]>;
  /**
   * Records the acting account as having opened `projectId` at the stamp's
   * instant, replacing whatever moment was recorded before. Idempotent by the
   * primary key rather than by asking first: two tabs opening one project at
   * once would both see "no row" and both insert.
   *
   * The stamp carries both halves this used to take separately — it was
   * `recordOpen(userId, projectId, at)` — because the account that opened the
   * project is the acting user and the moment it was opened is the instant of
   * the act. Two names for one fact is how the two drift apart.
   */
  recordOpen(projectId: string, stamp: WriteStamp): Promise<void>;
  /** Returns null when the project is gone. */
  update(id: string, patch: ProjectPatch, stamp: WriteStamp): Promise<Project | null>;
  stepsOf(projectId: string): Promise<Step[]>;
  /**
   * Sets one step's allowance, moves that step's allowance revision by one and
   * moves the project's revision, in one transaction, answering the allowance
   * it replaced. A step of another project is `not_found`.
   *
   * Here rather than on `StepStore` because the journalled edit is applied by
   * `WorkItemService`, which reads steps through this store already — see
   * `holdsStep`.
   */
  setStepAllowance(
    projectId: string,
    stepId: string,
    allowancePercent: AllowancePercent,
    stamp: WriteStamp,
  ): Promise<StepAllowanceWritten>;
  /**
   * Each of the project's steps' allowance revision, by step id.
   *
   * What an allowance undo is conditioned on. A revision rather than the value,
   * because a value can come back: 30% edited to 50% and back to 30% by
   * somebody else is still somebody else's work, and an undo compared on the
   * value would overwrite it.
   */
  stepAllowanceRevisions(projectId: string): Promise<ReadonlyMap<string, number>>;
}
