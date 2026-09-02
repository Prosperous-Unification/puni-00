import { wsPresence } from '@wbs/contracts';

export interface PresenceSocket {
  send(s: string): void;
}

/** What a connection that has named no project is shown, and put in. */
const NOBODY: string[] = [];

interface Connected {
  username: string;
  socket: PresenceSocket;
  /**
   * The project this connection subscribed to, or null while it has named
   * none. See {@link Presence.enterProject} for why it is one and not a set.
   */
  projectId: string | null;
}

/**
 * Who is in a project right now, keyed by connection rather than by user: one
 * person with two tabs is two connections and must survive closing one of
 * them. `list()` therefore deduplicates, while `leave()` does not.
 *
 * **A roster is a project's, never the gateway's.** It used to be the gateway's:
 * `list()` returned every connected username with no filter at all, so a project
 * created a second ago showed every account that happened to have a socket open
 * — observed live, 2026-08-09, and the reason this class now knows what a
 * project is. A connection joins a roster by subscribing to `project:<id>`
 * ({@link enterProject}); until it does it belongs to **nothing** — it is in no
 * project's roster and is shown an empty one. That is the honest answer for a
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
   * The connections in each project, so a roster is a lookup rather than a scan.
   *
   * `list()` filtered every connection the gateway holds, and `broadcast()`
   * calls it once per distinct project — O(connections × projects) per join,
   * per subscribe and per leave, on the one class that runs on every socket
   * event. It is O(members) per project now, and the broadcast is one pass.
   *
   * Two indexes over one fact, which is a thing to keep honest rather than a
   * thing to be pleased about: every write below moves both, and
   * `presence.test.ts`'s `the two indexes never disagree` walks a thousand
   * random join/subscribe/move/leave sequences comparing `list()` against a
   * full scan.
   */
  private readonly byProject = new Map<string, Set<string>>();

  join(connectionId: string, username: string, socket: PresenceSocket): void {
    // A rejoin on the same id must not leave the old entry in a project's set:
    // `leave` is what takes it out, and it is idempotent.
    this.leave(connectionId);
    this.byConnection.set(connectionId, { username, socket, projectId: null });
  }

  leave(connectionId: string): void {
    const connected = this.byConnection.get(connectionId);
    if (connected?.projectId != null) this.membersOf(connected.projectId).delete(connectionId);
    this.byConnection.delete(connectionId);
  }

  /** The set for `projectId`, made on first use and never left empty behind. */
  private membersOf(projectId: string): Set<string> {
    const held = this.byProject.get(projectId);
    if (held !== undefined) return held;
    const made = new Set<string>();
    this.byProject.set(projectId, made);
    return made;
  }

  /**
   * Puts a connection in a project's roster, taking it out of any other.
   *
   * One project per connection, not a set: the roster answers "who else is
   * looking at this with me", and a socket showing one project at a time can
   * only be looking at one. A second `project:` subscribe on the same socket is
   * therefore a move — the browser switched project — rather than a second
   * membership, and a socket in two rosters would have no single roster to be
   * broadcast.
   *
   * A connection this does not know is one that never joined: its token did not
   * verify at `open` (see gw-01's `app.ts`), so it has no username and no
   * roster can hold it. Not an invariant failure — a modelled state of the
   * socket, and the only thing to do with it is nothing.
   */
  enterProject(connectionId: string, projectId: string): void {
    const connected = this.byConnection.get(connectionId);
    if (connected === undefined) return;
    if (connected.projectId != null) this.membersOf(connected.projectId).delete(connectionId);
    connected.projectId = projectId;
    this.membersOf(projectId).add(connectionId);
  }

  /**
   * Takes a connection out of a project's roster, if that is the one it is in.
   *
   * Guarded on the id rather than clearing outright: an `unsubscribe` naming a
   * project this connection has already moved off must not empty the roster of
   * the one it moved **to**. A browser that switches projects sends both frames
   * and their order is the network's, not ours.
   */
  leaveProject(connectionId: string, projectId: string): void {
    const connected = this.byConnection.get(connectionId);
    if (connected?.projectId !== projectId) return;
    connected.projectId = null;
    this.membersOf(projectId).delete(connectionId);
  }

  /** Distinct usernames in `projectId`, sorted so the front end renders a stable order. */
  list(projectId: string): string[] {
    const names = new Set<string>();
    for (const connectionId of this.byProject.get(projectId) ?? []) {
      const held = this.byConnection.get(connectionId);
      // Unknown is not OK anywhere it could hide a bug, and here it would hide
      // the one this index can have: a connection in a project's set that
      // `leave` did not take out. Nothing in this class can produce it, and if
      // something does, a silent skip would show as a roster quietly missing a
      // name.
      if (held === undefined) {
        throw new Error(`presence: ${connectionId} is in ${projectId} but is not connected`);
      }
      names.add(held.username);
    }
    return [...names].sort();
  }

  /**
   * The roster this connection is entitled to see: its own project's.
   *
   * Empty for a connection in no project, which is what a socket that has
   * connected and not yet subscribed gets when it asks `who`.
   */
  rosterFor(connectionId: string): string[] {
    const projectId = this.byConnection.get(connectionId)?.projectId;
    return projectId == null ? [...NOBODY] : this.list(projectId);
  }

  usernameOf(connectionId: string): string | null {
    return this.byConnection.get(connectionId)?.username ?? null;
  }

  get connectionCount(): number {
    return this.byConnection.size;
  }

  /**
   * Sends every open connection **its own project's** roster.
   *
   * One payload per project rather than per socket: the roster is the same
   * string for every connection in a project, and a busy project would
   * otherwise serialise it once per person in it.
   *
   * A send that throws — a socket closed between the map lookup and the write —
   * must not stop the remaining clients from being told, so each is isolated.
   */
  broadcast(): void {
    const empty = wsPresence(NOBODY);
    const payloads = new Map<string, string>();
    for (const { socket, projectId } of this.byConnection.values()) {
      let payload = empty;
      if (projectId !== null) {
        let forProject = payloads.get(projectId);
        if (forProject === undefined) {
          forProject = wsPresence(this.list(projectId));
          payloads.set(projectId, forProject);
        }
        payload = forProject;
      }
      try {
        socket.send(payload);
      } catch {
        // Dropped connection; `leave` arrives via the close handler.
      }
    }
  }
}
