import type { Step } from '../repository';
import type { NumberedWorkItem } from './work-item.service';

/**
 * What subscribers to `project:<id>` receive.
 *
 * One shape for the work items, and it is the whole tree. There were two: a
 * cell edit was to send the touched row and its ancestors, a structural change
 * the tree. The command bus retired the small one. Every write now arrives
 * through `PlanCommandRunner`, which collects a batch and announces **once**
 * after the transaction commits — and a batch is any set of rows at all, so
 * there is no per-row change left to describe. The narrow shape survived
 * unreachable for two releases before it was deleted; a whole plan is hundreds
 * of rows and one read after a write is the cheaper mistake.
 *
 * The three step events carry the step and **not** the tree, even though
 * removing one deletes estimates from it. A client reads the project's steps and
 * its tree together — one refresh, both reads — so a step event says which fact
 * moved and the client rereads both. Putting the tree in here would send a
 * second copy of it that the reader would have to reconcile with the steps it
 * has not read yet.
 */
export type ProjectEvent =
  | { type: 'tree_replaced'; workItems: NumberedWorkItem[] }
  | { type: 'step_added'; step: Step }
  | { type: 'step_renamed'; step: Step }
  | { type: 'step_removed'; stepId: string }
  /**
   * Something in the global directory that this project reads has changed — a
   * person or team renamed, or one removed and its assignments and labels taken
   * with it.
   *
   * It carries nothing, deliberately. The directory is global and a project
   * reads its people and teams alongside its tree on every refresh, so the only
   * useful thing to say is "read again". A payload would be a second copy of a
   * list the client is about to fetch anyway, and it would have to be
   * reconciled against the tree it has not fetched yet — the same argument the
   * three step events make for carrying the step and not the tree.
   */
  | { type: 'directory_changed' }
  /**
   * How many of a team this project may have at work at once has changed, so
   * every date in it may have moved.
   *
   * It carries nothing, for `directory_changed`'s reason: a client reads the
   * project's capacities alongside its tree on every refresh, so the only useful
   * thing to say is "read again".
   *
   * Its **own** type rather than `directory_changed`, and the reason is that the
   * name has to be true. `directory_changed` says "something in the global
   * directory that this project reads has changed", and a per-project capacity is
   * not in the directory at all — the same distinction that makes this write fan
   * out to one project where C2's global size fanned out to every project the
   * team labelled. C2 folded a proposed `team_capacity_set` into
   * `directory_changed` because the directory row really did change; here it does
   * not.
   *
   * The choice costs nothing on the wire: fe-01 treats every project event as
   * "read again" and does not read the type, so it is decided purely on whether
   * a reader of this union is told the truth. See
   * `openspec/changes/capacity-per-project/design.md` D6.
   */
  | { type: 'capacity_changed' }
  /**
   * What this project calls its priority numbers has changed — a rung renamed,
   * a cut moved, or a default re-pointed.
   *
   * **No date moved**, and that is the one thing this event is unlike every
   * other in the union about. The ladder is read by no scheduling code; a client
   * rereads because the labels and the colours on its table, its chart, its
   * cards and its export are all drawn from it, and a plan open on a second
   * screen would otherwise go on painting `High` over a rung that now says
   * `Blocker`.
   *
   * Its own type rather than `capacity_changed` or `directory_changed`, for the
   * reason C5's D6 gives: fe-01 reads every project event as "read again" and
   * never inspects the type, so the name costs nothing either way and is
   * therefore decided purely on whether a reader of this union is told the
   * truth.
   */
  | { type: 'priority_bands_changed' }
  /**
   * This project's list of saved plans has changed — one saved, renamed or
   * deleted.
   *
   * **The plan itself never changes, and that is what this event is for.** A
   * saved plan is immutable by construction, so unlike every other member of
   * this union nothing a second reader already holds has gone stale. What has
   * changed is the *set*: the shelf shows a plan that is not there, or is
   * missing one that is, or is captioned with a name somebody else replaced.
   *
   * It carries nothing, for `directory_changed`'s reason: a client reads the
   * project's saved plans as one list and the only useful thing to say is "read
   * again". Carrying the new record would additionally leak it to every reader
   * of the project including one who may not rename or delete it, which is a
   * permission the list route already decides for itself.
   *
   * Its own type rather than folding into `tree_replaced`, and the distinction
   * is load-bearing rather than cosmetic: **no date moved and no live row
   * changed**. A reader that treated a save as a tree change would re-fetch and
   * re-render a plan that is byte-identical to the one on screen, on every save
   * any collaborator makes.
   *
   * There is a second reader of this event beyond the shelf. TASK-232's 8.4
   * offers "this plan has changed since the comparison below was made" rather
   * than swapping the comparison out; before this event existed that affordance
   * could only be reached by the reader's *own* save, because nothing a
   * collaborator did ever arrived.
   */
  | { type: 'saved_plans_changed' };

/**
 * The subscription name carrying a project's edits.
 *
 * One function rather than a template literal at each call site: be-01 records
 * events under this name, gw-01 matches sockets against it, and fe-01 subscribes
 * with it. Three spellings of the same string is a silent no-op, not an error.
 */
export function subscriptionFor(projectId: string): string {
  return `project:${projectId}`;
}

export interface Broadcaster {
  publish(projectId: string, event: ProjectEvent): Promise<void>;
  /**
   * Where the project's event stream has reached, or `-1` for a project that has
   * never been edited.
   *
   * It lives on the broadcaster rather than on a second collaborator because the
   * broadcaster is what advances the sequence; a reader that asked something else
   * could be told a number the publisher had already moved past.
   */
  latestSeq(projectId: string): Promise<number>;
}

/** One announcement waiting for its batch to commit and let go of the lock. */
export interface HeldAnnouncement {
  projectId: string;
  event: ProjectEvent;
}

/**
 * A {@link Broadcaster} that can hold a batch's announcements back.
 *
 * `PlanCommandRunner` states the rule its own broadcast follows: the lock covers
 * the transaction and nothing after it, because a push to gw-01 is a network
 * call and a lock held across it lets one slow gateway stall every write in the
 * process. `PushClient` retries six times with a 500ms→30s backoff, so the worst
 * case is about a minute **per push**.
 *
 * Three services broke that rule by publishing from inside `applyAll`:
 * `CapacityService.set`, `PriorityBandService.set` and
 * `DirectoryService.announce`, the last of them once per touched project, in
 * sequence. A tag rename across forty projects made forty event-log inserts and
 * forty gateway pushes with the process-wide write lock held.
 *
 * It was also unsound, not merely slow. Under ADR 0007 the batch runs in one
 * outer transaction, so those event-log inserts were savepoints inside it: a
 * command refused at step nine rolled back the recorded events for pushes that
 * had already left the process. `directory.service.ts`'s own doc argued the
 * opposite — "`recordEvent` opens a transaction of its own, so it cannot be
 * nested inside the write's" — which is true of a single directory route and
 * false of every directory command in a batch.
 *
 * So a held batch keeps its announcements until the runner has committed *and*
 * released the lock, and drops them entirely when it rolls back. Held events are
 * deduplicated when they carry nothing but a `type`, which is what makes forty
 * `directory_changed` for one rename into one per project.
 */
export class DeferringBroadcaster implements Broadcaster {
  private held: HeldAnnouncement[] | null = null;

  constructor(private readonly inner: Broadcaster) {}

  /**
   * Run `step` with every announcement held, and hand back what it queued.
   *
   * The caller decides whether they leave: {@link send} them after a commit,
   * drop them after a rollback.
   *
   * @throws when a hold is already open. Two batches sharing one queue would let
   * the outer one send events the inner one's rollback disowned.
   */
  async hold<T>(step: () => Promise<T>): Promise<{ result: T; pending: HeldAnnouncement[] }> {
    if (this.held !== null) throw new Error('a batch is already holding announcements');
    const held: HeldAnnouncement[] = [];
    this.held = held;
    try {
      return { result: await step(), pending: held };
    } finally {
      this.held = null;
    }
  }

  /** Publish what a hold queued, in the order it was queued. */
  async send(pending: readonly HeldAnnouncement[]): Promise<void> {
    for (const each of pending) await this.inner.publish(each.projectId, each.event);
  }

  /**
   * The broadcaster underneath, for a publisher that provably never runs inside
   * a batch.
   *
   * {@link held} is **instance** state and `services.ts` builds exactly one of
   * these, so during any open hold *every* publish through this object joins
   * that batch's queue — including one from an HTTP route that committed its own
   * transaction and has nothing to do with the batch. A refused batch drops its
   * queue, and that route's event goes with it: the write happened and nobody
   * was told. Saved-plan mutations shipped that way and both review seats on
   * PR 204 found it independently (TASK-255).
   *
   * The condition for using this is a property of the CALLER, not of timing:
   * `plan-commands` has no saved-plan command, so a saved-plan announcement can
   * never belong to a batch and has nothing to be atomic with. Anything a
   * command *can* reach must keep the wrapper, because for those the hold is
   * the whole point.
   *
   * Being handed `announcements` in `services.ts` is NOT that test, and saying
   * so was this doc's own first mistake. `StepService` is wired to the wrapper
   * and `PlanCommandKind` declares no step command at all, so `step_added`,
   * `step_renamed` and `step_removed` are HTTP-only and carry this same drop
   * today. That predates the saved-plan work and is filed rather than widened
   * into it (TASK-256); the fix there is this accessor or a per-caller hold, and
   * it is a decision about the batch contract rather than a wiring change.
   *
   * **Bypassing the queue is not by itself enough, and that was this accessor's
   * second mistake.** Skipping the hold means the publish reaches
   * `GatewayBroadcaster` while the batch's transaction is still open, and the
   * event log shares its connection with that transaction — so the row went in
   * as a savepoint and the batch's rollback erased it after the push had left.
   * Sol's Critical on PR 204. The durable half is now the broadcaster's own
   * problem and is solved for every publisher at once: it records under the
   * write lock (`GatewayBroadcasterOptions.lock`) and pushes outside it. What is
   * left here is the *capture* half alone — being queued into somebody else's
   * batch and dropped with it — which is what this accessor is for and all it
   * claims.
   */
  get undeferred(): Broadcaster {
    return this.inner;
  }

  async publish(projectId: string, event: ProjectEvent): Promise<void> {
    const held = this.held;
    if (held === null) {
      await this.inner.publish(projectId, event);
      return;
    }
    // Only an event that carries nothing but its type can be deduplicated: two
    // `directory_changed` for one project say the same thing, and two
    // `step_renamed` do not.
    const saysOnlyItsType = Object.keys(event).length === 1;
    if (
      saysOnlyItsType &&
      held.some((each) => each.projectId === projectId && each.event.type === event.type)
    ) {
      return;
    }
    held.push({ projectId, event });
  }

  latestSeq(projectId: string): Promise<number> {
    return this.inner.latestSeq(projectId);
  }
}
