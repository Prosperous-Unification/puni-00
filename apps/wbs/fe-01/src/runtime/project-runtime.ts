import { DiBag } from 'di-bag';

import type { RefreshResource } from '@/lib/plan-refresh';
import type { CalendarMarkers } from '@/modules/calendar-markers/contract';
import { type Channel, createChannel } from '@/modules/channel';
import type { PlanCommands } from '@/modules/plan-commands/contract';
import type { PlanFeedForReader } from '@/modules/plan-feed/composition';
import type { PlanFeed } from '@/modules/plan-feed/contract';
import {
  createDeliveredPlan,
  type DeliveredPlanStore,
} from '@/modules/plan-feed/delivered-plan-store';
import { createPresence, type PresenceStore } from '@/modules/plan-feed/presence-store';
import { type Busy, createBusy } from '@/modules/plan-writer/busy-store';
import type { PlanWriter } from '@/modules/plan-writer/contract';
import { createPlanWriter } from '@/modules/plan-writer/plan-writer.feature';
import type { PlanRefusal, ProjectRuntime, ProjectSource } from '@/modules/project/contract';
import type { Store } from '@/modules/store';

import { acquireTransactionally } from './application-runtime';
import {
  createLifetimeSlot,
  type LifetimeState,
  PartialAcquisitionError,
  type RetirableRuntime,
  RETIREMENT_BUDGET_MS,
  TransitionSupersededError,
} from './lifetime-slot';

/** What one project runtime is installed from: the project, its source, and its own liveness. */
export interface ProjectRuntimeDependencies extends ProjectSource {
  readonly projectId: string;
  /**
   * Whether this runtime is still the one its owner publishes, asked
   * synchronously at the moment anything happens.
   *
   * The owner's answer, not the runtime's: withdrawal happens in the owner, the
   * instant a transition is accepted, and a runtime cannot see it. Every guard
   * inside the runtime reads this and nothing else — see
   * {@link ProjectRuntime.isCurrent}.
   */
  readonly isCurrent: () => boolean;
}

/**
 * Installs one selected project's runtime: one DI Bag graph, built outside
 * React, publishing {@link ProjectRuntime} and nothing else.
 *
 * Synchronous, because the lifetime slot's `Acquire` is: every factory here is
 * a sync factory, which DI Bag runs inline, so the slot's generation fences
 * hold. The feed starts reading as soon as it is resolved, exactly as the
 * table's effect used to start it.
 *
 * **The feed is the graph's one owned disposable**, given back through
 * `DiBag.withDisposal` when the runtime's close runs: its refresh owner is
 * disposed and its stream unsubscribed then, once. The stores and channels hold
 * nothing that needs giving back.
 *
 * Four guards read the owner's `isCurrent`, and the first three are the
 * table's old reader guards moved to where the reader now is:
 *
 * - the feed hands nothing on — no publication, no refusal, no connection —
 *   once this runtime has been withdrawn;
 * - the refresh owner the writer and the marker gestures compare is `null`
 *   once it has, so a gesture begun after that sends nothing and one begun
 *   before it spends nothing against a replacement;
 * - a reread asked of it after that reads nothing;
 * - its stream tells its presence nothing more, so the roster of a project
 *   that has been left is never changed after it was left.
 *
 * @throws `PartialAcquisitionError` when a service cannot be resolved, carrying
 * the bounded close for whatever was acquired first — the feed above all,
 * whose reads have already started.
 */
export function installProjectRuntime({
  projectId,
  services,
  subscribe,
  isCurrent,
}: ProjectRuntimeDependencies): RetirableRuntime<ProjectRuntime> {
  /**
   * The stream the feed opens, telling this project's presence who is here and
   * whether the socket is up — only while this runtime is current, so a
   * withdrawn project's roster is never changed after it was left.
   */
  const streamInto = (presence: PresenceStore): PlanFeedForReader['subscribe'] =>
    subscribe === undefined
      ? undefined
      : (streamProjectId, handlers, baseline) =>
          subscribe(
            streamProjectId,
            {
              onChange: handlers.onChange,
              onConnectionChange: (connected) => {
                if (isCurrent()) presence.reportConnection(connected);
                handlers.onConnectionChange(connected);
              },
              onPresence: (users) => {
                if (isCurrent()) presence.reportUsers(users);
              },
            },
            baseline,
          );
  const bag = DiBag.createBuilder()
    .register({
      plan: DiBag.fromSyncFactory((): DeliveredPlanStore => createDeliveredPlan()),
      busy: DiBag.fromSyncFactory((): Busy => createBusy()),
      refusals: DiBag.fromSyncFactory((): Channel<PlanRefusal> => createChannel<PlanRefusal>()),
      commandsIssued: DiBag.fromSyncFactory((): Channel<undefined> => createChannel<undefined>()),
      presence: DiBag.fromSyncFactory((): PresenceStore => createPresence()),
    })
    .register({
      feed: DiBag.withDisposal(
        DiBag.fromSyncFactory(
          ({
            plan,
            presence,
            refusals,
          }: {
            plan: DeliveredPlanStore;
            presence: PresenceStore;
            refusals: Channel<PlanRefusal>;
          }): PlanFeed =>
            services.planFeedFor({
              projectId,
              subscribe: streamInto(presence),
              isActiveReader: isCurrent,
              plan,
              refusals,
            }),
        ),
        (feed) => {
          feed.close();
        },
      ),
    })
    .register({
      readRefreshOwner: DiBag.fromSyncFactory(
        ({ feed }: { feed: PlanFeed }) =>
          () =>
            isCurrent() ? feed.owner : null,
      ),
      reread: DiBag.fromSyncFactory(
        ({ feed }: { feed: PlanFeed }) =>
          async (resources: readonly RefreshResource[]): Promise<void> => {
            if (!isCurrent()) return;
            await feed.rereadResources(resources);
          },
      ),
    })
    .register({
      markers: DiBag.fromSyncFactory(
        ({
          readRefreshOwner,
          refusals,
        }: {
          readRefreshOwner: () => PlanFeed['owner'] | null;
          refusals: Channel<PlanRefusal>;
        }): CalendarMarkers =>
          services.calendarMarkersFor({
            projectId,
            readRefreshOwner,
            isActiveReader: isCurrent,
            announceRefusal: refusals.publish,
          }),
      ),
      writer: DiBag.fromSyncFactory(
        ({
          readRefreshOwner,
          reread,
          busy,
          commandsIssued,
          refusals,
        }: {
          readRefreshOwner: () => PlanFeed['owner'] | null;
          reread: (resources: readonly RefreshResource[]) => Promise<void>;
          busy: Busy;
          commandsIssued: Channel<undefined>;
          refusals: Channel<PlanRefusal>;
        }): PlanWriter =>
          createPlanWriter({
            readRefreshOwner,
            isActiveReader: isCurrent,
            rereadResources: reread,
            busy,
            commandsIssued,
            refusals,
          }),
      ),
      commands: DiBag.fromSyncFactory((): PlanCommands => services.planCommandsFor(projectId)),
    })
    .build();
  return acquireTransactionally(bag, () => ({
    projectId,
    isCurrent,
    plan: bag.resolve('plan'),
    presence: bag.resolve('presence'),
    busy: bag.resolve('busy'),
    refusals: bag.resolve('refusals'),
    commandsIssued: bag.resolve('commandsIssued'),
    reread: bag.resolve('reread'),
    markers: bag.resolve('markers'),
    writer: bag.resolve('writer'),
    commands: bag.resolve('commands'),
  }));
}

/**
 * The one owner of the selected project's runtime: which runtime is current,
 * and the only way one is opened or left.
 *
 * A store (rule F2) over the runtime's {@link LifetimeState}, so the page draws
 * the table only while a runtime is `live`, and the sanitized fatal state when
 * one could not be retired or built.
 */
export interface ProjectOwner extends Store<LifetimeState<ProjectRuntime>> {
  /**
   * Withdraws whatever runtime is current, synchronously, and publishes one for
   * this project once that runtime's retirement has succeeded.
   *
   * Resolves when this request has published, was overtaken by a newer one, or
   * was refused because one of this owner's own runtimes could not be built or
   * given back — the slot has then published `fatal`, which is what the page
   * shows. It rejects only with a refusal that came from neither: a fault of
   * the slot itself, rethrown with its cause.
   */
  readonly open: (projectId: string, source: ProjectSource) => Promise<void>;
  /** Withdraws and retires whatever runtime is current; settles as {@link open} does. */
  readonly leave: () => Promise<void>;
}

/** What an owner is built from; production passes none of it. */
export interface ProjectOwnerDependencies {
  /** How one runtime is installed. Defaults to {@link installProjectRuntime}. */
  readonly install?: (dependencies: ProjectRuntimeDependencies) => RetirableRuntime<ProjectRuntime>;
  /** The bounded wait for a retirement. Defaults to the one budget every lifetime has. */
  readonly budgetMs?: number;
}

/**
 * Builds the owner of one page's selected project.
 *
 * One lifetime slot underneath, so every rule of `lifetime-slot.ts` holds for
 * the project too: withdrawal is synchronous, transitions run one at a time in
 * request order, a superseded request builds nothing, a runtime is disposed
 * once however many triggers retire it, and a retirement that fails or outruns
 * its wait refuses every later transition with the sanitized fatal state.
 *
 * What this adds is **identity**. Each runtime is handed an `isCurrent` that
 * answers yes only while the slot is `live` **with that very runtime**, so a
 * runtime replaced by another project's is not current even though the slot is
 * live again.
 *
 * Holds nothing until `open` is called, which is what makes it safe to build in
 * a lazy state initializer that Strict Mode may run twice.
 */
export function createProjectOwner({
  install = installProjectRuntime,
  budgetMs = RETIREMENT_BUDGET_MS,
}: ProjectOwnerDependencies = {}): ProjectOwner {
  const slot = createLifetimeSlot<ProjectRuntime>(budgetMs);
  /**
   * Every failure that left one of this owner's runtimes: a construction that
   * threw, a partial acquisition's release or a retirement that rejected. The
   * slot turns each of these into its `fatal` state before rethrowing it, so a
   * refusal found here is a modelled outcome whatever the slot's state has
   * moved on to since. Compared by identity, never by message.
   */
  const refusedByRuntime = new Set<unknown>();
  /** The same close, with its refusal recorded before the slot sees it. */
  const recorded =
    (close: (options: { timeoutMs: number }) => Promise<void>) =>
    async (options: { timeoutMs: number }): Promise<void> => {
      try {
        await close(options);
      } catch (refusal: unknown) {
        refusedByRuntime.add(refusal);
        throw refusal;
      }
    };
  /**
   * Settles one transition as a modelled outcome, classified by the refusal
   * itself and not by the slot's state afterwards, which a later request may
   * already have moved on.
   *
   * Superseded is controlled cancellation; a refusal from this owner's own
   * runtime has been published as `fatal`, sanitized, and that state is what
   * anybody is shown. Anything else is a fault of the slot and is rethrown
   * with its cause.
   */
  const settle = async (transition: Promise<unknown>): Promise<void> => {
    try {
      await transition;
    } catch (refusal: unknown) {
      if (refusal instanceof TransitionSupersededError) return;
      if (refusedByRuntime.has(refusal)) return;
      throw new Error('a project transition was refused by the slot itself', { cause: refusal });
    }
  };
  /** Installs one runtime, recording every failure that can leave it. */
  const installRecorded = (dependencies: ProjectRuntimeDependencies) => {
    let runtime: RetirableRuntime<ProjectRuntime>;
    try {
      runtime = install(dependencies);
    } catch (failure: unknown) {
      const refusal =
        failure instanceof PartialAcquisitionError
          ? new PartialAcquisitionError(failure.cause, recorded(failure.release))
          : failure;
      refusedByRuntime.add(refusal);
      throw refusal;
    }
    return { services: runtime.services, close: recorded(runtime.close) };
  };
  return {
    subscribe: slot.subscribe,
    snapshot: slot.snapshot,
    open: (projectId, source) =>
      settle(
        slot.replace(() => {
          let built: ProjectRuntime | null = null;
          const isCurrent = (): boolean => {
            const state = slot.snapshot();
            return state.status === 'live' && state.services === built;
          };
          const runtime = installRecorded({ projectId, ...source, isCurrent });
          built = runtime.services;
          return runtime;
        }),
      ),
    leave: () => settle(slot.retire()),
  };
}
