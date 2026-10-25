import type { PlanCommandKind } from '@wbs/contracts';
import { actingPersonOf, type CredentialPin } from '@wbs/contracts';
import type {
  BudgetExhausted,
  LeaseStanding,
  MeasureDefinition,
  MixedRateCards,
  ResourceUnits,
  WorkItemStatus,
} from '@wbs/domain';

import { AnnouncementCollector } from '../../ports/announcement-collector';
import type { UndoStack } from '../../ports/command-journal-values';
import type {
  Person,
  PersonWithTeams,
  Resource,
  ServiceTeam,
  TeamWithServices,
} from '../../ports/directory-values';
import {
  CREATOR_ADMISSION,
  type EditAdmission,
  grantAdmission,
  type GrantedAdmission,
  NO_ADMISSION,
} from '../../ports/edit-admission';
import { LEGACY_ACCESS, type ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { Service, Tag, WorkItemType } from '../../ports/work-item-values';
import type { DirectoryUsage, ResourceUsageCounts } from '../../service/directory-usage';
import { MOST_COMMANDS_IN_A_BATCH, type PlanCommand } from '../../service/plan-command';
import type { ResourceCapacityOutcome } from '../capacity/capacity.resource';
import type {
  DirectoryOutcome,
  RemoveDirectoryOutcome,
  RemoveResourceOutcome,
} from '../directory/directory.resource';
import type {
  NamedClaimHolder,
  NamedOccupancyHolder,
  PlainClaimReason,
  ReassignedClaimedStep,
} from '../work-item/claims';
import type {
  BudgetExhaustedOutcome,
  Collected,
  UndoOutcome,
  WorkItemOutcome,
} from '../work-item/work-item.resource';
import type {
  CommandAdmission,
  CommandDecision,
  CommandTransaction,
} from './admitted-scope.resource';
import { applyCommand, bindCommands, CommandContext, CommandRefused } from './command-bindings';
import { crossingRefusal, type PlainReason, refuseForeignReferences } from './command-references';
import type { PlanCommandServices } from './plan-command-graph';

export type { PlanCommandServices } from './plan-command-graph';

/**
 * The services a command batch can invoke, and `steps` for the
 * {@link BatchPrelude} a step edit renames through.
 */
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
  createResource: Resource;
  patchResource: Resource;
  createMeasure: MeasureDefinition;
  patchMeasure: MeasureDefinition;
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
  | (AppliedBase & {
      kind: Exclude<PlainKind, MintedKind | 'claimWorkItem' | 'assignSubtree'>;
      entity?: never;
      alreadyHeld?: never;
    })
  /** A subtree assignment names the leaf steps it reassigned while someone else held their claim (issue #669 F6). */
  | (AppliedBase & {
      kind: 'assignSubtree';
      entity?: never;
      alreadyHeld?: never;
      reassignedClaimedSteps: ReassignedClaimedStep[];
    })
  /** A claim says whether it wrote nothing and which claims hold the steps. */
  | (AppliedBase & {
      kind: 'claimWorkItem';
      entity?: never;
      alreadyHeld: boolean;
      claimIds: string[];
      assignedStepIds: string[];
      /** The units the claim newly acquired (`wbs-resources` R3, R4): past a leaf's first claim, only what its ask adds. */
      acquired: ResourceUnits[];
    })
  | (MintedBase & { kind: Extract<PlainKind, MintedKind>; entity?: never })
  | {
      [K in EntityKind]: (K extends MintedKind ? MintedBase : AppliedBase) & {
        kind: K;
        entity: CommandEntities[K];
      };
    }[EntityKind];

export type Refusal =
  | { reason: PlainReason; detail?: never }
  | {
      reason: 'deadline_before_project_start';
      detail: { workItemId: string; projectDayZero: string };
    }
  | { reason: 'descendant_step_on_leaf' | 'node_on_parent'; detail: { dependencyIds: string[] } }
  | {
      reason: 'referenced_by_step_parallel';
      detail: { nodes: { workItemId: string; stepId: string }[] };
    }
  | { reason: 'taken'; detail: { name: string } }
  /** A sum across two rate cards (`wbs-measure-budgets` D44), both named, null unpriced. */
  | { reason: 'mixed_rate_cards'; detail: { bases: MixedRateCards } }
  | { reason: 'in_use'; detail: { usage: DirectoryUsage } }
  /** A resource removal's refusal also counts what names it (`wbs-resources` R8). */
  | { reason: 'in_use'; detail: { usage: DirectoryUsage; counts: ResourceUsageCounts } }
  | { reason: PlainClaimReason; detail?: never }
  | { reason: 'not_startable'; detail: { status: WorkItemStatus } }
  | { reason: 'step_done'; detail: { stepIds: string[] } }
  | {
      reason: 'already_claimed' | 'destination_claimed' | 'children_claimed';
      detail: { holders: NamedClaimHolder[] };
    }
  | {
      reason: 'inside_subtree_claim' | 'overlaps_subtree_claim';
      detail: { holder: NamedClaimHolder };
    }
  | {
      reason: 'below_declared_demand';
      detail: { resourceId: string; asked: number; declared: number };
    }
  | {
      reason: 'below_held_occupancy';
      detail: { resourceId: string; asked: number; held: number };
    }
  | {
      reason: 'resources_exhausted';
      detail: {
        resourceId: string;
        asked: number;
        free: number;
        holders: NamedOccupancyHolder[];
        /** Every short resource in resource-id order; the fields above repeat the first. */
        resources: {
          resourceId: string;
          asked: number;
          free: number;
          holders: NamedOccupancyHolder[];
        }[];
      };
    }
  /** One more agent person than the organization's cap allows (`wbs-organization-limits` L9). */
  | { reason: 'agent_person_limit'; detail: { cap: number; current: number; added: number } }
  /** One more bound claim than the organization's cap allows (`wbs-organization-limits` L9). */
  | { reason: 'claim_limit'; detail: { cap: number; current: number } }
  /** More stated units of a resource than the organization's cap allows (`wbs-organization-limits` L9). */
  | {
      reason: 'capacity_limit';
      detail: { resourceId: string; cap: number; declared: number; asked: number };
    }
  /** A start a strict budget refuses (`wbs-measure-budgets` D69). */
  | { reason: 'budget_exhausted'; detail: BudgetExhausted };
/** A runtime refusal always carries its command index and recognized kind. */
export type BatchRefusal = { ok: false; at: number; kind: PlanCommandKind } & Refusal;
export type ServiceRefusal =
  | {
      ok: false;
      reason: 'referenced_by_step_parallel';
      nodes: readonly { workItemId: string; stepId: string }[];
    }
  | {
      ok: false;
      reason: 'destination_claimed' | 'children_claimed';
      holders: readonly NamedClaimHolder[];
    }
  | Extract<WorkItemOutcome<never>, { ok: false }>
  | BudgetExhaustedOutcome
  | { ok: false; reason: PlainReason }
  | {
      ok: false;
      reason: 'deadline_before_project_start';
      workItemId?: string;
      projectDayZero?: string;
    }
  | Extract<
      | DirectoryOutcome<never>
      | RemoveDirectoryOutcome
      | RemoveResourceOutcome
      | ResourceCapacityOutcome,
      { ok: false }
    >;

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
  /** Maps each admitted turn to command resources without exposing its source. */
  transaction: CommandTransaction;
  /**
   * The process graph used after the unit of work settles: reads and broadcasts
   * here observe the committed source and take their own turn.
   */
  publicServices: PlanCommandServices;
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
  // Proof: left out, `refuses assignSubtree with calendar_range and writes
  // nothing` (assignee-calendar.test.ts) applied the batch; watched 2026-10-20.
  'assignSubtree',
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

  /**
   * Under legacy access, with no credential pair: before activation no
   * credential is linked, so none is pinned (`link-credential-cli.ts` refuses).
   */
  run(projectId: string, actorId: string, commands: readonly PlanCommand[]): Promise<BatchOutcome> {
    return this.execute(projectId, actorId, commands, LEGACY_ACCESS, null).then(legacyOutcome);
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
    credential: CredentialPin | null,
  ): Promise<ScopedBatchOutcome> {
    return this.execute(projectId, actorId, commands, access, credential);
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
    credential: CredentialPin | null,
  ): Promise<ScopedBatchOutcome | PreludeRefusal<R>> {
    return this.execute(projectId, actorId, commands, access, credential, prelude);
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
    // A directory batch claims nothing, so it reads no credential pin.
    return this.execute(null, actorId, commands, access, null);
  }

  /**
   * A batch with no project: directory commands only, for the directory page
   * and for a model editing the directory on its own. Same turn, same unit of
   * work, and nothing is journalled — the directory has no undo. A plan
   * command in it has no project to land in and refuses the batch as
   * `project_required` at its index.
   */
  runDirectory(actorId: string, commands: readonly PlanCommand[]): Promise<BatchOutcome> {
    return this.execute(null, actorId, commands, LEGACY_ACCESS, null).then(legacyOutcome);
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
    credential: CredentialPin | null,
  ): Promise<ScopedBatchOutcome>;
  private execute<R>(
    projectId: string | null,
    actorId: string,
    commands: readonly PlanCommand[],
    access: ResourceAccess,
    credential: CredentialPin | null,
    prelude: BatchPrelude<R>,
  ): Promise<ScopedBatchOutcome | PreludeRefusal<R>>;
  private async execute<R>(
    projectId: string | null,
    actorId: string,
    commands: readonly PlanCommand[],
    access: ResourceAccess,
    credential: CredentialPin | null,
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
    const done = await this.opts.transaction
      .run<Applied>(
        async (scope): Promise<CommandDecision<Applied>> => {
          if (access.kind === 'scoped') {
            // Proof: skipping this admission made `answers 404 alike for a foreign
            // and an absent project` in `command-organization.controller.db.test.ts`
            // answer 200 instead of 404; watched 2026-09-27.
            const refusal = await scope.refuseOutsideScope(projectId, actorId, access.scope, {
              commands: commands.map(({ kind }) => kind),
            });
            if (refusal !== null) return { commit: false, value: { ok: false, refusal } };
            if (projectId !== null) grant = grantAdmission(projectId, actorId);
          }
          const workingPlan = scope.openCommandGraph(
            projectId,
            collector,
            admissionOf(access, grant),
          );
          // Proof: building from publicServices let the refused write survive:
          // expected [], received ["rolled back"] (2026-09-09).
          // Proof: caching the first graph made the subsequent batch omit `later`:
          // expected ["kept", "later"], received ["kept"] (2026-09-09).
          try {
            // Proof: retaining the first working graph across SQLite batches made
            // the second undo restore stale 4/5/6 figures instead of an intervening
            // ordinary write's 7/8/9 figures.
            const graph = workingPlan.services;
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
              this.applyAll(graph, scope, projectId, actorId, commands, access, credential),
            );
            if (projectId !== null) {
              // A claim that also assigns changes assignments as setAssignee
              // does; one that does not leaves the calendar alone.
              // Proof: with the claim arm replaced by `false`, `refuses a claim
              // that assigns past the calendar` (assignee-calendar.test.ts)
              // applied the claim; watched 2026-10-20.
              const needsCalendarPreflight = commands.some(
                (command) =>
                  CALENDAR_AFFECTING_KINDS.has(command.kind) ||
                  (command.kind === 'claimWorkItem' && command.assign === true),
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
                // Onto the stack of the person the credential acts as, so an
                // agent's batch never lands on its human's own undo.
                // Proof: with `null` for the person, every case of
                // `undo-acting-person.controller.db.test.ts` failed (0 pass,
                // 5 fail); watched 2026-10-26.
                await graph.workItems.recordCollected(
                  { projectId, userId: actorId, personId: actingPersonOf(credential) },
                  collected.recordings,
                );
                applied = collected;
              }
            } else {
              applied = collected;
            }
            // A committed batch by an agent renews its leases in this same
            // transaction, so the renewal takes no write turn of its own
            // (`wbs-claim-leases` L4).
            // Proof: with this renewal skipped, `renews an agent's lease on
            // every committed write, and not on a refused one`
            // (claim-lease.db.test.ts) read the old expiry (9 pass, 1 fail);
            // watched 2026-10-23.
            if (!('ok' in applied) && credential !== null && 'personId' in credential) {
              const renewal = await graph.workItems.renewLeases(credential.personId);
              // The renewal moves the agent's leases in every project. Each
              // moved project hears `claims_changed` through the collector, so
              // only after the commit and never for a rolled-back batch
              // (`wbs-claim-display` C19), except the batch's own project when
              // the batch is dirty: its `tree_replaced` refreshes the claims.
              // A batch that changed no row (empty, directory-only) announces
              // no tree, so its own project hears `claims_changed` too.
              // Proof (claim-lease.controller.db.test.ts, watched 2026-10-23):
              // with this loop removed, three announcing cases recorded none
              // (8 pass, 3 fail); with the own-project filter removed, `announces
              // once to each other project, none extra to its own` recorded the
              // batch's project too (9/2); with the dirty test removed,
              // `announces its own project for a batch that changed no row`
              // recorded none (10/1); with the SQLite store answering its due
              // projects before its write, `announces nothing when the batch
              // rolls back` recorded one. Publishing through the outer
              // broadcaster in place of the collector left every case green:
              // nothing in a batch can fail after its renewal, so the
              // collector's after-commit send has no negative here of its own.
              for (const renewedProjectId of renewal.renewedProjectIds)
                if (renewedProjectId !== projectId || !applied.dirty)
                  await collector.publish(renewedProjectId, { type: 'claims_changed' });
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
            workingPlan.close();
          }
        },
        // Proof: see `admissionOf`.
        () => grant?.expire(),
      )
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
    // Proof: with `null` for the person, `agent B's edit keeps agent A's redo,
    // and the human's` (undo-acting-person.controller.db.test.ts) read the
    // account's redoable stack (4 pass, 1 fail); watched 2026-10-26.
    const state = await afterCommit.workItems.undoState({
      projectId,
      userId: actorId,
      personId: actingPersonOf(credential),
    });
    return { ok: true, results: done.result, ...state };
  }

  /**
   * Releases the project's claims whose lease has run out, as one unit of
   * work of its own (`wbs-claim-leases` L7): expiry is read inside the turn,
   * so a renewal admitted before it has moved the lease and one admitted after
   * finds the claim gone. It admits no user's write (`NO_ADMISSION`): what it
   * writes is the coordinator's, recorded in history alone. Its announcement
   * leaves after the commit, as a batch's does. Answers the claims released.
   */
  async releaseExpiredLeases(projectId: string): Promise<number> {
    const collector = new AnnouncementCollector(this.opts.announcements);
    const released = await this.opts.transaction.run<number>(
      async (scope): Promise<CommandDecision<number>> => {
        const workingPlan = scope.openCommandGraph(projectId, collector, NO_ADMISSION);
        try {
          const count = await workingPlan.services.workItems.releaseExpiredLeases(projectId);
          return { commit: true, value: count };
        } finally {
          workingPlan.close();
        }
      },
    );
    await collector.send();
    return released;
  }

  /**
   * Renews `personId`'s leases outside any batch: the heartbeat route's
   * write, through the public graph, which reads first and takes the write
   * turn only when a lease is due (L4). Once the renewal has committed and let
   * go of the turn, it announces one type-only `claims_changed` to each
   * project in which it moved a lease (`wbs-claim-display` C4); a renewal
   * that moved nothing, or threw, announces nothing. A batch's own renewal
   * is announced by the batch (C19). Each announcement is transient (C21).
   *
   * The projects are announced in turn: a publish that throws answers 500
   * although the renewal committed, and leaves the later projects
   * unannounced until their next heartbeat. In production it does not throw:
   * the gateway broadcaster reports and swallows a failed transient push.
   */
  async renewLeases(personId: string): Promise<LeaseStanding> {
    const renewal = await this.opts.publicServices.workItems.renewLeases(personId);
    // Proof (claim-lease.controller.db.test.ts, watched 2026-10-23): with the
    // SQLite store answering its due projects before its turn and not awaiting
    // the write (announced before the commit), `announces nothing when the
    // renewal rolls back` recorded one (7 pass, 4 fail); answering every
    // project the person holds a lease in, moved or not (announced
    // unconditionally), `announces nothing for a heartbeat within the minute,
    // nor a refused one` recorded a second (4 pass, 7 fail).
    for (const projectId of renewal.renewedProjectIds)
      await this.opts.announcements.publish(projectId, { type: 'claims_changed' });
    return renewal.standing;
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
   * {@link undo} of `stack` through the caller's access. Under scoped access the project
   * and role are checked in the unit of work, the entry may not write a row of
   * another project, and a replay that leaves the project referencing
   * anything outside the organization is rolled back as `not_found`.
   */
  undoWithin(stack: UndoStack, access: ResourceAccess): Promise<UndoOutcome> {
    return this.walk(stack.projectId, stack.userId, access, 'undo', (graph) =>
      graph.workItems.undoWithin(stack, access),
    );
  }

  /** {@link redo} of `stack` through the caller's access; see {@link undoWithin}. */
  redoWithin(stack: UndoStack, access: ResourceAccess): Promise<UndoOutcome> {
    return this.walk(stack.projectId, stack.userId, access, 'redo', (graph) =>
      graph.workItems.redoWithin(stack, access),
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
    const walked = await this.opts.transaction
      .run<Collected<UndoOutcome>>(
        async (scope): Promise<CommandDecision<Collected<UndoOutcome>>> => {
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
            const refusal = await scope.refuseOutsideScope(projectId, actorId, access.scope, {
              journal,
            });
            if (refusal !== null) return refuse(refusal);
            grant = grantAdmission(projectId, actorId);
          }
          const graph = scope.openCommandGraph(
            null,
            collector,
            admissionOf(access, grant),
          ).services;
          const { workItems } = graph;
          const collected = await workItems.collect(() => step(graph));
          if (collected.result.ok && access.kind === 'scoped') {
            // A backstop behind `undoWithin`'s own reference check, which refuses
            // every case the suite plants first.
            // Proof: skipping this closure check together with that reference
            // check made `rolls back an undo that would restore a foreign label`
            // in `command-organization.controller.db.test.ts` answer 200 instead
            // of 404; watched 2026-09-27.
            const crossing = await scope.listCrossReferenceKinds(
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
                : async (repair) => {
                    // Proof: discarding through the rolled-back graph made the
                    // memory composition throw `no journal entry id-5` instead
                    // of consuming the committed stale entry (compose.test.ts).
                    // The repair writes no project, so it is granted nothing.
                    await repair.discardEntry(entryId, collector);
                  },
          };
        },
        () => grant?.expire(),
      )
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
    scope: CommandAdmission,
    projectId: string | null,
    actorId: string,
    commands: readonly PlanCommand[],
    access: ResourceAccess,
    credential: CredentialPin | null,
  ): Promise<AppliedCommand[]> {
    const refs = new Map<string, string>();
    const bindings = bindCommands(graph);
    const applied: AppliedCommand[] = [];
    for (const [index, command] of commands.entries()) {
      const context = new CommandContext(
        actorId,
        projectId,
        index,
        command.kind,
        refs,
        access,
        credential,
      );
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
        const crossing = await scope.listCrossReferenceKinds(
          projectId,
          access.scope.organizationId,
        );
        const first = crossing.at(0);
        if (first !== undefined) context.refuse({ reason: crossingRefusal(first) });
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
