import { describe, expect, it } from 'bun:test';

import {
  BOOT_CONVERGENCE_BUDGET,
  bootCommitOf,
  type BootCommitTier,
  type BootConvergenceDependencies,
  type BootObservation,
  convergeBootCommits,
} from './boot-convergence';

const OLD = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const BUDGET = { watchMs: 10_000, restartMs: 20_000, pollMs: 1_000 };

interface Harness {
  dependencies: BootConvergenceDependencies;
  events: string[];
}

/**
 * A fake clock that only moves when the code under test sleeps, and tiers
 * whose answer is a function of how many restarts have happened and how long
 * since the last one.
 */
function harness(
  tiers: Record<string, (restarts: number, sinceMs: number) => BootObservation>,
): Harness {
  const events: string[] = [];
  let clock = 0;
  let restartedAt = 0;
  let restarts = 0;
  const fakeTiers: BootCommitTier[] = Object.entries(tiers).map(([name, answer]) => ({
    name,
    observe: () => {
      events.push(`observe ${name} @${String(clock)}`);
      return Promise.resolve(answer(restarts, clock - restartedAt));
    },
  }));
  return {
    events,
    dependencies: {
      tiers: fakeTiers,
      restart: () => {
        restarts += 1;
        restartedAt = clock;
        events.push(`restart @${String(clock)}`);
        return Promise.resolve();
      },
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
      log: (line) => events.push(line),
    },
  };
}

const booted = (commit: string): BootObservation => ({ kind: 'booted', commit });

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected a rejection');
}

describe('convergeBootCommits', () => {
  it('returns at once when every tier already booted the new HEAD', async () => {
    const { dependencies, events } = harness({ 'be-01': () => booted(HEAD) });

    await convergeBootCommits(HEAD, dependencies, { budget: BUDGET });

    expect(events).toEqual(['observe be-01 @0']);
  });

  it('waits for a watcher that reloads inside the window, and restarts nothing', async () => {
    const { dependencies, events } = harness({
      'be-01': (_restarts, since) => (since >= 3_000 ? booted(HEAD) : booted(OLD)),
    });

    await convergeBootCommits(HEAD, dependencies, { budget: BUDGET });

    expect(events.filter((event) => event.startsWith('restart'))).toEqual([]);
    expect(events.at(-1)).toBe('observe be-01 @3000');
  });

  it('restarts a tier the watcher never reloaded, then accepts its new boot', async () => {
    const { dependencies, events } = harness({
      'be-01': (restarts, since) => (restarts === 1 && since >= 2_000 ? booted(HEAD) : booted(OLD)),
    });

    await convergeBootCommits(HEAD, dependencies, { budget: BUDGET });

    expect(events.filter((event) => event.startsWith('restart'))).toEqual(['restart @10000']);
    expect(events.at(-1)).toBe(`[dev-sync] every tier booted ${HEAD} after the restart`);
  });

  it('restarts a tier whose boot commit never moves, then reports it', async () => {
    const { dependencies, events } = harness({ 'be-01': () => booted(OLD) });

    const message = await rejection(convergeBootCommits(HEAD, dependencies, { budget: BUDGET }));

    expect(message).toContain(`dev is not running ${HEAD} after a restart`);
    expect(message).toContain(`be-01 booted ${OLD}`);
    expect(events.filter((event) => event.startsWith('restart'))).toEqual(['restart @10000']);
    // Bounded: one observation per poll across both windows, then the throw.
    expect(events.filter((event) => event.startsWith('observe'))).toHaveLength(11 + 21);
    expect(events.at(-1)).toBe('observe be-01 @30000');
  });

  it('gives a deploy that already restarted the cold-boot window', async () => {
    const { dependencies, events } = harness({
      'be-01': (_restarts, since) => (since >= 15_000 ? booted(HEAD) : booted(OLD)),
    });

    await convergeBootCommits(HEAD, dependencies, { budget: BUDGET, restarted: true });

    expect(events.filter((event) => event.startsWith('restart'))).toEqual([]);
    expect(events.at(-1)).toBe('observe be-01 @15000');
  });

  it('treats an unreadable tier as not yet booted, and names why when it never answers', async () => {
    const { dependencies } = harness({
      'be-01': () => ({ kind: 'unreported', reason: 'health unreadable (exit 7)' }),
    });

    expect(await rejection(convergeBootCommits(HEAD, dependencies, { budget: BUDGET }))).toContain(
      'be-01: health unreadable (exit 7)',
    );
  });

  it('reports only the tiers still stale after the restart', async () => {
    const { dependencies } = harness({
      'be-01': (restarts) => (restarts === 1 ? booted(HEAD) : booted(OLD)),
      'gw-01': () => booted(OLD),
    });

    const message = await rejection(convergeBootCommits(HEAD, dependencies, { budget: BUDGET }));

    expect(message).toContain(`gw-01 booted ${OLD}`);
    expect(message).not.toContain('be-01');
  });

  it('refuses a HEAD that is not a full SHA before observing anything', async () => {
    const { dependencies, events } = harness({ 'be-01': () => booted(HEAD) });

    expect(
      await rejection(convergeBootCommits('bbbbbbb', dependencies, { budget: BUDGET })),
    ).toContain('needs a full SHA');
    expect(events).toEqual([]);
  });

  it('keeps the production windows bounded', () => {
    expect(BOOT_CONVERGENCE_BUDGET.watchMs).toBeGreaterThan(0);
    expect(BOOT_CONVERGENCE_BUDGET.restartMs).toBeGreaterThanOrEqual(
      BOOT_CONVERGENCE_BUDGET.watchMs,
    );
    expect(BOOT_CONVERGENCE_BUDGET.watchMs + BOOT_CONVERGENCE_BUDGET.restartMs).toBeLessThanOrEqual(
      5 * 60_000,
    );
  });
});

describe('bootCommitOf', () => {
  it.each([
    [
      'a healthy answer',
      JSON.stringify({ status: 'ok', commit: HEAD, bootCommit: OLD }),
      booted(OLD),
    ],
    [
      'a 503 still names the running code',
      JSON.stringify({
        error: 'dependency_unavailable',
        status: 'migrating',
        commit: HEAD,
        bootCommit: HEAD,
      }),
      booted(HEAD),
    ],
    [
      'a process from before the field',
      JSON.stringify({ status: 'ok', commit: HEAD }),
      { kind: 'unreported', reason: 'health has no bootCommit' },
    ],
    [
      'a checkout unreadable at boot',
      JSON.stringify({ status: 'ok', commit: HEAD, bootCommit: null }),
      { kind: 'unreported', reason: 'bootCommit is null' },
    ],
    [
      'an abbreviated commit',
      JSON.stringify({ status: 'ok', commit: HEAD, bootCommit: 'b'.repeat(39) }),
      { kind: 'unreported', reason: `bootCommit is "${'b'.repeat(39)}"` },
    ],
    [
      'a truncated body',
      '{"status":"ok","bootCommit":',
      { kind: 'unreported', reason: 'health body is not JSON' },
    ],
    ['a JSON non-object', 'null', { kind: 'unreported', reason: 'health has no bootCommit' }],
  ] as const)('reads %s', (_label, body, expected) => {
    expect(bootCommitOf(body)).toEqual(expected);
  });
});
