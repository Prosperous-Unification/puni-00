import { unreachable } from '@/lib/http';
import { savedPlanFailureCode } from '@/lib/saved-plan-api';
import { createChannel } from '@/modules/channel';

import {
  type OpenedSavedPlans,
  type SavedPlanListState,
  type SavedPlanRoutes,
  type SavedPlans,
  type SavedPlansReader,
  SavedPlansWithdrawnError,
} from './contract';

/**
 * The two questions a shelf read is made of, injected rather than imported.
 *
 * `savedPlansAvailable` is a free function and `list` hangs off the API object,
 * so a caller that wanted to fake one would otherwise have to stub `fetch` for
 * both and lose the ability to say "the probe said no and the list was never
 * asked" — which is the assertion this whole file exists for.
 */
export type ShelfDeps = Pick<SavedPlanRoutes, 'available' | 'list'>;

/**
 * One read of a project's shelf, from the capability question to the rows.
 *
 * **The order is the point, and it is the half of 6.4 that neither the probe nor
 * the surface can hold on its own.** `savedPlansAvailable()` and the
 * "not available on this node yet" sentence were both written before this
 * function and each is asserted against its own input; a build in which the
 * probe is never invoked passed every one of those cases. What closes 6.4 is
 * that the list is **not asked** when the answer is no, and that is asserted
 * here directly rather than inferred from a rendered string.
 *
 * A failed probe and a failed read are both `error` and carry the code, because
 * by then the reader has a fault to report rather than a node to upgrade.
 */
export async function readShelf(deps: ShelfDeps, projectId: string): Promise<SavedPlanListState> {
  let available: boolean;
  try {
    available = await deps.available();
  } catch (fault) {
    return { kind: 'error', code: codeOf(fault) };
  }
  // Not a guard clause folded into the try above: a *refused* probe and a probe
  // that answered "no" are different states, and one try block covering both
  // would make the second reachable only by accident.
  if (!available) return { kind: 'unavailable' };
  try {
    const reply = await deps.list(projectId);
    switch (reply.kind) {
      case 'success':
        return { kind: 'ready', rows: reply.body.savedPlans };
      case 'failure':
        return { kind: 'error', code: savedPlanFailureCode(reply.failure) };
      case 'refusal':
        // Proof: mapping not_found to an empty successful shelf failed the
        // production-path case: expected `error:not_found`, received
        // `{kind:'ready',rows:[]}` (saved-plans.feature.test.ts).
        switch (reply.body.error) {
          case 'invalid_params':
          case 'unauthenticated':
          case 'unsupported_body_version':
          case 'not_found':
          case 'invalid_body':
          case 'invalid_query':
            return { kind: 'error', code: reply.body.error };
          default:
            return unreachable(reply.body);
        }
      default:
        return unreachable(reply);
    }
  } catch (fault) {
    return { kind: 'error', code: codeOf(fault) };
  }
}

/**
 * The thrown code, or the thing itself when something threw a non-Error.
 *
 * `String(fault)` rather than a fixed `'unknown'`: every throw in this client's
 * API layer is an `Error` carrying be-01's own code, and on the day one is not,
 * showing whatever arrived beats erasing it.
 */
const codeOf = (fault: unknown): string => (fault instanceof Error ? fault.message : String(fault));

/**
 * The broadcast, narrowed to the two things a shelf watch uses.
 *
 * `subscribeToProject` takes an options object and hands back a stream with
 * `seen` as well as `unsubscribe`; sequence reporting belongs to whoever reads
 * the *plan*, not to this. Naming only what is used keeps the fake in the cases
 * two lines long and keeps this file from acquiring an opinion about sequences.
 */
export type ShelfWatchDeps = ShelfDeps & Pick<SavedPlanRoutes, 'subscribe'>;

/**
 * A project's shelf, read now and re-read whenever the project changes.
 *
 * **The payload is ignored, exactly as `subscribeToProject` ignores it.** A
 * saved plan is immutable, but the *list* is not: another collaborator saving or
 * deleting one changes it, and re-reading is one request and always right.
 *
 * **A node that cannot answer is never subscribed to.** Same reasoning as
 * `readShelf`'s own order, one level up: there is no point listening for changes
 * to a list this node has no route to return, and a socket opened for a shelf
 * that can never render is a reconnect loop nobody can see.
 *
 * Returns the stop. Call it and no further state arrives — including from a read
 * already in flight, which is the trap `project-stream.ts` names in its own
 * `unsubscribe`: the loop that outlived its subscriber.
 *
 * **It also returns `refresh`, and the reason is a hole in the broadcast rather
 * than a convenience.** `saved-plan.controller.ts` publishes `saved_plans_changed`
 * on save, rename and delete (TASK-255), so a collaborator's mutation does now
 * reach this watch — and the hole `refresh` was written for is the one the
 * broadcast cannot close, because it is on the saver's own side of it. Without a
 * caller-driven read the saver waits for their own event to go out to gw-01 and
 * come back before the row they just created appears, which is the one moment
 * the shelf is most obviously wrong. `refresh` is `read` itself, so the guard
 * against a superseded answer covers a refresh racing a broadcast for free.
 */
export function watchShelf(
  deps: ShelfWatchDeps,
  projectId: string,
  onState: (state: SavedPlanListState) => void,
): { stop: () => void; refresh: () => void } {
  let stopped = false;
  let generation = 0;
  let stream: { unsubscribe(): void } | null = null;

  const read = (): void => {
    const mine = ++generation;
    void readShelf(deps, projectId).then((state) => {
      // Two guards, and they are different facts. `stopped` is "nobody is
      // listening any more"; `mine !== generation` is "somebody is, but they
      // have since asked a newer question". A broadcast that lands while the
      // first read is still in flight produces both reads, and without the
      // second guard whichever resolves last wins — which is the older answer
      // roughly as often as not.
      if (stopped || mine !== generation) return;
      onState(state);
      if (state.kind === 'unavailable') return;
      stream ??= deps.subscribe(projectId, read);
    });
  };

  read();

  return {
    stop: () => {
      stopped = true;
      stream?.unsubscribe();
      stream = null;
    },
    // Not `read` directly. `read`'s `stopped` guard already suppresses the
    // state *and* the resubscribe — it returns before both — so this changes no
    // observable state. What it stops is the pair of requests: a stopped watch
    // that is refreshed anyway asks the server the capability question and the
    // list, and throws both answers away. A `refresh` handed to a component
    // outlives that component by exactly as long as its last save takes.
    refresh: () => {
      if (!stopped) read();
    },
  };
}

/**
 * Opens one project's saved plans over their private port: reads its shelf now,
 * watches it until {@link OpenedSavedPlans.close}, and answers requests only while
 * the project runtime that opened them is current.
 *
 * Called once per project runtime, by `runtime/project-runtime.ts`, which
 * publishes {@link SavedPlans} and gives the watch back when it retires the
 * project. A new project is a new runtime and so a new shelf starting from
 * `loading`: the rows of the project just left are never shown under the next
 * one's name.
 *
 * `isCurrent` is asked synchronously when anything happens. After the runtime
 * is withdrawn the shelf does not change again — a read the old project still
 * had in flight lands nowhere — and every request rejects with
 * {@link SavedPlansWithdrawnError} and sends nothing, and a refresh reads
 * nothing. A broadcast that arrives between the withdrawal and the close may
 * still read once; its answer is dropped by the same guard.
 */
export function openSavedPlans({
  projectId,
  routes,
  isCurrent,
}: SavedPlansReader & { readonly routes: SavedPlanRoutes }): OpenedSavedPlans {
  const changes = createChannel<undefined>();
  let current: SavedPlanListState = { kind: 'loading' };
  const watch = watchShelf(routes, projectId, (next) => {
    // Proof: on 2026-09-27, publishing regardless here (s1) failed `changes nothing once its
    // runtime is withdrawn, not even with the read it had in flight` on `expected { kind: 'ready',
    // rows: [ { …(7) } ] } to deeply equal { kind: 'loading' }`.
    if (!isCurrent()) return;
    current = next;
    changes.publish(undefined);
  });
  const whileCurrent = <T>(send: () => Promise<T>): Promise<T> =>
    // Proof: on 2026-09-27, sending regardless here (s2) failed `sends nothing once its runtime is
    // withdrawn, and says so` on `expected Error: not answered in this case to be an instance of
    // SavedPlansWithdrawnError`.
    isCurrent() ? send() : Promise.reject(new SavedPlansWithdrawnError());
  const savedPlans: SavedPlans = {
    shelf: { subscribe: (onChange) => changes.subscribe(onChange), snapshot: () => current },
    refresh: () => {
      // Proof: on 2026-09-27, refreshing regardless here (s4) failed `reads nothing when refreshed
      // once its runtime is withdrawn` on `expected [ 'list:p1', 'list:p1' ] to deeply equal
      // [ 'list:p1' ]`.
      if (isCurrent()) watch.refresh();
    },
    save: () => whileCurrent(() => routes.save(projectId)),
    rename: (savedPlanId, name) => whileCurrent(() => routes.rename(savedPlanId, name)),
    compare: (left, right) => whileCurrent(() => routes.compare(projectId, left, right)),
  };
  // Proof: on 2026-09-27, a close that stops nothing (s3) failed `stops watching when it is closed`
  // on `expected "vi.fn()" to be called 1 times, but got 0 times` and `throws what its stream threw
  // when it is closed` on `expected [Function] to throw an error`.
  return { savedPlans, close: watch.stop };
}
