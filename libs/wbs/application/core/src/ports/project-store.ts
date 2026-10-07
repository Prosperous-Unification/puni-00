import type { AllowancePercent } from '@wbs/domain';

import type {
  NewProject,
  Project,
  ProjectCrossReference,
  ProjectPatch,
  ProjectWithAccess,
  RecoveryAuditDetail,
} from './project-values';
import type { Step, StepAllowanceWritten } from './step-store';
import type { WriteStamp } from './write-stamp';
export type {
  NewProject,
  Project,
  ProjectCrossReference,
  ProjectCrossReferenceKind,
  ProjectPatch,
  ProjectWithAccess,
  RecoveryAuditDetail,
} from './project-values';
export { PROJECT_CROSS_REFERENCE_KINDS } from './project-values';

export interface ProjectStore {
  /**
   * Writes the project and its starting steps together. A project that existed
   * for even one request without steps would accept an estimate that had no
   * step to belong to, so the two are one transaction rather than two calls.
   */
  create(project: NewProject, steps: readonly Step[], stamp: WriteStamp): Promise<Project>;
  /**
   * {@link create} plus the project's organization mapping, in one transaction.
   * Only an activated deployment's scoped creation calls it. A `solutionRef`
   * is written as the organization's own link.
   *
   * @throws when another of the organization's projects holds the slug; the
   * caller checks {@link findBySolutionSlugInOrganization} under its write lock.
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
  /**
   * {@link findBySolutionSlug} confined to one organization, filtered before
   * any row is decoded: a foreign project is null exactly like an absent slug,
   * even when its row could not be read. Matches the organization's own links
   * and the legacy links its projects kept from before activation.
   */
  findBySolutionSlugInOrganization(slug: string, organizationId: string): Promise<Project | null>;
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
  /**
   * {@link update} by `editor.actorId` in `organizationId`, authorized in the
   * write's own transaction against the project and the actor's membership as
   * they stand then (see `classifyProjectEdit`): an ordinary edit is written;
   * a super-admin's recovery of someone else's restricted project is written
   * with one `organization_audit` record ({@link RecoveryAuditDetail}) in the
   * same transaction; anything else is `forbidden` and writes nothing. Null,
   * before any permission check, when the organization does not own the
   * project. A patch that changes nothing writes and records nothing.
   *
   * A `solutionRef` is the organization's own (see `project_solution`): a slug
   * another of the organization's projects holds, by either representation, is
   * `solution_taken` and writes nothing; other organizations' slugs are never
   * consulted. A legacy pair the project held is cleared by any link write.
   */
  editInOrganization(
    id: string,
    patch: ProjectPatch,
    stamp: WriteStamp,
    organizationId: string,
    editor: { readonly actorId: string; readonly auditId: string },
  ): Promise<Project | null | 'forbidden' | 'solution_taken'>;
  /**
   * Authorizes `actorId`'s write to `projectId` in `organizationId` from the
   * membership and project as they stand inside the caller's open unit of
   * work, whose transaction must enclose the write: null, before any
   * permission is judged, when the organization does not own the project;
   * `forbidden` for a refused writer; `ordinary`; or `recovery`, a
   * super-admin's write to someone else's restricted project, after appending
   * one `organization_audit` record with `detail` to that transaction. A
   * rollback of the unit of work takes the record back with the write.
   */
  admitEditInOrganization(
    projectId: string,
    organizationId: string,
    actorId: string,
    detail: RecoveryAuditDetail,
  ): Promise<'ordinary' | 'recovery' | 'forbidden' | null>;
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
