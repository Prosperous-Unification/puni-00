import type { PlanCommandKind } from '@wbs/contracts';
import { canWriteInOrganization, type OrganizationScope } from '@wbs/domain';

import { AnnouncementCollector } from '../../ports/announcement-collector';
import type {
  DirectoryCatalog,
  Person,
  PersonWithTeams,
  ServiceTeam,
  TeamWithServices,
} from '../../ports/directory-store';
import {
  CREATOR_ADMISSION,
  type EditAdmission,
  grantAdmission,
  type GrantedAdmission,
  NO_ADMISSION,
} from '../../ports/edit-admission';
import { LEGACY_ACCESS, type ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectCrossReferenceKind, RecoveryAuditDetail } from '../../ports/project-store';
import type { PlanTransactionalStores } from '../../ports/stores';
import type { Decision, Scope, UnitOfWork } from '../../ports/unit-of-work';
import type { Service, Tag, WorkItemType } from '../../ports/work-item-store';
import type { DirectoryUsage } from '../../service/directory-usage';
import { MOST_COMMANDS_IN_A_BATCH, type PlanCommand } from '../../service/plan-command';
import type { StepService } from '../../service/step.service';
import type { WorkItemRefusal } from '../../service/work-item.service';
import type {
  Collected,
  UndoOutcome,
  WorkItemOutcome,
  WorkItemService,
} from '../../service/work-item.service';
import type { CapacityService } from '../capacity/capacity.resource';
import type {
  DirectoryOutcome,
  DirectoryRefusal,
  RemoveDirectoryOutcome,
} from '../directory/directory.resource';
import type { DirectoryService } from '../directory/directory.resource';
import type { PriorityBandService } from '../priority-band/priority-band.resource';
import { applyCommand, bindCommands, CommandContext, CommandRefused } from './command-bindings';
import { createWorkingPlan } from './working-plan.resource';

/**
 * The services a command batch can invoke, and `steps` for the
 * {@link BatchPrelude} a step edit renames through.
 */
export interface PlanCommandServices {
  workItems: WorkItemService;
  steps: StepService;
  directory: DirectoryService;
  capacity: CapacityService;
  priorityBands: PriorityBandService;
}

/**
 * What one step of an applied batch produced: the id of anything it created,
 * and for a directory create or patch the entry as its list route shows it —
 * the browser's `addTeam`/`renameTag` answer with the row, and a second read
 * for what the batch just wrote would be the round trip this route removes.
 */
export interface AppliedBase {
  index: number;
  ref?: string;
  id?: string;
}
interface CommandEntities {
  createTeam: ServiceTeam;
  // Proof: widening to ServiceTeam made the actual producer type fixture report TS2578.
  patchTeam: TeamWithServices;
  // Proof: widening to ServiceTeam made the missing-person-kind type fixture report TS2578.
  createPerson: Person;
  patchPerson: PersonWithTeams;
  createTag: Tag;
  patchTag: Tag;
  createService: Service;
  patchService: Service;
  createWorkItemType: WorkItemType;
  patchWorkItemType: WorkItemType;
}
type EntityKind = keyof CommandEntities;
type PlainKind = Exclude<PlanCommandKind, EntityKind>;
type MintedKind =
  | 'createWorkItem'
  | 'duplicateWorkItem'
  | 'addTypedDependency'
  | Extract<EntityKind, `create${string}`>;
// Proof: making minted id optional produced two TS2578 diagnostics in the created-result fixtures.
export type MintedBase = AppliedBase & { id: string };
/** Internal kind identifies the producer's exact entity contract; controllers erase it from the unchanged wire. */
export type AppliedCommand =
  | (AppliedBase & { kind: Exclude<PlainKind, MintedKind>; entity?: never })
  | (MintedBase & { kind: Extract<PlainKind, MintedKind>; entity?: never })
  | {
      [K in EntityKind]: (K extends MintedKind ? MintedBase : AppliedBase) & {
        kind: K;
        entity: CommandEntities[K];
      };
    }[EntityKind];

type PlainReason =
  | Exclude<
      WorkItemRefusal,
      'deadline_before_project_start' | 'descendant_step_on_leaf' | 'node_on_parent'
    >
  | DirectoryRefusal
  | 'calendar_range'
  | 'too_many_commands'
  | 'project_required'
  | 'unknown_ref'
  | 'missing_id'
  | 'duplicate_ref';
export type Refusal =
  | { reason: PlainReason; detail?: never }
  | {
      reason: 'deadline_before_project_start';
      detail: { workItemId: string; projectDayZero: string };
    }
  | { reason: 'descendant_step_on_leaf' | 'node_on_parent'; detail: { dependencyIds: string[] } }
  | { reason: 'taken'; detail: { name: string } }
  | { reason: 'in_use'; detail: { usage: DirectoryUsage } };
/** A runtime refusal always carries its command index and recognized kind. */
export type BatchRefusal = { ok: false; at: number; kind: PlanCommandKind } & Refusal;
export type ServiceRefusal =
  | Extract<WorkItemOutcome<never>, { ok: false }>
  | { ok: false; reason: PlainReason }
  | {
      ok: false;
      reason: 'deadline_before_project_start';
      workItemId?: string;
      projectDayZero?: string;
    }
  | Extract<DirectoryOutcome<never> | RemoveDirectoryOutcome, { ok: false }>;

export type BatchOutcome =
  { ok: true; results: AppliedCommand[]; undoable: boolean; redoable: boolean } | BatchRefusal;

/**
 * A batch refused whole under scoped access, before any command ran: the
 * organization does not own the project (answered exactly as for an absent
 * one), or the caller's role or the restricted-creator rule forbids writing.
 */
export interface WholeBatchRefusal {
  ok: false;
  refusal: 'not_found' | 'forbidden';
}

/** What a batch run through the caller's access answers. */
export type ScopedBatchOutcome = BatchOutcome | WholeBatchRefusal;

/**
 * A write that is not a command but must settle with a batch: a step rename
 * sent in the same edit as its allowance. It runs first, in the batch's unit
 * of work and through the batch's own graph, so what it announces leaves only
 * if the batch commits. It answers null to let the batch run, or a refusal,
 * which rolls it back and answers instead of the batch. It is not journalled.
 */
export type BatchPrelude<R> = (graph: PlanCommandServices) => Promise<R | null>;

/** A batch whose {@link BatchPrelude} refused: nothing it or the batch wrote remains. */
export interface PreludeRefusal<R> {
  ok: false;
  prelude: R;
}

export interface PlanCommandRunnerOptions {
  /**
   * The batch's own service graph, built **per batch** over the admitted scope
   * and broadcaster this runner hands it (D20/D24).
   *
   * A factory rather than the services themselves, and that is the whole of who
   * owns an announcement: every batch gets its own {@link AnnouncementCollector},
   * and the graph built over it publishes into that batch and nowhere else. A
   * route's graph is built over the direct broadcaster and is never this one, so
   * a committed route event cannot be dropped by somebody else's refusal.
   *
   * The scope is the unit of work's for this act. A staged source hands out new
   * stores on every run; retaining an earlier graph would write into discarded
   * state.
   *
   * The admission is who the graph's gated services let write: the creator
   * rule under legacy access, and under scoped access only the grant this
   * act's own unit of work established (see {@link grantAdmission}).
   */
  batchServices: (
    scope: Scope,
    broadcast: Broadcaster,
    admission: EditAdmission,
  ) => PlanCommandServices;
  /**
   * The process graph used after the unit of work settles: reads and broadcasts
   * here observe the committed source and take their own turn.
   */
  publicServices: PlanCommandServices;
  /**
   * What the batch is one of. It takes the source's one turn for the whole act
   * and settles every write together (ADR 0015).
   */
  uow: UnitOfWork;
  /**
   * Where a batch's collected announcements go once it has committed and let go
   * of its turn. The **direct** broadcaster: nothing between the runner and the
   * gateway holds anything back.
   */
  announcements: Broadcaster;
}

/**
 * Commands that can lengthen or reorder the placed plan's calendar horizon.
 * Proof: without `setStepAllowance` here, `is a typed 422 over HTTP and in a
 * batch, and changes nothing` (step-allowance-edit.controller.db.test.ts)
 * stored +1000% and answered 200; watched 2026-09-28.
 */
const CALENDAR_AFFECTING_KINDS: ReadonlySet<PlanCommandKind> = new Set([
  'patchWorkItem',
  'duplicateWorkItem',
  'setEstimate',
  'setAssignee',
  'addDependency',
  'setCapacity',
  'setStepAllowance',
]);

/**
 * Commands that can change the combined step-node dependency graph: its
 * edges, its tree, or which node a dynamic legacy anchor lands on. Each is
 * followed by a graph check that refuses at its own index.
 *
 * `removeDependency`, directory and field commands are absent because
 * removing an edge or renaming a row cannot close a cycle.
 */
const GRAPH_AFFECTING_KINDS: ReadonlySet<PlanCommandKind> = new Set([
  'createWorkItem',
  'moveWorkItem',
  'duplicateWorkItem',
  'deleteWorkItem',
  'setEstimate',
  'clearEstimate',
  'addDependency',
]);

/**
 * Applies a {@link Command batch}: every step through the service it belongs
 * to, as one {@link Unit of work} — one {@link Turn} at the source's write
 * coordinator, and every write settled together — then
 * one journal entry and one broadcast — `plan-commands` D2–D4 and ADR 0007.
 *
 * Refs are the batch's {@link CommandContext}: a create's id is remembered
 * under its `ref`, and any `…Ref` field is replaced by that id before the
 * bound service sees the step. A ref nobody minted, or minted twice, refuses
 * the batch at that step.
 *
 * Undo and redo run through here too, for the same reason a batch does: a
 * batch's inverse is many steps, and only the outer transaction can make a
 * step that fails midway take the ones before it back.
 */
export class PlanCommandRunner {
  constructor(private readonly opts: PlanCommandRunnerOptions) {}

  run(projectId: string, actorId: string, commands: readonly PlanCommand[]): Promise<BatchOutcome> {
    return this.execute(projectId, actorId, commands, LEGACY_ACCESS).then(legacyOutcome);
  }

  /**
   * {@link run} through the caller's access. Under scoped access the project
   * and the role are checked inside the batch's own unit of work, and every
   * command is held to the organization: see {@link applyAll}.
   */
  runWithin(
    projectId: string,
    actorId: string,
    commands: readonly PlanCommand[],
    access: ResourceAccess,
  ): Promise<ScopedBatchOutcome> {
    return this.execute(projectId, actorId, commands, access);
  }

  /**
   * {@link runWithin}, with `prelude` written first in the same unit of work:
   * the batch and the prelude's write settle together or not at all.
   */
  runAfterWithin<R>(
    projectId: string,
    actorId: string,
    prelude: BatchPrelude<R>,
    commands: readonly PlanCommand[],
    access: ResourceAccess,
  ): Promise<ScopedBatchOutcome | PreludeRefusal<R>> {
    return this.execute(projectId, actorId, commands, access, prelude);
  }

  /**
   * {@link runDirectory} through the caller's access. Under scoped access a
   * viewer is refused, and every directory command writes only the
   * organization's own entries under their organization-local names: see
   * `DirectoryService.addWithin` and its siblings.
   */
  runDirectoryWithin(
    actorId: string,
    commands: readonly PlanCommand[],
    access: ResourceAccess,
  ): Promise<ScopedBatchOutcome> {
    return this.execute(null, actorId, commands, access);
  }

  /**
   * A batch with no project: directory commands only, for the directory page
   * and for a model editing the directory on its own. Same turn, same unit of
   * work, and nothing is journalled — the directory has no undo. A plan
   * command in it has no project to land in and refuses the batch as
   * `project_required` at its index.
   */
  runDirectory(actorId: string, commands: readonly PlanCommand[]): Promise<BatchOutcome> {
    return this.execute(null, actorId, commands, LEGACY_ACCESS).then(legacyOutcome);
  }

  /**
   * The turn covers the unit of work and nothing after it: the broadcast is a
   * push to gw-01 over the network, and a turn held across it would let one
   * slow gateway stall every write in the process. Proof:
   * `plan-commands.test.ts` › lets go of the write lock before the broadcast
   * leaves — with the announce inside `lock.run` the second batch waited on a
   * publish held open and the test timed out.
   *
   * That rule used to be this method's alone, and three services it calls broke
   * it by publishing from inside `applyAll`. They publish through
   * this batch's own {@link AnnouncementCollector} now, held for the length of
   * the unit of work and drained here — so the rule is one mechanism rather
   * than four conventions.
   *
   * **The hold sits inside `lock.run`, not around it**, and that is not a
   * detail: `execute` runs concurrently for every queued batch and only the lock
   * makes one-at-a-time true. Held around the lock, a second batch opened a hold
   * while the first still waited for it, and the queue is process-wide.
   * Proof: with `hold` moved outside, `lets go of the write lock before the
   * broadcast leaves` and `applies a rename queued behind a refused batch, after
   * it` both failed on `error: a batch is already holding announcements`;
   * watched 2026-09-02. That *symptom* is gone since TASK-256 made the queue
   * per-caller — two concurrent holds now each get their own — but the ordering
   * is unchanged and for a second reason the symptom never named: the hold has
   * to open inside the unit of work's act and close before its decision, so
   * what it collects is exactly the writes that decision is about.
   */
  private execute(
    projectId: string | null,
    actorId: string,
    commands: readonly PlanCommand[],
    access: ResourceAccess,
  ): Promise<ScopedBatchOutcome>;
  private execute<R>(
    projectId: string | null,
    actorId: string,
    commands: readonly PlanCommand[],
    access: ResourceAccess,
    prelude: BatchPrelude<R>,
  ): Promise<ScopedBatchOutcome | PreludeRefusal<R>>;
  private async execute<R>(
    projectId: string | null,
    actorId: string,
    commands: readonly PlanCommand[],
    access: ResourceAccess,
    prelude?: BatchPrelude<R>,
  ): Promise<ScopedBatchOutcome | PreludeRefusal<R>> {
    // This batch's own collector and its own graph over it. Two batches never
    // share either, and no route's graph is built over this one.
    // Proof: reusing a constructor-owned collector made compose.test.ts receive
    // the same AnnouncementCollector for two batches at its identity assertion.
    const collector = new AnnouncementCollector(this.opts.announcements);
    type Applied = ScopedBatchOutcome | PreludeRefusal<R> | Collected<AppliedCommand[]>;
    // Scoped writes are admitted only through this act's own grant; a
    // directory batch names no project and is granted none.
    let grant: GrantedAdmission | null = null;
    const done = await this.opts.uow
      .run<Applied>(async (scope): Promise<Decision<Applied>> => {
        if (access.kind === 'scoped') {
          // Proof: skipping this admission made `answers 404 alike for a foreign
          // and an absent project` in `command-organization.controller.db.test.ts`
          // answer 200 instead of 404; watched 2026-09-27.
          const refusal = await refuseOutsideScope(scope.stores, projectId, actorId, access.scope, {
            commands: commands.map(({ kind }) => kind),
          });
          if (refusal !== null) return { commit: false, value: { ok: false, refusal } };
          if (projectId !== null) grant = grantAdmission(projectId, actorId);
        }
        const workingPlan = projectId === null ? undefined : createWorkingPlan(scope, projectId);
        // Proof: building from publicServices let the refused write survive:
        // expected [], received ["rolled back"] (2026-09-09).
        // Proof: caching the first graph made the subsequent batch omit `later`:
        // expected ["kept", "later"], received ["kept"] (2026-09-09).
        try {
          // Proof: retaining the first working graph across SQLite batches made
          // the second undo restore stale 4/5/6 figures instead of an intervening
          // ordinary write's 7/8/9 figures.
          const graph = this.opts.batchServices(
            workingPlan === undefined ? scope : { stores: workingPlan.stores },
            collector,
            admissionOf(access, grant),
          );
          // Proof: admitting one extra command returned404 instead of400 in the mounted cap-order case.
          const over = commands.at(MOST_COMMANDS_IN_A_BATCH);
          if (over !== undefined) {
            return {
              // Nothing was written, so there is nothing to undo — but the unit of
              // work opened for this act all the same, and `commit: false` is how
              // it is told to close without keeping anything. The transaction is
              // the unit of work's to open and to close; this method no longer
              // decides *when*, only *whether*.
              commit: false,
              value: {
                ok: false,
                at: MOST_COMMANDS_IN_A_BATCH,
                kind: over.kind,
                reason: 'too_many_commands',
              },
            };
          }
          // Proof: running the batch past a refused prelude set the allowance to
          // 30 in `writes no allowance when the rename is refused`
          // (step-allowance-edit.controller.db.test.ts); watched 2026-09-28.
          const preludeRefusal = prelude === undefined ? null : await prelude(graph);
          if (preludeRefusal !== null) {
            return { commit: false, value: { ok: false, prelude: preludeRefusal } };
          }
          let applied: Applied;
          const collected = await graph.workItems.collect(() =>
            this.applyAll(graph, scope.stores, projectId, actorId, commands, access),
          );
          if (projectId !== null) {
            const needsCalendarPreflight = commands.some(({ kind }) =>
              CALENDAR_AFFECTING_KINDS.has(kind),
            );
            const tree = needsCalendarPreflight ? await graph.workItems.tree(projectId) : null;
            if (needsCalendarPreflight && tree === null)
              throw new Error(`Project ${projectId} disappeared inside its command batch`);
            if (tree !== null && !('kind' in tree) && tree.scheduleError === 'calendar_range') {
              const last = commands.at(-1);
              if (last === undefined)
                throw new Error('A calendar-affecting batch completed without a command');
              applied = {
                ok: false,
                at: commands.length - 1,
                kind: last.kind,
                reason: 'calendar_range',
              };
            } else {
              await graph.workItems.recordCollected(projectId, actorId, collected.recordings);
              applied = collected;
            }
          } else {
            applied = collected;
          }
          // A refusal rolls the unit of work back, so whatever this batch collected
          // describes writes that will not be there. Dropped rather than sent —
          // which is one `if`, because the collector is this batch's alone.
          return 'ok' in applied
            ? { commit: false, value: applied }
            : { commit: true, value: applied };
        } catch (cause) {
          if (cause instanceof CommandRefused) {
            return {
              commit: false,
              value: { ok: false, at: cause.at, kind: cause.kind, ...cause.refusal },
            };
          }
          throw cause;
        } finally {
          // Proof: omitting this close let callbacks retained from successful,
          // refused and throwing batches keep reading after settlement.
          workingPlan?.close();
        }
      })
      // Proof: see `admissionOf`.
      .finally(() => grant?.expire());
    if ('ok' in done) return done;
    // After the commit and after the turn is let go, which is what the whole
    // collector is for.
    await collector.send();
    if (projectId === null)
      return { ok: true, results: done.result, undoable: false, redoable: false };
    // Through the public graph, because this runs after the collector has been
    // drained and the unit of work has settled. A staged graph may now name
    // discarded stores; its collector will never be drained again.
    const afterCommit = this.opts.publicServices;
    if (done.dirty) await afterCommit.workItems.announceTreeNow(projectId);
    const state = await afterCommit.workItems.undoState(projectId, actorId);
    return { ok: true, results: done.result, ...state };
  }

  undo(projectId: string, actorId: string): Promise<UndoOutcome> {
    return this.walk(projectId, actorId, LEGACY_ACCESS, 'undo', (graph) =>
      graph.workItems.undo(projectId, actorId),
    );
  }

  redo(projectId: string, actorId: string): Promise<UndoOutcome> {
    return this.walk(projectId, actorId, LEGACY_ACCESS, 'redo', (graph) =>
      graph.workItems.redo(projectId, actorId),
    );
  }

  /**
   * {@link undo} through the caller's access. Under scoped access the project
   * and role are checked in the unit of work, the entry may not write a row of
   * another project, and a replay that leaves the project referencing
   * anything outside the organization is rolled back as `not_found`.
   */
  undoWithin(projectId: string, actorId: string, access: ResourceAccess): Promise<UndoOutcome> {
    return this.walk(projectId, actorId, access, 'undo', (graph) =>
      graph.workItems.undoWithin(projectId, actorId, access),
    );
  }

  /** {@link redo} through the caller's access; see {@link undoWithin}. */
  redoWithin(projectId: string, actorId: string, access: ResourceAccess): Promise<UndoOutcome> {
    return this.walk(projectId, actorId, access, 'redo', (graph) =>
      graph.workItems.redoWithin(projectId, actorId, access),
    );
  }

  /**
   * One undo or redo as its own unit of work. A refusal rolls everything back —
   * a batch inverse that failed at step three has taken steps one and two back
   * too — and then discards the stale entry again through `afterRollback`,
   * because the service's own discard went with the rollback.
   */
  private async walk(
    projectId: string,
    actorId: string,
    access: ResourceAccess,
    journal: 'undo' | 'redo',
    step: (graph: PlanCommandServices) => Promise<UndoOutcome>,
  ): Promise<UndoOutcome> {
    const collector = new AnnouncementCollector(this.opts.announcements);
    let grant: GrantedAdmission | null = null;
    // The step's own broadcast is collected rather than sent, for the reason
    // `execute` gives: the push happens after the turn is let go.
    const walked = await this.opts.uow
      .run<Collected<UndoOutcome>>(async (scope): Promise<Decision<Collected<UndoOutcome>>> => {
        const refuse = (reason: 'not_found' | 'forbidden') => ({
          commit: false as const,
          value: {
            result: { ok: false as const, reason, detail: null },
            recordings: [],
            dirty: false,
          },
        });
        if (access.kind === 'scoped') {
          // Proof: skipping this admission made `refuses undo and redo of a
          // foreign project as of an absent one` in
          // `command-organization.controller.db.test.ts` answer the foreign
          // undo with 409 instead of 404; watched 2026-09-27.
          const refusal = await refuseOutsideScope(scope.stores, projectId, actorId, access.scope, {
            journal,
          });
          if (refusal !== null) return refuse(refusal);
          grant = grantAdmission(projectId, actorId);
        }
        const graph = this.opts.batchServices(scope, collector, admissionOf(access, grant));
        const { workItems } = graph;
        const collected = await workItems.collect(() => step(graph));
        if (collected.result.ok && access.kind === 'scoped') {
          // A backstop behind `undoWithin`'s own reference check, which refuses
          // every case the suite plants first.
          // Proof: skipping this closure check together with that reference
          // check made `rolls back an undo that would restore a foreign label`
          // in `command-organization.controller.db.test.ts` answer 200 instead
          // of 404; watched 2026-09-27.
          const crossing = await scope.stores.projects.findCrossReferences(
            projectId,
            access.scope.organizationId,
          );
          if (crossing.length > 0) return refuse('not_found');
        }
        if (collected.result.ok) return { commit: true, value: collected };
        const entryId = collected.result.entryId;
        return {
          commit: false,
          value: { ...collected, dirty: false },
          // The discard the refusal owes, in the one window it can be made: the
          // service's own went back with the rollback, and a discard issued
          // after `run` returns would be a second batch queueing behind this
          // one (D28).
          //
          afterRollback:
            entryId === undefined
              ? undefined
              : async (repairScope) => {
                  // Proof: discarding through the rolled-back graph made the
                  // memory composition throw `no journal entry id-5` instead
                  // of consuming the committed stale entry (compose.test.ts).
                  // The repair writes no project, so it is granted nothing.
                  await this.opts
                    .batchServices(repairScope, collector, NO_ADMISSION)
                    .workItems.discardEntry(entryId);
                },
        };
      })
      .finally(() => grant?.expire());
    await collector.send();
    // The direct broadcaster, for `execute`'s reason: the collector has been
    // drained and will not be again.
    if (walked.dirty) {
      await this.opts.publicServices.workItems.announceTreeNow(projectId);
    }
    return walked.result;
  }

  /**
   * Applies every command in order. Under scoped access each command is also
   * held to the organization: a directory command writes through the
   * caller's access (see {@link CommandContext.access}), every work item, step,
   * parent, sibling and predecessor it names must be this project's, and after
   * it runs the project may reference nothing outside the organization — the
   * closure the schedule read checks — or the batch is refused at its index.
   */
  private async applyAll(
    graph: PlanCommandServices,
    stores: PlanTransactionalStores,
    projectId: string | null,
    actorId: string,
    commands: readonly PlanCommand[],
    access: ResourceAccess,
  ): Promise<AppliedCommand[]> {
    const refs = new Map<string, string>();
    const bindings = bindCommands(graph);
    const applied: AppliedCommand[] = [];
    for (const [index, command] of commands.entries()) {
      const context = new CommandContext(actorId, projectId, index, command.kind, refs, access);
      // Proof: removing this check made the mounted cross-project estimate test fail:
      // Expected: 404 / Received: 200 (2026-09-27).
      if (projectId !== null && ('workItemId' in command || 'workItemRef' in command)) {
        // Proof: checking the literal ID before resolving this context made a batch-created
        // ref plus ignored missing ID return 404 instead of 200 (mounted, 2026-09-27).
        const workItemId = context.id(
          'workItemId' in command && typeof command.workItemId === 'string'
            ? command.workItemId
            : undefined,
          'workItemRef' in command && typeof command.workItemRef === 'string'
            ? command.workItemRef
            : undefined,
        );
        if (
          workItemId !== null &&
          !(await graph.workItems.hasWorkItemInProject(projectId, workItemId))
        ) {
          context.refuse({ reason: 'not_found' });
        }
      }
      if (projectId !== null && 'addressedBy' in command && command.addressedBy === 'node') {
        // Proof: skipping this validation made mounted clearEstimate cases return 200
        // for a parent (expected 409) and an unknown step (expected 404), 2026-09-27.
        const refusal = await graph.workItems.validateStepNode(
          projectId,
          context.required(command.workItemId, command.workItemRef),
          command.stepId,
        );
        if (refusal !== null) context.refuse({ reason: refusal });
      }
      if (access.kind === 'scoped') {
        if (projectId !== null) {
          await refuseForeignReferences(graph, projectId, command, context, access.scope);
        }
      }
      applied.push(await applyCommand(bindings, command, context));
      // Asked of the state this command left, inside the batch's transaction:
      // the refusal names this command and rolls every write back.
      // Proof: this check skipped made the mounted `refuses a legacy link that
      // closes a step-node cycle`, `refuses an estimate clearing that moves a
      // legacy anchor into a cycle` and `refuses a move that brings a
      // successor under its own whole predecessor` fail on `Expected: 409,
      // Received: 200`; watched 2026-09-27.
      // Proof: bypassing addDependency's service cycle refusal still left `refuses a
      // later legacy add that closes an SS cycle and rolls back the batch` at 409;
      // also omitting addDependency from this runner guard made it receive 200
      // instead of 409. Both faults restored; watched 2026-09-28.
      if (projectId !== null && GRAPH_AFFECTING_KINDS.has(command.kind)) {
        const cycle = await graph.workItems.findDependencyCycle(projectId);
        if (cycle !== null) {
          context.refuse({ reason: cycle.kind === 'self_node' ? 'self_node' : 'cycle' });
        }
      }
      if (access.kind === 'scoped' && projectId !== null) {
        // Proof: skipping this check made `refuses a foreign service, team,
        // tag, type, person and predecessor, all or none` in
        // `command-organization.controller.db.test.ts` answer 200 instead of
        // 404 `unknown_service` for the first case; watched 2026-09-27.
        const crossing = await stores.projects.findCrossReferences(
          projectId,
          access.scope.organizationId,
        );
        const first = crossing.at(0);
        if (first !== undefined) context.refuse({ reason: crossingRefusal(first.kind) });
      }
    }
    return applied;
  }
}

/**
 * The admission a batch or journal walk's graph is built with: the creator
 * rule under legacy access; under scoped access the unit of work's own grant,
 * or {@link NO_ADMISSION} when it granted none. Scoped access never falls back
 * to the creator rule.
 *
 * Proof, watched 2026-09-28: answering `CREATOR_ADMISSION` for scoped access
 * made `recovers a restricted project through a batch, undo and redo, one
 * record each` in `command-organization.controller.db.test.ts` answer 403 and
 * `never falls back to the creator rule under scoped access` in
 * `plan-command-admission.test.ts` fail; skipping either `expire`, or granting
 * the journal repair, failed that file's grant-lifetime cases.
 */
function admissionOf(access: ResourceAccess, grant: GrantedAdmission | null): EditAdmission {
  if (access.kind === 'legacy') return CREATOR_ADMISSION;
  return grant === null ? NO_ADMISSION : grant.admission;
}

/** A legacy run can never be refused whole: that refusal exists only under scoped access. */
function legacyOutcome(outcome: ScopedBatchOutcome): BatchOutcome {
  if ('refusal' in outcome) throw new Error('a legacy batch was refused as out of scope');
  return outcome;
}

/**
 * Why a scoped caller may not run a batch, undo or redo at all, checked in the
 * act's own unit of work: a project the organization does not own is
 * `not_found`, exactly as an absent one; a viewer, or anyone but the creator
 * of a restricted project other than a super-admin, is `forbidden`. A
 * directory batch needs only a writing role. The role and the project are
 * read inside the unit of work, and a super-admin's write to someone else's
 * restricted project is admitted as a recovery whose audit record (`detail`)
 * commits or rolls back with it.
 *
 * @throws when the project already references something outside the
 * organization: corrupt trusted state that activation should have refused,
 * never a base to write on.
 */
async function refuseOutsideScope(
  stores: PlanTransactionalStores,
  projectId: string | null,
  actorId: string,
  scope: OrganizationScope,
  detail: RecoveryAuditDetail,
): Promise<'not_found' | 'forbidden' | null> {
  if (projectId === null) return canWriteInOrganization(scope.role) ? null : 'forbidden';
  const admitted = await stores.projects.admitEditInOrganization(
    projectId,
    scope.organizationId,
    actorId,
    detail,
  );
  if (admitted === null) return 'not_found';
  // Proof: skipping this refusal made `refuses a viewer every batch, undo
  // and redo` and `refuses a super-admin removed or demoted before the batch`
  // in `command-organization.controller.db.test.ts` answer 200; watched
  // 2026-09-28.
  if (admitted === 'forbidden') return 'forbidden';
  const crossing = await stores.projects.findCrossReferences(projectId, scope.organizationId);
  // Proof: skipping this check made `fails closed on a project that already
  // crosses its organization` in `command-organization.controller.db.test.ts`
  // answer 200 instead of 500; watched 2026-09-27.
  if (crossing.length > 0) {
    const kinds = [...new Set(crossing.map((reference) => reference.kind))].sort();
    throw new Error(
      `project "${projectId}" holds references outside its organization: ${kinds.join(', ')}`,
    );
  }
  return null;
}

/**
 * Refuses a command naming a row or step outside the project, for the
 * references a command can name without leaving them in the project's final
 * state — a removed dependency's predecessor, a cleared value's step, a
 * placement's parent or sibling — which the closure check after the command
 * would never see — and a capacity's team, which a cleared capacity leaves
 * nowhere at all.
 */
async function refuseForeignReferences(
  graph: PlanCommandServices,
  projectId: string,
  command: PlanCommand,
  context: CommandContext,
  scope: OrganizationScope,
): Promise<void> {
  const named = (id: unknown, ref: unknown): string | null =>
    context.id(typeof id === 'string' ? id : undefined, typeof ref === 'string' ? ref : undefined);
  const rows = [
    'predecessorId' in command || 'predecessorRef' in command
      ? named(
          'predecessorId' in command ? command.predecessorId : undefined,
          'predecessorRef' in command ? command.predecessorRef : undefined,
        )
      : null,
    'parentId' in command || 'parentRef' in command
      ? named(
          'parentId' in command ? command.parentId : undefined,
          'parentRef' in command ? command.parentRef : undefined,
        )
      : null,
    'afterId' in command || 'afterRef' in command
      ? named(
          'afterId' in command ? command.afterId : undefined,
          'afterRef' in command ? command.afterRef : undefined,
        )
      : null,
  ];
  // Proof: skipping this check made `refuses a foreign predecessor, parent,
  // sibling and step even where the final state would not show it` in
  // `command-organization.controller.db.test.ts` answer 200 instead of 404
  // for the removed foreign dependency; watched 2026-09-27.
  for (const id of rows) {
    if (id !== null && !(await graph.workItems.hasWorkItemInProject(projectId, id))) {
      context.refuse({ reason: 'not_found' });
    }
  }
  // Proof: skipping this check made `refuses clearing a foreign team's
  // capacity as it refuses an absent team's` in
  // `command-organization.controller.db.test.ts` answer 200 instead of 404;
  // watched 2026-09-27.
  // Proof: skipping this check made `refuses a foreign directory id exactly as
  // an absent one, before anything is written` in
  // `command-organization.controller.db.test.ts` answer `unknown_tag` for a
  // foreign team beside an absent tag and `unknown_team` for an absent team
  // beside it, telling the two apart; watched 2026-09-27.
  for (const [catalog, ids, reason] of directoryReferencesOf(command, context)) {
    if (ids.length === 0) continue;
    const owned = new Set(
      (await graph.directory.listWithin(catalog, { kind: 'scoped', scope })).map(
        (entry) => entry.id,
      ),
    );
    if (ids.some((id) => !owned.has(id))) context.refuse({ reason });
  }
  if (command.kind === 'setCapacity') {
    const teamId = context.required(command.teamId, command.teamRef);
    const owned = await graph.directory.listWithin('teams', {
      kind: 'scoped',
      scope,
    });
    // `not_found`, the answer the capacity service gives a team nobody holds.
    if (!owned.some((team) => team.id === teamId)) context.refuse({ reason: 'not_found' });
  }
  // Proof: skipping the step check alone made the same test answer 200 instead
  // of 404 `unknown_step` for the foreign-step `clearEstimate`; watched
  // 2026-09-27.
  if (
    'stepId' in command &&
    typeof command.stepId === 'string' &&
    !(await graph.workItems.hasStepInProject(projectId, command.stepId))
  ) {
    context.refuse({ reason: 'unknown_step' });
  }
}

/**
 * The directory entries a project command names, refs resolved, each with the
 * refusal an entry nobody holds already earns. Checked before the command runs:
 * the services validate these globally, so a foreign id would otherwise be
 * told apart from an absent one, and a label a patch sets and then drops (a
 * `serviceTeamId` beside `teamRefs: []`) would leave nothing for the closure.
 */
function directoryReferencesOf(
  command: PlanCommand,
  context: CommandContext,
): [DirectoryCatalog, readonly string[], PlainReason][] {
  if (command.kind === 'setAssignee') {
    const person = context.id(command.personId, command.personRef);
    return [['people', person === null ? [] : [person], 'unknown_person']];
  }
  if (command.kind !== 'patchWorkItem') return [];
  const { patch } = command;
  const teams = context.ids(patch.teamIds, patch.teamRefs);
  if (patch.serviceTeamId !== undefined && patch.serviceTeamId !== null) {
    teams.push(patch.serviceTeamId);
  }
  return [
    ['teams', teams, 'unknown_team'],
    ['tags', context.ids(patch.tagIds, patch.tagRefs), 'unknown_tag'],
    ['services', context.ids(patch.serviceIds, patch.serviceRefs), 'unknown_service'],
    ['workItemTypes', context.ids(patch.typeIds, patch.typeRefs), 'unknown_type'],
    ['externalSystems', (patch.externalRefs ?? []).map((each) => each.systemId), 'unknown_system'],
  ];
}

/** The refusal a command earns for leaving the project referencing `kind` outside it. */
function crossingRefusal(kind: ProjectCrossReferenceKind): PlainReason {
  switch (kind) {
    case 'estimate_step':
    case 'actual_step':
    case 'step_progress_step':
    case 'step_measure_step':
    case 'assignment_step':
      return 'unknown_step';
    case 'assignment_person':
      return 'unknown_person';
    case 'work_item_tag':
      return 'unknown_tag';
    case 'work_item_team':
    case 'work_item_service_team':
    case 'project_team_capacity':
      return 'unknown_team';
    case 'work_item_type':
      return 'unknown_type';
    case 'work_item_service_link':
    case 'work_item_service':
      return 'unknown_service';
    case 'work_item_external_ref':
      return 'unknown_system';
    case 'work_item_parent':
    case 'dependency_endpoint':
    case 'incoming_step_row':
    case 'incoming_parent':
    case 'incoming_dependency':
      return 'not_found';
  }
}
