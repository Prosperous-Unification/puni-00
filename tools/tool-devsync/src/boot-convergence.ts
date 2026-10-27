import { $ } from 'bun';

/** A full object name; `/health` never abbreviates one. */
const SHA = /^[0-9a-f]{40}$/;

/**
 * What one tier's `/health` said about the code it runs.
 *
 * `unreported` is a modeled state, not an error: a tier restarting under its
 * watcher is briefly unreachable, and one still running code from before
 * `bootCommit` existed has no such field. Either converges or is reported by
 * {@link convergeBootCommits} once its budget is spent.
 */
export type BootObservation =
  { kind: 'booted'; commit: string } | { kind: 'unreported'; reason: string };

/** A process whose boot commit a deploy waits for. */
export interface BootCommitTier {
  name: string;
  observe(): Promise<BootObservation>;
}

export interface BootConvergenceDependencies {
  tiers: readonly BootCommitTier[];
  /** Restarts every tier process; the only repair this tool has for a stale one. */
  restart(): Promise<void>;
  /**
   * Whether moving from `from` to `to` changes nothing a watcher reloads, so
   * waiting for one is pointless. Answering false only costs the full window.
   */
  reloadsNothing(from: string, to: string): Promise<boolean>;
  now(): number;
  sleep(ms: number): Promise<void>;
  log(line: string): void;
}

/** How long each phase may observe, and how often. */
export interface BootConvergenceBudget {
  /** After the reset, for the watchers to reload by themselves. */
  watchMs: number;
  /** After the restart, for every tier to boot again, migrations included. */
  restartMs: number;
  pollMs: number;
}

/**
 * Thirty seconds covers a `bun --watch` reload of be-01 measured in seconds; a
 * commit that reloads nothing restarts at once instead (see
 * {@link BootConvergenceDependencies.reloadsNothing}). Two minutes after a restart matches a cold `bun run dev` with
 * migrations on boot.
 */
export const BOOT_CONVERGENCE_BUDGET: BootConvergenceBudget = {
  watchMs: 30_000,
  restartMs: 120_000,
  pollMs: 2_000,
};

export interface BootConvergenceOptions {
  budget?: BootConvergenceBudget;
  /** The deploy has just restarted the container itself. */
  restarted?: boolean;
}

/**
 * The exit `sync.ts` reports for a reset that landed while the processes did
 * not boot it. `bin/dev-poll.sh` maps it to "synced, unproven": later ticks
 * retry only the `/health` proof, never the reset or the restart.
 */
export const STALE_BOOT_EXIT_CODE = 76;

/** The checkout moved and the restart was spent, but a tier still runs another commit. */
export class StaleBootError extends Error {
  override readonly name = 'StaleBootError';
}

/** Reads `bootCommit` from a `/health` body, whatever its status. */
export function bootCommitOf(body: string): BootObservation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // A tier mid-restart can answer a truncated body; the window retries it.
    return { kind: 'unreported', reason: 'health body is not JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || !('bootCommit' in parsed)) {
    return { kind: 'unreported', reason: 'health has no bootCommit' };
  }
  const commit = parsed.bootCommit;
  if (typeof commit !== 'string' || !SHA.test(commit)) {
    return { kind: 'unreported', reason: `bootCommit is ${JSON.stringify(commit)}` };
  }
  return { kind: 'booted', commit };
}

function describeStale(stale: ReadonlyMap<string, BootObservation>): string {
  return [...stale]
    .map(([name, observed]) =>
      observed.kind === 'booted'
        ? `${name} booted ${observed.commit}`
        : `${name}: ${observed.reason}`,
    )
    .join('; ');
}

/** Observes until every tier booted `head` or the window closes; answers the stale ones. */
async function observeStale(
  head: string,
  dependencies: BootConvergenceDependencies,
  windowMs: number,
  pollMs: number,
  isHopeless: (stale: ReadonlyMap<string, BootObservation>) => Promise<boolean> = () =>
    Promise.resolve(false),
): Promise<Map<string, BootObservation>> {
  const deadline = dependencies.now() + windowMs;
  for (;;) {
    const stale = new Map<string, BootObservation>();
    for (const tier of dependencies.tiers) {
      const observed = await tier.observe();
      // Proof: with `&& observed.commit === head` removed, `restarts a tier
      // whose boot commit never moves, then reports it` and three sibling
      // cases failed, and sync.test.ts's stale rehearsal received
      // `(resolved without throwing)` (watched 2026-10-27).
      if (!(observed.kind === 'booted' && observed.commit === head)) {
        stale.set(tier.name, observed);
      }
    }
    // Proof: with `|| dependencies.now() >= deadline` removed, `restarts a tier
    // whose boot commit never moves, then reports it` failed on the harness's
    // `fake clock ran past` refusal instead of hanging (watched 2026-10-27).
    if (stale.size === 0 || dependencies.now() >= deadline || (await isHopeless(stale))) {
      return stale;
    }
    await dependencies.sleep(pollMs);
  }
}

/**
 * Proves every tier runs `head`, restarting once if the watchers did not get
 * there, and throws if a restart did not either.
 *
 * `/health`'s `commit` follows the checkout, so it proved a reset landed while
 * be-01 kept serving the previous commit for hours (2026-10-26: `bun --watch`
 * missed the poller's reset; `docker restart` fixed it). `bootCommit` is read
 * once at boot, so only it can say which code answers.
 *
 * @throws {StaleBootError} when a tier still has not booted `head` after the restart window,
 *   naming each such tier, what it reported, and the manual repair.
 */
export async function convergeBootCommits(
  head: string,
  dependencies: BootConvergenceDependencies,
  options: BootConvergenceOptions = {},
): Promise<void> {
  if (!SHA.test(head)) throw new Error(`boot convergence needs a full SHA, got ${head}`);
  const budget = options.budget ?? BOOT_CONVERGENCE_BUDGET;
  // A deploy that already restarted for a `RESTART_PATHS` change is waiting
  // on a cold boot, not a watcher reload, so it gets the cold-boot window.
  // Proof: with `budget.watchMs` used unconditionally, `gives a deploy that
  // already restarted the cold-boot window` restarted at 10000.
  const restarted = options.restarted === true;
  const firstWindowMs = restarted ? budget.restartMs : budget.watchMs;
  // Only before a restart: a watcher has nothing to reload when every stale
  // tier booted a commit whose difference from `head` no watcher sees, so
  // waiting cannot help. After a restart an old boot commit means "not booted
  // yet", and the window must run. This can only restart sooner, never skip.
  // Proof: with this predicate answering false, `restarts at once when the
  // reset reloads nothing` failed on its event order (watched 2026-10-27).
  const shortcut = { taken: false };
  const reloadsNothing = async (stale: ReadonlyMap<string, BootObservation>) => {
    if (restarted) return false;
    for (const observed of stale.values()) {
      if (observed.kind !== 'booted') return false;
      if (!(await dependencies.reloadsNothing(observed.commit, head))) return false;
    }
    shortcut.taken = true;
    return true;
  };
  const watched = await observeStale(
    head,
    dependencies,
    firstWindowMs,
    budget.pollMs,
    reloadsNothing,
  );
  if (watched.size === 0) return;
  const waited = shortcut.taken ? 'a reset no watcher reloads' : `${String(firstWindowMs)}ms`;
  dependencies.log(
    `[dev-sync] not running ${head} after ${waited} (${describeStale(watched)}); restarting`,
  );
  // Proof: with this call removed, `restarts a tier the watcher never
  // reloaded, then accepts its new boot` failed on its restart events, and
  // the restart-fixes sync() rehearsal failed on its docker calls.
  await dependencies.restart();
  const afterRestart = await observeStale(head, dependencies, budget.restartMs, budget.pollMs);
  if (afterRestart.size === 0) {
    dependencies.log(`[dev-sync] every tier booted ${head} after the restart`);
    return;
  }
  throw new StaleBootError(
    `dev is not running ${head} after a restart and ${String(budget.restartMs)}ms: ${describeStale(afterRestart)}.\n` +
      '  The checkout is at the new commit; the processes are not. Read the tier log:\n' +
      '  ssh h2puni "docker logs --tail 100 wbs-dev-src"',
  );
}

/**
 * The production tiers and restart for one dev container: be-01's `/health`
 * read from inside it, as the poller reads it, and `docker restart`.
 *
 * Only be-01 reports a boot commit today. gw-01 and mcp-01 run under the same
 * `bun run dev` supervisor, so the restart this triggers covers them as well,
 * but their own staleness is not observed.
 */
/** Paths a dev watcher can import from; a change anywhere else reloads nothing. */
const WATCHED_ROOTS = ['apps', 'libs', 'tools'] as const;

export function containerBootDependencies(
  containerName: string,
  sourcePath: string,
): BootConvergenceDependencies {
  return {
    tiers: [
      {
        name: 'be-01',
        observe: async () => {
          const read =
            await $`docker exec ${containerName} curl -sS -m 5 http://127.0.0.1:3100/health`
              .quiet()
              .nothrow();
          if (read.exitCode !== 0) {
            return {
              kind: 'unreported',
              reason: `health unreadable (exit ${String(read.exitCode)}): ${read.stderr.toString().trim()}`,
            };
          }
          return bootCommitOf(read.stdout.toString());
        },
      },
    ],
    restart: async () => {
      // Proof: replacing this with a no-op failed both sync.test.ts rehearsals
      // on the docker calls they observed (no `restart`).
      await $`docker restart ${containerName}`;
    },
    reloadsNothing: async (from, to) => {
      const diff = await $`git -C ${sourcePath} diff --quiet ${from} ${to} -- ${WATCHED_ROOTS}`
        .quiet()
        .nothrow();
      // Exit 1 is "differs"; anything else (an unknown boot commit, say) is
      // not knowing, which answers false and keeps the full window.
      // Proof: answering `diff.exitCode !== 1` (true on a git error) failed
      // `waits the window when the boot commit is unknown to git` in sync.test.ts.
      return diff.exitCode === 0;
    },
    now: () => Date.now(),
    sleep: (ms) => Bun.sleep(ms),
    log: (line) => {
      console.log(line);
    },
  };
}
