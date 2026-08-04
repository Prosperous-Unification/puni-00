export interface PresenceSocket {
  send(s: string): void;
}

/**
 * Who is connected right now, keyed by connection rather than by user: one
 * person with two tabs is two connections and must survive closing one of
 * them. `list()` therefore deduplicates, while `leave()` does not.
 *
 * This is deliberately in-memory and per-process. gw-01 runs as a single
 * container per environment; the moment a second replica exists this becomes
 * a per-replica view and needs a shared backplane. That is a real limit, not
 * an oversight — it is why `list()` describes "this gateway", not "the system".
 */
export class Presence {
  private readonly byConnection = new Map<string, { username: string; socket: PresenceSocket }>();

  join(connectionId: string, username: string, socket: PresenceSocket): void {
    this.byConnection.set(connectionId, { username, socket });
  }

  leave(connectionId: string): void {
    this.byConnection.delete(connectionId);
  }

  /** Distinct usernames, sorted so the front end renders a stable order. */
  list(): string[] {
    return [...new Set([...this.byConnection.values()].map((e) => e.username))].sort();
  }

  usernameOf(connectionId: string): string | null {
    return this.byConnection.get(connectionId)?.username ?? null;
  }

  get connectionCount(): number {
    return this.byConnection.size;
  }

  /**
   * Sends the current roster to every open connection. A send that throws —
   * a socket closed between the map lookup and the write — must not stop the
   * remaining clients from being told, so each is isolated.
   */
  broadcast(): void {
    const payload = JSON.stringify({ type: 'presence', users: this.list() });
    for (const { socket } of this.byConnection.values()) {
      try {
        socket.send(payload);
      } catch {
        // Dropped connection; `leave` arrives via the close handler.
      }
    }
  }
}
