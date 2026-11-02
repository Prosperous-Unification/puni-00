import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
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

function git(checkout: string, ...arguments_: string[]): { status: number | null; stdout: string } {
  const answer = spawnSync('git', ['-C', checkout, ...arguments_], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { status: answer.status, stdout: answer.stdout };
}

/**
 * Verify each enrolled launcher checkout carries the shim (J12): it is the top of a Git work
 * tree, `bin/heavy-lock-lib.sh` at HEAD defines `run_heavy_job`, and the working file is HEAD's,
 * so the launcher that runs is the one verified. Returns one evidence line per checkout.
 * @throws OpsRefusal 64 when the configuration names no launcher checkout, 70 naming the first
 * checkout that is unreadable or lacks the shim.
 */
export function verifyLauncherCheckouts(checkouts: readonly string[]): string[] {
  // Proof: without it `refuses a configuration naming no launcher checkout`
  // (host-pool-mode.test.ts) flipped with nothing verified (2026-11-02, Slice 6b).
  if (checkouts.length === 0)
    throw new OpsRefusal(
      64,
      'ops pool switch-mode: the configuration names no launcherCheckouts, so no launcher can be verified to carry run_heavy_job',
    );
  return checkouts.map((checkout) => {
    const top = git(checkout, 'rev-parse', '--show-toplevel');
    let real: string;
    try {
      real = realpathSync(checkout);
    } catch (cause) {
      throw new OpsRefusal(
        70,
        `ops pool switch-mode: launcher checkout ${checkout} unreadable: ${causeText(cause)}`,
        { cause },
      );
    }
    if (top.status !== 0 || top.stdout.trim() !== real)
      throw new OpsRefusal(
        70,
        `ops pool switch-mode: launcher checkout ${checkout} is not the top of a Git work tree`,
      );
    const head = git(checkout, 'rev-parse', '--verify', 'HEAD^{commit}').stdout.trim();
    const library = git(checkout, 'show', 'HEAD:bin/heavy-lock-lib.sh');
    // Proof: without it `refuses a launcher checkout without the shim`
    // (host-pool-mode.test.ts) flipped beside a stale checkout (2026-11-02, Slice 6b).
    if (library.status !== 0 || !/^run_heavy_job\(\) \{$/m.test(library.stdout))
      throw new OpsRefusal(
        70,
        `ops pool switch-mode: launcher checkout ${checkout} at ${head || 'no HEAD'} has no run_heavy_job in bin/heavy-lock-lib.sh; a launcher there would take the legacy lock alone`,
      );
    // Proof: without it `refuses a launcher checkout without the shim, or whose
    // working library differs from HEAD` (host-pool-mode.test.ts) verified HEAD while the edited file ran (2026-11-02).
    if (git(checkout, 'diff', '--quiet', 'HEAD', '--', 'bin/heavy-lock-lib.sh').status !== 0)
      throw new OpsRefusal(
        70,
        `ops pool switch-mode: launcher checkout ${checkout} has bin/heavy-lock-lib.sh changed from HEAD ${head}; commit or restore it`,
      );
    return `launcher ${checkout} at ${head} carries run_heavy_job`;
  });
}

/**
 * Verify every concurrency-eligible type is named by some launcher checkout's catalogue at HEAD
 * (PR #816 review): an eligible id no catalogue names is a typo that would silently serialise
 * the type it meant. Returns the evidence line.
 * @throws OpsRefusal 64 naming the first id no catalogue names.
 */
export function verifyEligibleTypes(
  eligible: readonly string[],
  checkouts: readonly string[],
): string {
  const named = new Set(
    checkouts.flatMap((checkout) =>
      readCommittedCatalogue(checkout, 'ops pool switch-mode').jobs.map((job) => job.id),
    ),
  );
  for (const id of eligible)
    // Proof: without it `refuses an empty eligibility list unless --allow-empty, and
    // an eligible id no catalogue names` (host-pool-mode.test.ts)
    // flipped with the typo listed (2026-11-02, Slice 6b).
    if (!named.has(id))
      throw new OpsRefusal(
        64,
        `ops pool switch-mode: concurrencyEligible names ${id}, which no launcher checkout's catalogue names`,
      );
  return `concurrency-eligible: ${eligible.length === 0 ? 'none' : eligible.join(', ')}`;
}

function refusalOf(cause: unknown): never {
  if (cause instanceof HostPoolModeRefusal)
    throw new OpsRefusal(cause.exitCode, `ops pool switch-mode: ${cause.message}`, { cause });
  throw cause;
}

/**
 * `ops pool switch-mode` (J12): the fenced mode change.
 *
 * To concurrent: verify every launcher checkout carries the shim and every eligible type is
 * catalogued; stop intake (the fence); take the shell lock through its own library as
 * {@link SWITCH_LABEL} within the wait budget, which proves every legacy holder and every waiter
 * ahead has finished; refuse while any waiter is queued behind it (a launcher still on the
 * legacy path); then flip the mode in one ledger transaction with the operator's record, and let
 * go of the lock. To observe (rollback): stop intake, wait for the pool to drain of host jobs,
 * flip. `--release-guard` records that no stale checkout can execute, ending the singleton
 * guard. Every refusal reopens intake.
 * @throws OpsRefusal 64 (usage: the mode already, an empty eligibility list without
 * `--allow-empty`, `--release-guard` with observe), 70 (a launcher checkout without the shim,
 * the shell lock unusable), 75 (another switch in progress, not drained within the budget).
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
    const evidence = verifyLauncherCheckouts(checkouts);
    try {
      return runtime.releaseGuard(request.operator, deps.account, evidence);
    } catch (cause) {
      return refusalOf(cause);
    }
  }
  const evidence: string[] = [];
  if (request.target === 'concurrent') {
    evidence.push(...verifyLauncherCheckouts(checkouts));
    evidence.push(verifyEligibleTypes(eligible, checkouts));
    // Proof: without it `refuses an empty eligibility list unless --allow-empty`
    // (host-pool-mode.test.ts) flipped a pool that would serialise everything (2026-11-02).
    if (eligible.length === 0 && !request.allowEmpty)
      throw new OpsRefusal(
        64,
        'ops pool switch-mode: concurrencyEligible lists no job type, so concurrent mode would change nothing; list the eligible types, or pass --allow-empty to flip anyway',
      );
  }
  try {
    runtime.beginModeSwitch(request.target, request.operator);
  } catch (cause) {
    return refusalOf(cause);
  }
  const deadline = deps.now() + request.waitSeconds * 1000;
  try {
    if (request.target === 'concurrent') {
      const outcome = await holdLegacyLock(
        deps.legacyLock,
        {
          holdFile: switchHoldFile(configuration.root),
          label: SWITCH_LABEL,
          waitSeconds: request.waitSeconds,
          pollSeconds: request.pollSeconds,
          signal: new AbortController().signal,
          report: deps.report,
        },
        deps.environment,
      );
      if (outcome.kind !== 'held')
        throw new OpsRefusal(
          outcome.kind === 'refused' && outcome.exitCode === 75 ? 75 : 70,
          `ops pool switch-mode: the shell lock's holders and waiters did not drain within ${String(request.waitSeconds)}s (${outcome.kind === 'refused' ? `exit ${String(outcome.exitCode)}` : outcome.kind})`,
        );
      try {
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
    }
    for (;;) {
      const ahead = runtime.modeDrain();
      if (ahead.length === 0) break;
      if (deps.now() >= deadline)
        throw new OpsRefusal(
          75,
          `ops pool switch-mode: the pool did not drain of host jobs within ${String(request.waitSeconds)}s: ${ahead.join(', ')}`,
        );
      await Bun.sleep(request.pollSeconds * 1000);
    }
    evidence.push('pool drained of host jobs');
    return runtime.completeModeSwitch('observe', request.operator, deps.account, evidence);
  } catch (cause) {
    return refusalOf(cause);
  } finally {
    runtime.abandonModeSwitch();
  }
}
