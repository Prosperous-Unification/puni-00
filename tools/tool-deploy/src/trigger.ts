/**
 * The unattended half of the pipeline: decide whether the newest green commit
 * on `main` should be deployed to an environment, and if so, do it once.
 *
 * Why a poller and not a GitHub Actions runner: this repo is public. A
 * self-hosted runner would give any fork's pull request code execution on the
 * build host, which holds the prod SSH key, the registry credentials and a
 * GitHub token. Nothing here accepts an inbound connection; it only asks.
 *
 * Everything that decides is pure and lives above `runTrigger`. The IO —
 * `gh`, `flock`, the state file, the notifier — is injected, so the decision
 * table is tested without a network, a lock, or a deploy.
 */

export interface GreenCommit {
  sha: string;
  /** Only for the operator-facing message; never used to decide anything. */
  title?: string;
}

/** What the trigger remembers between runs. One entry per commit it has tried. */
export interface TriggerState {
  /** Commits already attempted, successful or not. A commit is attempted once. */
  attempted: string[];
}

export type Decision =
  | { deploy: false; reason: string }
  | { deploy: true; sha: string; reason: string };

/**
 * The whole decision, as a pure function of two inputs.
 *
 * `attempted`, not `deployed`: a commit whose deploy FAILED must not be
 * retried on the next tick. Retrying it would redeploy the same broken commit
 * every three minutes and send the same notification with it, and the failure
 * is not going to fix itself without a new commit. The escape hatch is pushing
 * a fix, which produces a new sha, which is not in `attempted`.
 */
export function decide(newestGreen: GreenCommit | null, state: TriggerState): Decision {
  if (newestGreen === null) {
    return { deploy: false, reason: 'no commit on main has a successful ci run yet' };
  }
  if (state.attempted.includes(newestGreen.sha)) {
    return { deploy: false, reason: `${newestGreen.sha.slice(0, 7)} was already attempted` };
  }
  return {
    deploy: true,
    sha: newestGreen.sha,
    reason: `${newestGreen.sha.slice(0, 7)} is green and has not been attempted`,
  };
}

/**
 * Parses `gh run list --json headSha,conclusion,status,headBranch`.
 *
 * Fails closed on malformed input rather than treating it as "nothing to
 * deploy" (R5): an empty list and a broken `gh` are different facts, and only
 * the first one means "wait".
 */
export function parseGreenRuns(json: string): GreenCommit | null {
  let runs: unknown;
  try {
    runs = JSON.parse(json);
  } catch (e) {
    throw new Error(`gh run list did not return JSON (${e instanceof Error ? e.message : ''})`);
  }
  if (!Array.isArray(runs)) {
    throw new Error('gh run list returned something other than an array');
  }
  for (const raw of runs) {
    const run = raw as Record<string, unknown>;
    const sha = run['headSha'];
    const conclusion = run['conclusion'];
    const status = run['status'];
    if (typeof sha !== 'string' || sha === '') {
      throw new Error('a run in gh run list has no headSha — refusing to guess which commit');
    }
    // `completed` + `success` together. A run still in progress has
    // conclusion "", and treating that as anything but "not yet" would deploy
    // a commit whose gate has not finished.
    if (status === 'completed' && conclusion === 'success') {
      const title = run['displayTitle'];
      return { sha, ...(typeof title === 'string' ? { title } : {}) };
    }
  }
  return null;
}

export interface TriggerDeps {
  /** Newest-first list of ci runs on main, as JSON from `gh run list`. */
  listRuns: () => Promise<string>;
  readState: () => Promise<TriggerState>;
  writeState: (state: TriggerState) => Promise<void>;
  /** Non-blocking. Returns a release function, or null when another run holds it. */
  acquireLock: () => Promise<(() => Promise<void>) | null>;
  /** Build images and deploy them. Throws with a step name on failure. */
  deploy: (sha: string) => Promise<void>;
  notify: (message: string) => Promise<void>;
  log?: (message: string) => void;
}

export interface TriggerResult {
  deployed: string | null;
  reason: string;
}

/**
 * One tick. Never throws for an ordinary failure — a timer unit that exits
 * non-zero on a red deploy would put the unit itself into a failed state and
 * stop future ticks, which turns one broken commit into a silently dead
 * environment.
 */
export async function runTrigger(deps: TriggerDeps): Promise<TriggerResult> {
  const log = deps.log ?? (() => undefined);

  // Taken before anything expensive, and never waited on: a tick that queues
  // behind a human's deploy would run against a repo state the human has since
  // changed, and ticks arrive again in minutes anyway.
  const release = await deps.acquireLock();
  if (release === null) {
    return { deployed: null, reason: 'another deploy holds the build-host lock' };
  }

  try {
    const newestGreen = parseGreenRuns(await deps.listRuns());
    const state = await deps.readState();
    const decision = decide(newestGreen, state);
    if (!decision.deploy) {
      log(`[trigger] no-op: ${decision.reason}`);
      return { deployed: null, reason: decision.reason };
    }

    // Recorded BEFORE the deploy, not after. A deploy that dies half-way —
    // or takes the machine down with it — must still count as attempted, or
    // the next tick retries a commit that may have left the environment
    // part-swapped.
    await deps.writeState({ attempted: [...state.attempted, decision.sha] });

    log(`[trigger] deploying ${decision.sha}`);
    try {
      await deps.deploy(decision.sha);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await deps.notify(`dev deploy of ${decision.sha.slice(0, 7)} failed: ${message}`);
      return { deployed: null, reason: `deploy failed: ${message}` };
    }
    return { deployed: decision.sha, reason: decision.reason };
  } finally {
    await release();
  }
}
