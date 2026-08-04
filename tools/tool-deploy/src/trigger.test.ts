import { describe, expect, it } from 'bun:test';

import { decide, parseGreenRuns, runTrigger, type TriggerDeps, type TriggerState } from './trigger';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);

function runs(entries: Record<string, unknown>[]): string {
  return JSON.stringify(entries);
}

function green(sha: string): Record<string, unknown> {
  return { headSha: sha, status: 'completed', conclusion: 'success', displayTitle: 'a commit' };
}

describe('decide', () => {
  it('deploys a green commit it has not attempted', () => {
    expect(decide({ sha: SHA }, { attempted: [] })).toEqual({
      deploy: true,
      sha: SHA,
      reason: `${SHA.slice(0, 7)} is green and has not been attempted`,
    });
  });

  it('does nothing when no commit is green yet', () => {
    expect(decide(null, { attempted: [] }).deploy).toBe(false);
  });

  /**
   * The failure this prevents: a commit whose deploy failed is still the
   * newest green commit, so a trigger keyed on "did it succeed" redeploys it
   * every tick and re-notifies every tick. Keyed on "was it attempted", it
   * stops after one, and a pushed fix — a new sha — resumes it.
   */
  it('does not retry a commit it already attempted, successful or not', () => {
    expect(decide({ sha: SHA }, { attempted: [SHA] }).deploy).toBe(false);
  });

  it('attempts a newer commit after an older one failed', () => {
    expect(decide({ sha: OTHER }, { attempted: [SHA] })).toMatchObject({
      deploy: true,
      sha: OTHER,
    });
  });
});

describe('parseGreenRuns', () => {
  it('takes the newest completed successful run', () => {
    expect(parseGreenRuns(runs([green(SHA), green(OTHER)]))?.sha).toBe(SHA);
  });

  it('skips a failed run and finds the green one behind it', () => {
    const failed = { headSha: OTHER, status: 'completed', conclusion: 'failure' };
    expect(parseGreenRuns(runs([failed, green(SHA)]))?.sha).toBe(SHA);
  });

  /**
   * An in-flight run has conclusion "". Reading that as anything but "not
   * yet" deploys a commit whose gate has not finished — the exact thing the
   * green-main rule exists to prevent.
   */
  it('treats an in-progress run as not green', () => {
    const running = { headSha: SHA, status: 'in_progress', conclusion: '' };
    expect(parseGreenRuns(runs([running]))).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(parseGreenRuns('[]')).toBeNull();
  });

  /**
   * R5: a broken `gh` and "nothing to deploy" are different facts and must not
   * produce the same answer. Without the throw, a `gh` that fails — expired
   * token, rate limit, network — reads as "no commit is green yet" on every
   * tick, and dev sits frozen at whatever it last deployed with nothing in the
   * logs saying why.
   *
   * Proof: replacing the JSON.parse try/catch with `return null` fails this
   * test and only this one — 1 failed, 16 passed. Observed 2026-08-04.
   */
  it('throws rather than reporting "nothing green" when gh returns garbage', () => {
    expect(() => parseGreenRuns('not json at all')).toThrow(/did not return JSON/);
  });

  it('throws when a run has no headSha rather than guessing a commit', () => {
    expect(() => parseGreenRuns(runs([{ status: 'completed', conclusion: 'success' }]))).toThrow(
      /no headSha/,
    );
  });
});

function fakeDeps(overrides: Partial<TriggerDeps> = {}): TriggerDeps {
  let state: TriggerState = { attempted: [] };
  return {
    listRuns: () => Promise.resolve(runs([green(SHA)])),
    readState: () => Promise.resolve(state),
    writeState: (s) => {
      state = s;
      return Promise.resolve();
    },
    acquireLock: () => Promise.resolve(() => Promise.resolve()),
    deploy: () => Promise.resolve(),
    notify: () => Promise.resolve(),
    ...overrides,
  };
}

describe('runTrigger', () => {
  it('deploys the newest green commit', async () => {
    const deployed: string[] = [];
    const r = await runTrigger(
      fakeDeps({ deploy: (sha) => (deployed.push(sha), Promise.resolve()) }),
    );
    expect(r.deployed).toBe(SHA);
    expect(deployed).toEqual([SHA]);
  });

  it('does nothing at all when another deploy holds the lock', async () => {
    const deployed: string[] = [];
    const r = await runTrigger(
      fakeDeps({
        acquireLock: () => Promise.resolve(null),
        deploy: (sha) => (deployed.push(sha), Promise.resolve()),
        listRuns: () => Promise.reject(new Error('must not even ask GitHub')),
      }),
    );
    expect(r.deployed).toBeNull();
    expect(deployed).toEqual([]);
  });

  it('releases the lock even when the deploy throws', async () => {
    let released = false;
    await runTrigger(
      fakeDeps({
        acquireLock: () =>
          Promise.resolve(() => {
            released = true;
            return Promise.resolve();
          }),
        deploy: () => Promise.reject(new Error('publish: boom')),
      }),
    );
    expect(released).toBe(true);
  });

  it('records the commit before deploying, so a crash mid-deploy is not retried', async () => {
    const writes: TriggerState[] = [];
    await runTrigger(
      fakeDeps({
        writeState: (s) => (writes.push(s), Promise.resolve()),
        deploy: () => Promise.reject(new Error('died half-way')),
      }),
    );
    expect(writes).toEqual([{ attempted: [SHA] }]);
  });

  it('notifies once on failure, naming the commit and the failing step', async () => {
    const sent: string[] = [];
    await runTrigger(
      fakeDeps({
        notify: (m) => (sent.push(m), Promise.resolve()),
        deploy: () => Promise.reject(new Error('smoke: /health returned 502')),
      }),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain(SHA.slice(0, 7));
    expect(sent[0]).toContain('smoke: /health returned 502');
  });

  it('says nothing on success', async () => {
    const sent: string[] = [];
    await runTrigger(fakeDeps({ notify: (m) => (sent.push(m), Promise.resolve()) }));
    expect(sent).toEqual([]);
  });

  it('is silent and idempotent on a second tick with no new commit', async () => {
    let state: TriggerState = { attempted: [] };
    const deployed: string[] = [];
    const deps = fakeDeps({
      readState: () => Promise.resolve(state),
      writeState: (s) => {
        state = s;
        return Promise.resolve();
      },
      deploy: (sha) => (deployed.push(sha), Promise.resolve()),
    });
    await runTrigger(deps);
    await runTrigger(deps);
    expect(deployed).toEqual([SHA]);
  });
});
