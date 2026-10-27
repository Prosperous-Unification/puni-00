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
 * docs-only commit reloads nothing, so it spends the whole window and then
 * restarts. Two minutes after a restart matches a cold `bun run dev` with
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
    if (stale.size === 0 || dependencies.now() >= deadline) return stale;
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
 * @throws when a tier still has not booted `head` after the restart window,
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
  const firstWindowMs = options.restarted === true ? budget.restartMs : budget.watchMs;
  const watched = await observeStale(head, dependencies, firstWindowMs, budget.pollMs);
  if (watched.size === 0) return;
  dependencies.log(
    `[dev-sync] not running ${head} after ${String(firstWindowMs)}ms (${describeStale(watched)}); restarting`,
  );
  // Proof: with this call removed, `restarts a tier the watcher never
  // reloaded, then accepts its new boot` failed on its restart events, and
  // the restart-fixes sync() rehearsal failed on its docker calls.
  await dependencies.restart();
  const restarted = await observeStale(head, dependencies, budget.restartMs, budget.pollMs);
  if (restarted.size === 0) {
    dependencies.log(`[dev-sync] every tier booted ${head} after the restart`);
    return;
  }
  throw new Error(
    `dev is not running ${head} after a restart and ${String(budget.restartMs)}ms: ${describeStale(restarted)}.\n` +
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
export function containerBootDependencies(containerName: string): BootConvergenceDependencies {
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
    now: () => Date.now(),
    sleep: (ms) => Bun.sleep(ms),
    log: (line) => {
      console.log(line);
    },
  };
}
