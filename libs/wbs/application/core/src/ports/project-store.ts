import type { AllowancePercent } from '@wbs/domain';

import type { NewProject, Project, ProjectPatch, ProjectWithAccess } from './project-values';
import type { Step, StepAllowanceWritten } from './step-store';
import type { WriteStamp } from './write-stamp';
export type { NewProject, Project, ProjectPatch, ProjectWithAccess } from './project-values';

/**
 * Every relation {@link ProjectStore.findCrossReferences} follows, as the
 * reconciliation names it. Closed, so a consumer that maps each kind to a
 * refusal cannot silently miss one.
 */
export const PROJECT_CROSS_REFERENCE_KINDS = [
  'estimate_step',
  'actual_step',
  'step_progress_step',
  'step_measure_step',
  'assignment_step',
  'assignment_person',
  'work_item_tag',
  'work_item_team',
  'work_item_type',
  'work_item_service_link',
  'work_item_external_ref',
  'work_item_service_team',
  'work_item_service',
  'work_item_parent',
  'dependency_endpoint',
  'project_team_capacity',
  'incoming_step_row',
  'incoming_parent',
  'incoming_dependency',
] as const;

export type ProjectCrossReferenceKind = (typeof PROJECT_CROSS_REFERENCE_KINDS)[number];

/** One reference that leaves the project or its organization; see {@link ProjectStore.findCrossReferences}. */
export interface ProjectCrossReference {
  /** Which relation it is. */
  readonly kind: ProjectCrossReferenceKind;
  /** The referring row, as the reconciliation identifies it. */
  readonly id: string;
}

export interface ProjectStore {
  /**
   * Writes the project and its starting steps together. A project that existed
   * for even one request without steps would accept an estimate that had no
   * step to belong to, so the two are one transaction rather than two calls.
   */
  create(project: NewProject, steps: readonly Step[], stamp: WriteStamp): Promise<Project>;
  /**
   * {@link create} plus the project's organization mapping, in one transaction.
   * Only an activated deployment's scoped creation calls it.
   */
  createInOrganization(
    project: NewProject,
    steps: readonly Step[],
    stamp: WriteStamp,
    organizationId: string,
  ): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  /** {@link findById} confined to one organization; null alike for a foreign or absent id. */
  findInOrganization(id: string, organizationId: string): Promise<Project | null>;
  /**
   * Every reference the project's schedule read would follow out of
   * `organizationId` or out of the project: a per-step row on another
   * project's step, a work item's parent or dependency endpoint in another
   * project, and a team, service, tag, type, external system, assignee or
   * capacity team that the organization does not own (an unmapped one
   * included). Also every reference **into** the project from another: a
   * per-step row of another project's work item on this project's step, a
   * work item of another project under one of this project's rows, and a
   * dependency filed under another project with an endpoint here. A write to
   * this project would otherwise change those rows. Empty for a coherent
   * project.
   */
  findCrossReferences(
    projectId: string,
    organizationId: string,
  ): Promise<readonly ProjectCrossReference[]>;
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
  /** {@link listFor} confined to one organization's projects. */
  listForInOrganization(userId: string, organizationId: string): Promise<ProjectWithAccess[]>;
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
  /**
   * {@link recordOpen} only while `organizationId` owns the project, checked in
   * the write's own transaction; false, and nothing recorded, otherwise.
   */
  recordOpenInOrganization(
    projectId: string,
    stamp: WriteStamp,
    organizationId: string,
  ): Promise<boolean>;
  /** Returns null when the project is gone. */
  update(id: string, patch: ProjectPatch, stamp: WriteStamp): Promise<Project | null>;
  /** {@link update} with the ownership predicate in the write; null when not the organization's. */
  updateInOrganization(
    id: string,
    patch: ProjectPatch,
    stamp: WriteStamp,
    organizationId: string,
  ): Promise<Project | null>;
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
