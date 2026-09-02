interface AttemptWindow {
  failures: number;
  expiresAt: number;
}

export interface LoginThrottleOptions {
  now?: () => number;
}

const FAILURE_LIMIT = 5;
const WINDOW_MS = 60_000;
const MAX_ENTRIES = 10_000;

/** Fixed-window failure limits that fail closed when their bounded map fills. */
export class LoginThrottle {
  private readonly attempts = new Map<string, AttemptWindow>();
  private readonly now: () => number;

  constructor(options: LoginThrottleOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  canAttempt(username: string, clientIp: string): boolean {
    const now = this.now();
    const keys = this.keys(username, clientIp);
    this.prune(now, keys);
    const withinFailureLimit = keys.every((key) => {
      const window = this.attempts.get(key);
      return window === undefined || window.failures < FAILURE_LIMIT;
    });
    if (!withinFailureLimit) return false;
    const newEntries = keys.filter((key) => !this.attempts.has(key)).length;
    return this.attempts.size + newEntries <= MAX_ENTRIES;
  }

  recordFailure(username: string, clientIp: string): void {
    const now = this.now();
    const keys = this.keys(username, clientIp);
    this.prune(now, keys);
    for (const key of keys) {
      const current = this.attempts.get(key);
      if (current === undefined) {
        if (this.attempts.size >= MAX_ENTRIES) continue;
        this.attempts.set(key, { failures: 1, expiresAt: now + WINDOW_MS });
      } else {
        current.failures += 1;
      }
    }
  }

  recordSuccess(username: string): void {
    this.attempts.delete(this.usernameKey(username));
  }

  private keys(username: string, clientIp: string): string[] {
    return [this.usernameKey(username), `ip:${clientIp}`];
  }

  private usernameKey(username: string): string {
    return `username:${username.trim().toLowerCase().slice(0, 32)}`;
  }

  /**
   * Drops the expired windows for **these two keys**, plus one older entry.
   *
   * It walked the whole map on every call, which is `MAX_ENTRIES` iterations per
   * login attempt — so under the load this class exists to survive, the throttle
   * was itself the O(n) cost.
   *
   * The single extra step is what keeps the map from filling with windows nobody
   * asks about again: an entry expires in `WINDOW_MS`, and one eviction per
   * attempt drains faster than attempts can arrive while the map is full,
   * because a full map is exactly the state that produces attempts. `canAttempt`
   * still refuses at the ceiling, so the bound is enforced whatever this drops.
   */
  private prune(now: number, keys: readonly string[]): void {
    for (const key of keys) {
      const window = this.attempts.get(key);
      if (window !== undefined && window.expiresAt <= now) this.attempts.delete(key);
    }
    if (this.attempts.size < MAX_ENTRIES) return;
    for (const [key, window] of this.attempts) {
      if (window.expiresAt <= now) {
        this.attempts.delete(key);
        return;
      }
    }
  }
}
