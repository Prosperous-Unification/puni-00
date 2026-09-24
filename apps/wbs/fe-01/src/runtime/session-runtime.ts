import { DiBag } from 'di-bag';

import { type DirectoryApi, httpDirectoryApi } from '@/lib/wbs-api';
import type { DirectoryManagement } from '@/modules/directory-management/contract';
import { directoryManagementModule } from '@/modules/directory-management/module';
import type { ProjectRuntime } from '@/modules/project/contract';
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
import {
  createProjectOwner,
  installProjectRuntime,
  type ProjectOwner,
  type ProjectRuntimeDependencies,
} from './project-runtime';

/**
 * Who is signed in, as the session runtime is keyed and built from it.
 *
 * `userId` is the **key**: the account's id, never its username, which a rename
 * changes, and never the credential. `credential` is only an **adapter input** —
 * the directory's client is built from it and nothing else reads it — and it is
 * empty for an identity restored from the access cookie at startup, which a
 * same-origin request carries by itself.
 */
export interface SessionIdentity {
  readonly userId: string;
  readonly credential: string;
}

/**
 * The services of one signed-in identity, for as long as its runtime is the one
 * published — and nothing else (rule K2).
 *
 * No bag, no client, no credential and no directory resource is reachable from
 * here; the runtime's own suite enumerates this surface rather than trusting
 * the type.
 *
 * **`isCurrent`** turns false the instant the owner withdraws this runtime —
 * another user signing in, or the session being left — before its disposal
 * starts, and never turns true again. The directory and every project runtime
 * this session owns answer from it.
 */
export interface SessionRuntime {
  readonly userId: string;
  /** Whether this runtime is still the one its owner publishes. */
  readonly isCurrent: () => boolean;
  /** The account-wide directory, as the gestures a person names. */
  readonly directory: DirectoryManagement;
  /**
   * The owner of this session's selected project: a project is opened through
   * it, and only while this session is current, and the session's retirement
   * retires it first.
   */
  readonly projects: ProjectOwner;
}

/**
 * The runtime a region drawn for `userId` may use: the published one, when it is
 * that user's, and nothing otherwise.
 *
 * Between the render that hands a region a new identity and the effect that asks
 * the owner for it, the owner still publishes the previous user's runtime. A
 * region that drew from it then would hand the previous user's directory and
 * project owner to a page rendering for the next user — and a page's own effects
 * run before its parent's, so it would act on them before anything was
 * withdrawn.
 */
export function sessionFor(
  state: LifetimeState<SessionRuntime>,
  userId: string,
): SessionRuntime | null {
  return state.status === 'live' && state.services.userId === userId ? state.services : null;
}

/** What one session runtime is installed from. */
export interface SessionRuntimeDependencies {
  readonly userId: string;
  /** The client cut from the identity's credential; the directory's only way out. */
  readonly directoryApi: DirectoryApi;
  /**
   * Whether this runtime is still the one its owner publishes, asked
   * synchronously at the moment anything happens — the owner's answer, not the
   * runtime's, because withdrawal happens in the owner.
   */
  readonly isCurrent: () => boolean;
  /** How this session's project runtimes are installed. Production passes the real one. */
  readonly installProject: (
    dependencies: ProjectRuntimeDependencies,
  ) => RetirableRuntime<ProjectRuntime>;
  /** The bounded wait this session gives its project's retirement. */
  readonly budgetMs: number;
}

/**
 * A session whose selected project could not be given back.
 *
 * Thrown from the session's own disposal, so the session's retirement fails
 * too: a session that let go while its project still held a socket would be
 * the overlap this change exists to refuse. The project's own owner has already
 * disclosed its fault; this one says only which lifetime it stopped.
 */
export class SessionProjectRetirementError extends Error {
  constructor() {
    super('the session could not retire its selected project');
    this.name = 'SessionProjectRetirementError';
  }
}

/**
 * The project owner one session hands its pages.
 *
 * Two guards make "a project inside the current session" true rather than
 * hoped for:
 *
 * - every project runtime it builds is current only while **both** its own
 *   owner publishes it **and** this session is current, so withdrawing the
 *   session withdraws its project in the same instant, before either disposal
 *   starts;
 * - an `open` asked of it once the session has been withdrawn builds nothing
 *   and settles quietly, so a page's late effect cannot give a retired session
 *   a project nobody will retire.
 */
function sessionProjects({
  isCurrent,
  installProject,
  budgetMs,
}: Pick<SessionRuntimeDependencies, 'isCurrent' | 'installProject' | 'budgetMs'>): ProjectOwner {
  const owner = createProjectOwner({
    install: (dependencies) =>
      installProject({
        ...dependencies,
        isCurrent: () => isCurrent() && dependencies.isCurrent(),
      }),
    budgetMs,
  });
  return {
    subscribe: owner.subscribe,
    snapshot: owner.snapshot,
    open: async (projectId, source) => {
      if (!isCurrent()) return;
      await owner.open(projectId, source);
    },
    leave: owner.leave,
  };
}

/**
 * Installs one signed-in identity's runtime: one DI Bag graph, built outside
 * React, publishing {@link SessionRuntime} and nothing else.
 *
 * It installs the directory-management module over the identity's client,
 * with this runtime's own `isCurrent` as the directory's reader test, and it
 * owns the session's project owner.
 *
 * **The project owner is the graph's one owned disposable.** The session's
 * disposal leaves it — retiring whatever project is current, and waiting for
 * that retirement — before the session's own retirement is done, which is the
 * ordering the lifetime map requires: project first, then session. A project
 * that could not be given back fails the session's disposal with
 * {@link SessionProjectRetirementError}; a project whose construction failed
 * holds nothing, and does not.
 *
 * @throws `PartialAcquisitionError` when a service cannot be resolved, carrying
 * the bounded close for whatever was acquired first.
 */
export function installSessionRuntime({
  userId,
  directoryApi,
  isCurrent,
  installProject,
  budgetMs,
}: SessionRuntimeDependencies): RetirableRuntime<SessionRuntime> {
  const bag = DiBag.createBuilder()
    .installModule(directoryManagementModule)
    .register({
      directoryApi: DiBag.fromSyncFactory((): DirectoryApi => directoryApi),
      isActiveReader: DiBag.fromSyncFactory((): (() => boolean) => isCurrent),
    })
    .register({
      projects: DiBag.withDisposal(
        DiBag.fromSyncFactory((): ProjectOwner =>
          sessionProjects({ isCurrent, installProject, budgetMs }),
        ),
        async (projects) => {
          await projects.leave();
          const left = projects.snapshot();
          if (left.status === 'fatal' && left.terminal) throw new SessionProjectRetirementError();
        },
      ),
    })
    .build();
  return acquireTransactionally(bag, () => ({
    userId,
    isCurrent,
    directory: bag.resolve('directoryManagement'),
    projects: bag.resolve('projects'),
  }));
}

/**
 * The one owner of the signed-in identity's runtime: which runtime is current,
 * and the only way one is opened or left.
 *
 * A store (rule F2) over the runtime's {@link LifetimeState}, so the app draws
 * the signed-in region only while a runtime is `live` for the identity it holds,
 * and the sanitized fatal state when one could not be retired or built.
 */
export interface SessionOwner extends Store<LifetimeState<SessionRuntime>> {
  /**
   * Opens a runtime for this identity, **unless the newest request already
   * asked for this user**, in which case it joins that request and changes
   * nothing: the key is the user id, and a credential that differs for the
   * same user replaces nothing.
   *
   * For another user it withdraws the current runtime, and with it its
   * project, synchronously, and publishes the new one once that retirement
   * has succeeded. Resolves when this request has published, was overtaken,
   * or was refused — the last leaves the owner `fatal`, which is what the app
   * shows.
   */
  readonly open: (identity: SessionIdentity) => Promise<void>;
  /**
   * Withdraws and retires whatever runtime is current — its project first —
   * and settles only once that retirement has run: a second trigger queues
   * behind the first and settles after it, with the same outcome.
   */
  readonly leave: () => Promise<void>;
  /**
   * Log out: a **local exit**, which sends no request and revokes nothing, so a
   * reload can still restore the identity from its cookie.
   *
   * It is {@link leave} and nothing more: the session and its project are
   * withdrawn in the same instant, the project is retired and then the
   * session, each under the retirement budget, and this settles only once that
   * retirement has run — however many log outs, or the region's own departure,
   * asked for it. What it settles with is what the region may do next; see
   * {@link SessionExit}.
   */
  readonly exit: () => Promise<SessionExit>;
}

/**
 * How one log out ended, as the region that asked for it acts on it.
 *
 * - `signed-out` — the session and its project were withdrawn and retired, in
 *   that order, and nobody has been asked for since: the signed-out state may
 *   render.
 * - `fatal` — a retirement failed or outran its wait, or the owner was already
 *   fatal: it publishes the sanitized fatal state, which the region draws
 *   instead, and the withdrawn services are never published again.
 * - `overtaken` — a sign-in asked for after this log out is the owner's now;
 *   rendering the signed-out state would undo it.
 */
export type SessionExit = 'signed-out' | 'fatal' | 'overtaken';

/** What an owner is built from; production passes none of it. */
export interface SessionOwnerDependencies {
  /** How one runtime is installed. Defaults to {@link installSessionRuntime}. */
  readonly install?: (dependencies: SessionRuntimeDependencies) => RetirableRuntime<SessionRuntime>;
  /** How the directory's client is cut from a credential. Defaults to the real one. */
  readonly clientFor?: (credential: string) => DirectoryApi;
  /** How a project runtime is installed. Defaults to the real one. */
  readonly installProject?: (
    dependencies: ProjectRuntimeDependencies,
  ) => RetirableRuntime<ProjectRuntime>;
  /** The bounded wait for a retirement. Defaults to the one budget every lifetime has. */
  readonly budgetMs?: number;
}

/**
 * Builds the owner of one app's signed-in identity.
 *
 * One lifetime slot underneath, so every rule of `lifetime-slot.ts` holds for
 * the session too. What this adds is the **key** and **identity**: a request
 * for the user already asked for joins it instead of replacing anything, and
 * each runtime is handed an `isCurrent` that answers yes only while the slot is
 * `live` with that very runtime.
 *
 * Holds nothing until `open` is called, which is what makes it safe to build in
 * a lazy state initializer that Strict Mode may run twice.
 */
export function createSessionOwner({
  install = installSessionRuntime,
  clientFor = httpDirectoryApi,
  installProject = installProjectRuntime,
  budgetMs = RETIREMENT_BUDGET_MS,
}: SessionOwnerDependencies = {}): SessionOwner {
  const slot = createLifetimeSlot<SessionRuntime>(budgetMs);
  /** The identity the newest request asked for, or `null` after a leave. */
  let wanted: SessionIdentity | null = null;
  /** The newest request's settlement, which a request for the same user joins. */
  let latest: Promise<void> = Promise.resolve();
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
  /** Installs one runtime, recording every failure that can leave it. */
  const installRecorded = (
    dependencies: SessionRuntimeDependencies,
  ): RetirableRuntime<SessionRuntime> => {
    let runtime: RetirableRuntime<SessionRuntime>;
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
  /**
   * Settles one transition as a modelled outcome, classified by the refusal
   * itself and not by the slot's state afterwards, which a later request — one
   * a subscriber asked for from inside the notification, say — may already have
   * moved on.
   *
   * Superseded is controlled cancellation; a refusal from this owner's own
   * runtime has been published as `fatal`, sanitized, and that state is what
   * anybody is shown. Anything else is a fault of the slot and is rethrown with
   * its cause.
   */
  const settle = async (transition: Promise<unknown>): Promise<void> => {
    try {
      await transition;
    } catch (refusal: unknown) {
      if (refusal instanceof TransitionSupersededError) return;
      if (refusedByRuntime.has(refusal)) return;
      throw new Error('a session transition was refused by the slot itself', { cause: refusal });
    }
  };
  const owner: SessionOwner = {
    subscribe: slot.subscribe,
    snapshot: slot.snapshot,
    open: (identity) => {
      if (identity.userId === wanted?.userId) return latest;
      wanted = identity;
      latest = settle(
        slot.replace(() => {
          let built: SessionRuntime | null = null;
          const isCurrent = (): boolean => {
            const state = slot.snapshot();
            return state.status === 'live' && state.services === built;
          };
          const runtime = installRecorded({
            userId: identity.userId,
            directoryApi: clientFor(identity.credential),
            isCurrent,
            installProject,
            budgetMs,
          });
          built = runtime.services;
          return runtime;
        }),
      );
      return latest;
    },
    leave: () => {
      wanted = null;
      latest = settle(slot.retire());
      return latest;
    },
    exit: async () => {
      await owner.leave();
      if (slot.snapshot().status === 'fatal') return 'fatal';
      return wanted === null ? 'signed-out' : 'overtaken';
    },
  };
  return owner;
}
