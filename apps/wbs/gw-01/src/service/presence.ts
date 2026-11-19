import { wsPresence } from '@wbs/contracts';

import type { DeliveryOutcome, DeliverySocket } from './delivery';

export type PresenceSocket = DeliverySocket;

/** What a connection that has named no work package is shown, and put in. */
const NOBODY: string[] = [];

interface Connected {
  username: string;
  socket: PresenceSocket;
  /**
   * The work package this connection subscribed to, or null while it has named
   * none. See {@link Presence.enterWorkPackage} for why it is one and not a set.
   */
  workPackageId: string | null;
}

/**
 * Who is in a work package right now, keyed by connection rather than by user: one
 * person with two tabs is two connections and must survive closing one of
 * them. `list()` therefore deduplicates, while `leave()` does not.
 *
 * **A roster is a work package's, never the gateway's.** It used to be the gateway's:
 * `list()` returned every connected username with no filter at all, so a work package
 * created a second ago showed every account that happened to have a socket open
 * — observed live, 2026-08-09, and the reason this class now knows what a
 * work package is. A connection joins a roster by subscribing to `workPackage:<id>`
 * ({@link enterWorkPackage}); until it does it belongs to **nothing** — it is in no
 * work package's roster and is shown an empty one. That is the honest answer for a
 * socket that has connected and not yet said what it is looking at, and it is
 * the same answer for one whose token would not verify at `open`: no username
 * was recorded for it, so there is nothing to put anywhere.
 *
 * This is deliberately in-memory and per-process. gw-01 runs as a single
 * container per environment; the moment a second replica exists this becomes
 * a per-replica view and needs a shared backplane. That is a real limit, not
 * an oversight — it is why `list()` describes "this gateway", not "the system".
 */
export class Presence {
  private readonly byConnection = new Map<string, Connected>();
  /**
   * The connections in each work package, so a roster is a lookup rather than a scan.
   *
   * `list()` filtered every connection the gateway holds, and `broadcast()`
   * calls it once per distinct work package — O(connections × work packages) per join,
   * per subscribe and per leave, on the one class that runs on every socket
   * event. Reads and delivery now visit only the affected work packages’ members.
   *
   * Two indexes over one fact, which is a thing to keep honest rather than a
   * thing to be pleased about: every write below moves both, and
   * `presence.test.ts`'s `the two indexes never disagree` walks a thousand
   * random join/subscribe/move/leave sequences comparing `list()` against a
   * full scan.
   */
  private readonly byWorkPackage = new Map<string, Set<string>>();

  /** Replaces a connection id and returns the work package its old connection left. */
  join(connectionId: string, username: string, socket: PresenceSocket): readonly string[] {
    const affected = this.leave(connectionId);
    this.byConnection.set(connectionId, { username, socket, workPackageId: null });
    // Proof: returning [] leaves linus without the updated roster in the renamed-id delivery case.
    return affected;
  }

  /** Removes one tab, identifying its previous work package before deleting its lookup. */
  leave(connectionId: string): readonly string[] {
    const connected = this.byConnection.get(connectionId);
    const workPackageId = connected?.workPackageId;
    if (workPackageId != null) this.removeMember(workPackageId, connectionId);
    this.byConnection.delete(connectionId);
    // Proof: returning [] makes the two-tab disconnect case receive no roster.
    return workPackageId == null ? [] : [workPackageId];
  }

  /** Removes the member and retires an empty work package's index entry. */
  private removeMember(workPackageId: string, connectionId: string): void {
    const members = this.membersOf(workPackageId);
    members.delete(connectionId);
    // Proof: retaining empty sets leaves size 2 instead of 0 after the mutation sequence.
    if (members.size === 0) this.byWorkPackage.delete(workPackageId);
  }

  /** The set for `workPackageId`, made on first use and never left empty behind. */
  private membersOf(workPackageId: string): Set<string> {
    const held = this.byWorkPackage.get(workPackageId);
    if (held !== undefined) return held;
    const made = new Set<string>();
    this.byWorkPackage.set(workPackageId, made);
    return made;
  }

  /**
   * Puts a connection in a work package's roster, returning its changed old/new work package ids.
   *
   * One work package per connection, not a set: the roster answers "who else is
   * looking at this with me", and a socket showing one work package at a time can
   * only be looking at one. A second `workPackage:` subscribe on the same socket is
   * therefore a move — the browser switched work package — rather than a second
   * membership, and a socket in two rosters would have no single roster to be
   * broadcast.
   *
   * A connection this does not know is one that never joined: its token did not
   * verify at `open` (see gw-01's `app.ts`), so it has no username and no
   * roster can hold it. Not an invariant failure — a modelled state of the
   * socket, and the only thing to do with it is nothing.
   */
  enterWorkPackage(connectionId: string, workPackageId: string): readonly string[] {
    const connected = this.byConnection.get(connectionId);
    // Proof: removing the equality guard sends frames during the real-socket no-op count check.
    if (connected === undefined || connected.workPackageId === workPackageId) return [];
    const previous = connected.workPackageId;
    if (previous !== null) this.removeMember(previous, connectionId);
    connected.workPackageId = workPackageId;
    this.membersOf(workPackageId).add(connectionId);
    // Proof: returning only the destination omits grace's roster in the real-socket move case.
    return previous === null ? [workPackageId] : [previous, workPackageId];
  }

  /**
   * Takes a connection out of its current work package and returns that changed id.
   *
   * Guarded on the id rather than clearing outright: an `unsubscribe` naming a
   * work package this connection has already moved off must not empty the roster of
   * the one it moved **to**. A browser that switches work packages sends both frames
   * and their order is the network's, not ours.
   */
  leaveWorkPackage(connectionId: string, workPackageId: string): readonly string[] {
    const connected = this.byConnection.get(connectionId);
    if (connected?.workPackageId !== workPackageId) return [];
    connected.workPackageId = null;
    this.removeMember(workPackageId, connectionId);
    return [workPackageId];
  }

  /** Distinct usernames in `workPackageId`, sorted so the front end renders a stable order. */
  list(workPackageId: string): string[] {
    const names = new Set<string>();
    for (const connectionId of this.byWorkPackage.get(workPackageId) ?? []) {
      const held = this.connectionIn(workPackageId, connectionId);
      names.add(held.username);
    }
    return [...names].sort();
  }

  /**
   * The roster this connection is entitled to see: its own work package's.
   *
   * Empty for a connection in no work package, which is what a socket that has
   * connected and not yet subscribed gets when it asks `who`.
   */
  rosterFor(connectionId: string): string[] {
    const workPackageId = this.byConnection.get(connectionId)?.workPackageId;
    return workPackageId == null ? [...NOBODY] : this.list(workPackageId);
  }

  usernameOf(connectionId: string): string | null {
    return this.byConnection.get(connectionId)?.username ?? null;
  }

  get connectionCount(): number {
    return this.byConnection.size;
  }

  /** Sends one connected socket its current roster, including initial/reset empty state. */
  async sendRoster(connectionId: string): Promise<DeliveryOutcome | undefined> {
    const connected = this.byConnection.get(connectionId);
    if (connected !== undefined)
      return connected.socket.send(wsPresence(this.rosterFor(connectionId)));
    return undefined;
  }

  /**
   * Sends each affected work package's roster only to its current members. Empty
   * work packages have no recipients; unprojected sockets receive explicit initial
   * or reset state through {@link sendRoster}. Each work package is serialized once.
   * Returns retirement outcomes; unexpected recipient rejections propagate after
   * all recipients have been dispatched.
   */
  broadcast(workPackageIds: readonly string[]): Promise<DeliveryOutcome[]> {
    const deliveries: Promise<DeliveryOutcome>[] = [];
    // Proof: restoring the global loop sends 1000 unrelated frames in the large
    // newcomer case; real-socket unrelated counts become [1,1,1,1] instead of zeros.
    for (const workPackageId of new Set(workPackageIds)) {
      const payload = wsPresence(this.list(workPackageId));
      for (const connectionId of this.byWorkPackage.get(workPackageId) ?? []) {
        deliveries.push(this.connectionIn(workPackageId, connectionId).socket.send(payload));
      }
    }
    // Proof: removing this return detaches the rejected recipient in delivery.integration.test.ts.
    return Promise.all(deliveries);
  }

  /** A missing member is index drift, never an absent optional connection. */
  private connectionIn(workPackageId: string, connectionId: string): Connected {
    const connected = this.byConnection.get(connectionId);
    // Proof: omitting removeMember's deletion makes the two-tab disconnect case
    // throw "presence: tab1 is in work-package-hull but is not connected" here.
    if (connected === undefined) {
      throw new Error(`presence: ${connectionId} is in ${workPackageId} but is not connected`);
    }
    return connected;
  }
}
