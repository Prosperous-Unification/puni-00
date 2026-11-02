import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import {
  holdLegacyLock,
  legacyHoldDirectory,
  type LegacyLock,
  readLegacyQueue,
} from '../resources/legacy-lock';
import {
  type HostPoolModeName,
  HostPoolModeRefusal,
  type ModeRecord,
  processAlive,
  type ResourceConfiguration,
  type ResourceRuntime,
} from '../resources/runtime';
import { readCommittedCatalogue } from './catalogue';
import { causeText, OpsRefusal } from './refusal';

/** `ops pool switch-mode`'s parsed command line (J12). */
export interface SwitchModeRequest {
  readonly target: HostPoolModeName;
  readonly operator: string;
  readonly waitSeconds: number;
  readonly pollSeconds: number;
  readonly releaseGuard: boolean;
  readonly allowEmpty: boolean;
}

/** What `switch-mode` reaches outside its arguments. */
export interface SwitchModeDependencies {
  readonly now: () => number;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly legacyLock: LegacyLock;
  /** The account the record names beside the operator. */
  readonly account: string;
  readonly report: (line: string) => void;
}

/** The label the switch's own legacy holder records while it proves the shell lock drained. */
export const SWITCH_LABEL = 'dash-switch-mode';

/** The hold file of the switch's legacy holder; `watch` removes it once no switch is live. */
export function switchHoldFile(root: string): string {
  return join(legacyHoldDirectory(root), SWITCH_LABEL);
}

/** Git in `checkout` with `environment` (its `PATH` names the git), answering its streams. */
function git(
  checkout: string,
  environment: Readonly<Record<string, string | undefined>>,
  ...arguments_: string[]
): { status: number | null; stdout: string; stderr: string } {
  const answer = spawnSync('git', ['-C', checkout, ...arguments_], {
    encoding: 'utf8',
    timeout: 30_000,
    // Git's messages are matched below ("dubious ownership"): the C locale keeps them English.
    // Proof: without it `refuses a launcher checkout git distrusts, saying so, in any locale`
    // (host-pool-mode.test.ts) missed the German text (2026-11-02, review K6).
    env: { ...environment, LC_ALL: 'C' },
  });
  return { status: answer.status, stdout: answer.stdout, stderr: answer.stderr };
}

/** A catalogue entrypoint that is a shell launcher under `bin/`, which this check can read. */
const SHELL_LAUNCHER = /^bin\/[^#\s]+\.sh$/;
/** A non-comment line that enters through the shim. */
const CALLS_SHIM = /^(?!\s*#).*\brun_heavy_job\b/m;

/**
 * Verify each enrolled launcher checkout carries the shim (J12, review H7): it is the top of a
 * Git work tree git trusts; `bin/heavy-lock-lib.sh` at HEAD defines `run_heavy_job`; nothing
 * under `bin/` differs from HEAD, untracked files included, so the launchers that run are the
 * ones verified; and every catalogue entrypoint that is a `bin/*.sh` launcher calls
 * `run_heavy_job` at HEAD. Other entrypoints (a `package.json` script, a TypeScript module) are
 * named in the evidence as not checked. Returns one evidence line per checkout.
 * @throws OpsRefusal 64 when the configuration names no launcher checkout, 70 naming the first
 * checkout that is unreadable, untrusted by git, or lacks the shim.
 */
export function verifyLauncherCheckouts(
  checkouts: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): string[] {
  // Proof: without it `refuses a configuration naming no launcher checkout`
  // (host-pool-mode.test.ts) flipped with nothing verified (2026-11-02, Slice 6b).
  if (checkouts.length === 0)
    throw new OpsRefusal(
      64,
      'ops pool switch-mode: the configuration names no launcherCheckouts, so no launcher can be verified to carry run_heavy_job',
    );
  return checkouts.map((checkout) => {
    const refuse = (reason: string, cause?: unknown): never => {
      throw new OpsRefusal(
        70,
        `ops pool switch-mode: launcher checkout ${checkout} ${reason}`,
        cause === undefined ? undefined : { cause },
      );
    };
    let real = '';
    try {
      real = realpathSync(checkout);
    } catch (cause) {
      // Proof: without it `refuses a launcher checkout that is missing or not a work tree`
      // (host-pool-mode.test.ts) refused it as "not the top of a Git work tree" (2026-11-02, H7).
      refuse(`unreadable: ${causeText(cause)}`, cause);
    }
    const top = git(checkout, environment, 'rev-parse', '--show-toplevel');
    // Proof: without it `refuses a launcher checkout git distrusts, saying so`
    // (host-pool-mode.test.ts) named it "not the top of a Git work tree" (2026-11-02, H7).
    if (top.status !== 0 && top.stderr.includes('dubious ownership'))
      refuse(
        'is refused by git as of dubious ownership (owned by another account); the launchers there run as that account, so fix the ownership or the configuration',
      );
    // Proof: without it `refuses a launcher checkout that is missing or not a work tree`
    // (host-pool-mode.test.ts) verified a subdirectory of a checkout (2026-11-02, H7).
    if (top.status !== 0 || top.stdout.trim() !== real) refuse('is not the top of a Git work tree');
    const head = git(checkout, environment, 'rev-parse', '--verify', 'HEAD^{commit}').stdout.trim();
    const library = git(checkout, environment, 'show', 'HEAD:bin/heavy-lock-lib.sh');
    // Proof: without it `refuses a launcher checkout without the shim`
    // (host-pool-mode.test.ts) flipped beside a stale checkout (2026-11-02, Slice 6b).
    if (library.status !== 0 || !/^run_heavy_job\(\) \{$/m.test(library.stdout))
      refuse(
        `at ${head || 'no HEAD'} has no run_heavy_job in bin/heavy-lock-lib.sh; a launcher there would take the legacy lock alone`,
      );
    const changed = git(
      checkout,
      environment,
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--',
      'bin/',
    );
    // Proof: without it `refuses a launcher checkout without the shim, or whose working
    // library differs from HEAD` (host-pool-mode.test.ts) verified HEAD while the edited file
    // ran; `… whose bin/ holds an untracked launcher` likewise (2026-11-02, review H7).
    if (changed.status !== 0 || changed.stdout.trim() !== '')
      refuse(
        `has bin/ changed from HEAD ${head}: ${changed.stdout.trim().split('\n').slice(0, 3).join('; ') || changed.stderr.trim()}; commit or restore it`,
      );
    const unchecked: string[] = [];
    for (const job of readCommittedCatalogue(checkout, 'ops pool switch-mode').jobs) {
      if (!SHELL_LAUNCHER.test(job.entrypoint)) {
        unchecked.push(`${job.id} (${job.entrypoint})`);
        continue;
      }
      const launcher = git(checkout, environment, 'show', `HEAD:${job.entrypoint}`);
      // Proof: without it `refuses a launcher checkout whose launcher script was reverted`
      // (host-pool-mode.test.ts) flipped beside a gate launcher on with_heavy_lock (2026-11-02, H7).
      if (launcher.status !== 0 || !CALLS_SHIM.test(launcher.stdout))
        refuse(
          `at ${head}: ${job.entrypoint} (job type ${job.id}) does not call run_heavy_job; it would take the legacy lock alone`,
        );
    }
    return `launcher ${checkout} at ${head} carries run_heavy_job${unchecked.length === 0 ? '' : `; entrypoints not checked: ${unchecked.join(', ')}`}`;
  });
}

/**
 * Verify every concurrency-eligible type is named by some launcher checkout's catalogue at HEAD
 * (PR #816 review): an eligible id no catalogue names is a typo that would silently serialise
 * the type it meant. Returns the evidence line.
 *
 * `strict` (`ops pool init`, `switch-mode`): every checkout's catalogue must be readable at
 * HEAD. Otherwise (every other open, review K1 of #818) a checkout whose HEAD has no usable
 * catalogue names nothing and is listed as unverified: gate trees rest at whatever commit the
 * last gate pinned, a pre-catalogue branch included, and that must not stop the host.
 * @throws OpsRefusal 64 naming the first id no catalogue names, or, when strict, the first
 * checkout without a catalogue at HEAD.
 */
export function verifyEligibleTypes(
  eligible: readonly string[],
  checkouts: readonly string[],
  command = 'ops pool switch-mode',
  strict = true,
): string {
  const named = new Set<string>();
  const unverified: string[] = [];
  for (const checkout of checkouts) {
    let ids: string[];
    try {
      ids = readCommittedCatalogue(checkout, command).jobs.map((job) => job.id);
    } catch (cause) {
      // Proof: refusing here when not strict made `a launcher checkout parked at a
      // pre-catalogue commit does not stop ops job run` (host-pool-mode.test.ts) refuse 64
      // (2026-11-02, review K1).
      if (strict || !(cause instanceof OpsRefusal)) throw cause;
      const head = spawnSync('git', ['-C', checkout, 'rev-parse', '--short', 'HEAD'], {
        encoding: 'utf8',
      }).stdout.trim();
      unverified.push(`${checkout} unverified at ${head || 'no HEAD'}`);
      continue;
    }
    for (const id of ids) named.add(id);
  }
  for (const id of eligible)
    // Proof: without it `refuses an empty eligibility list unless --allow-empty, and
    // an eligible id no catalogue names` (host-pool-mode.test.ts)
    // flipped with the typo listed (2026-11-02, Slice 6b).
    if (!named.has(id))
      throw new OpsRefusal(
        64,
        `${command}: concurrencyEligible names ${id}, which no launcher checkout's catalogue names${unverified.length === 0 ? '' : ` (${unverified.join(', ')})`}`,
      );
  return `concurrency-eligible: ${eligible.length === 0 ? 'none' : eligible.join(', ')}${unverified.length === 0 ? '' : `; ${unverified.join(', ')}`}`;
}

/**
 * The eligibility check every `ops` pool open runs (review H6, S6B-A17): a typo added to
 * `concurrencyEligible` after `ops pool init` refuses 64 on the next open, `ops job run`'s
 * included, instead of silently serialising the type it meant. An empty list reads nothing.
 * Strict at `ops pool init`, lenient elsewhere (review K1, S6B-A22).
 * @throws OpsRefusal 64 as {@link verifyEligibleTypes} does.
 */
export function checkEligibleTypes(
  configuration: Pick<ResourceConfiguration, 'concurrencyEligible' | 'launcherCheckouts'>,
  command: string,
  strict = false,
): void {
  const eligible = configuration.concurrencyEligible ?? [];
  // Proof: without it `a typo added to concurrencyEligible after init refuses ops job run 64`
  // (host-pool-mode.test.ts) ran the job (2026-11-02, review H6).
  if (eligible.length > 0)
    verifyEligibleTypes(eligible, configuration.launcherCheckouts ?? [], command, strict);
}

function refusalOf(cause: unknown): never {
  if (cause instanceof HostPoolModeRefusal)
    throw new OpsRefusal(cause.exitCode, `ops pool switch-mode: ${cause.message}`, { cause });
  throw cause;
}

/**
 * The holder a hold file names and whether it still runs (review K5): the pid with its boot and
 * start identity, compared through `/proc` as every other identity here is, so a recycled pid
 * is not taken for the holder. A file naming a pid alone (its holder exited before its
 * identity could be read) is reported by pid with its liveness unknown; null when it names none.
 */
function holderOf(holdFile: string): { pid: number; state: 'alive' | 'dead' | 'unknown' } | null {
  const [pid, boot, start] = readFileSync(holdFile, 'utf8').trim().split(' ') as [
    string,
    string?,
    string?,
  ];
  if (!/^\d+$/.test(pid)) return null;
  if (boot === undefined || start === undefined) return { pid: Number(pid), state: 'unknown' };
  // Proof: deciding by `kill(pid, 0)` made `a switch-mode hold left behind refuses the next
  // switch 75, naming it` call a recycled pid alive (2026-11-02, review K5).
  return {
    pid: Number(pid),
    state: processAlive({ pid: Number(pid), boot, start }) ? 'alive' : 'dead',
  };
}

/** The exit code a switch interrupted by `signal` returns, as a shell's. */
function interruptedCode(signal: NodeJS.Signals): 129 | 130 | 143 {
  if (signal === 'SIGHUP') return 129;
  return signal === 'SIGINT' ? 130 : 143;
}

/**
 * `ops pool switch-mode` (J12): the fenced mode change.
 *
 * To concurrent: verify every launcher checkout carries the shim and every eligible type is
 * catalogued; stop intake (the fence on new tickets, S6B-A16); wait for the pool to drain of the
 * tickets already queued and every unreleased compute entry; take the shell lock through its
 * own library as {@link SWITCH_LABEL} with what is left of the budget, which proves every
 * legacy holder and every waiter ahead has finished; refuse while any waiter is queued behind it
 * (a launcher still on the legacy path); then flip the mode in one ledger transaction with the
 * operator's record, and let go of the lock. To observe (rollback): stop intake, wait for the
 * pool to drain, flip. `--release-guard` records that no stale checkout can execute, ending the
 * singleton guard. Every refusal, and SIGINT, SIGTERM or SIGHUP at any step, withdraws the
 * switch's ticket or releases its hold and reopens intake (review H3).
 * @throws OpsRefusal 64 (usage: the mode already, an empty eligibility list without
 * `--allow-empty`, `--release-guard` with observe), 70 (a launcher checkout without the shim,
 * the shell lock unusable), 75 (another switch in progress or its hold left behind, not drained
 * within the budget), 129/130/143 (interrupted).
 */
export async function switchPoolMode(
  runtime: ResourceRuntime,
  request: SwitchModeRequest,
  deps: SwitchModeDependencies,
): Promise<ModeRecord> {
  const configuration = runtime.configuration;
  const checkouts = configuration.launcherCheckouts ?? [];
  const eligible = configuration.concurrencyEligible ?? [];
  if (request.releaseGuard) {
    if (request.target !== 'concurrent')
      throw new OpsRefusal(64, 'ops pool switch-mode: --release-guard goes with concurrent');
    const evidence = verifyLauncherCheckouts(checkouts, deps.environment);
    try {
      return runtime.releaseGuard(request.operator, deps.account, evidence);
    } catch (cause) {
      return refusalOf(cause);
    }
  }
  const evidence: string[] = [];
  if (request.target === 'concurrent') {
    evidence.push(...verifyLauncherCheckouts(checkouts, deps.environment));
    evidence.push(verifyEligibleTypes(eligible, checkouts));
    // Proof: without it `refuses an empty eligibility list unless --allow-empty`
    // (host-pool-mode.test.ts) flipped a pool that would serialise everything (2026-11-02).
    if (eligible.length === 0 && !request.allowEmpty)
      throw new OpsRefusal(
        64,
        'ops pool switch-mode: concurrencyEligible lists no job type, so concurrent mode would change nothing; list the eligible types, or pass --allow-empty to flip anyway',
      );
    const holdFile = switchHoldFile(configuration.root);
    // A hold a killed switch left behind keeps the shell lock until `watch` or `resources sweep`
    // removes it; a second hold under the same file would end with the first.
    // Proof: without it `a switch-mode hold left behind refuses the next switch 75, naming it`
    // (host-pool-mode.test.ts) threw a bare EEXIST (2026-11-02, review H3).
    if (existsSync(holdFile)) {
      const holder = holderOf(holdFile);
      throw new OpsRefusal(
        75,
        `ops pool switch-mode: an earlier switch's shell lock hold ${holdFile} is still there (${holder === null ? 'naming no pid' : `holder pid ${String(holder.pid)}, ${holder.state}`}); if no switch-mode runs, run resources sweep to release it`,
      );
    }
  }
  try {
    runtime.beginModeSwitch(request.target, request.operator);
  } catch (cause) {
    return refusalOf(cause);
  }
  const stop = new AbortController();
  const received: { signal: NodeJS.Signals | null } = { signal: null };
  const onSignal = (signal: NodeJS.Signals): void => {
    received.signal ??= signal;
    stop.abort();
  };
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
  for (const signal of signals) process.on(signal, onSignal);
  const interrupted = (): OpsRefusal =>
    new OpsRefusal(
      interruptedCode(received.signal ?? 'SIGTERM'),
      `ops pool switch-mode: interrupted by ${received.signal ?? 'SIGTERM'}; nothing switched and intake reopened`,
    );
  // A function, not the property: the signal flips between awaits, which narrowing cannot see.
  const stopped = (): boolean => stop.signal.aborted;
  const deadline = deps.now() + request.waitSeconds * 1000;
  try {
    // Tickets queued before the fence keep their place (S6B-A16): the switch waits for them,
    // and for every unreleased compute entry, before it takes the shell lock.
    for (;;) {
      if (stopped()) throw interrupted();
      const ahead = runtime.modeDrain();
      if (ahead.length === 0) break;
      if (deps.now() >= deadline)
        throw new OpsRefusal(
          75,
          `ops pool switch-mode: the pool did not drain of host jobs within ${String(request.waitSeconds)}s: ${ahead.join(', ')}`,
        );
      await Promise.race([
        Bun.sleep(request.pollSeconds * 1000),
        new Promise((resolveStop) => {
          stop.signal.addEventListener('abort', resolveStop);
        }),
      ]);
    }
    evidence.push('pool drained of host jobs');
    if (request.target === 'observe')
      return runtime.completeModeSwitch('observe', request.operator, deps.account, evidence);
    const remaining = Math.max(0, Math.ceil((deadline - deps.now()) / 1000));
    const outcome = await holdLegacyLock(
      deps.legacyLock,
      {
        holdFile: switchHoldFile(configuration.root),
        label: SWITCH_LABEL,
        waitSeconds: remaining,
        pollSeconds: request.pollSeconds,
        signal: stop.signal,
        report: deps.report,
      },
      deps.environment,
    );
    // Proof: without it `a switch-mode interrupted while it queues withdraws its ticket`
    // (host-pool-mode.test.ts) waited out its budget (2026-11-02, review H3).
    if (outcome.kind === 'cancelled') throw interrupted();
    if (outcome.kind !== 'held')
      throw new OpsRefusal(
        outcome.exitCode === 75 ? 75 : 70,
        `ops pool switch-mode: the shell lock's holders and waiters did not drain within ${String(remaining)}s (exit ${String(outcome.exitCode)}${outcome.reason === undefined ? '' : `: ${outcome.reason}`})`,
      );
    try {
      if (stopped()) throw interrupted();
      const queue = readLegacyQueue(deps.legacyLock);
      // Proof: without it `refuses while a legacy waiter queues behind it`
      // (host-pool-mode.test.ts) flipped with a legacy launcher still queued (2026-11-02).
      if (queue.waiters.length > 0)
        throw new OpsRefusal(
          75,
          `ops pool switch-mode: legacy waiters queued behind the switch: ${queue.waiters.map((waiter) => `${waiter.label} (pid ${String(waiter.pid)}, age ${String(waiter.ageSeconds)}s)`).join(', ')}; a launcher still takes the legacy path`,
        );
      evidence.push(
        `shell lock ${deps.legacyLock.lockPath} drained: held by the switch, no waiter`,
      );
      return runtime.completeModeSwitch('concurrent', request.operator, deps.account, evidence);
    } finally {
      outcome.hold.release();
      await outcome.hold.exited.catch(() => undefined);
    }
  } catch (cause) {
    return refusalOf(cause);
  } finally {
    for (const signal of signals) process.removeListener(signal, onSignal);
    runtime.abandonModeSwitch();
  }
}
