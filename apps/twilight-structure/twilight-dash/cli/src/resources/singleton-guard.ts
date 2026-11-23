import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { readGeneration, removeGeneration } from './hold-log';
import { guardHoldFile, legacyHoldDirectory, resolveReadyFile } from './hold-paths';
import {
  createDecision,
  type Decision,
  formatIdentity,
  type Hold,
  readDecision,
  readHold,
  releaseHold,
  verifyHold,
} from './hold-token';
import { acquireHold, type HostHold, type HostLock } from './host-lock';
import type { Identity } from './process-identity';
import {
  GUARD_LABEL,
  type GuardHolder,
  hasProcessEnded,
  identifyProcess,
  type ResourceRuntime,
} from './runtime';

const GUARD_ATTEMPT_SECONDS = 3600,
  UNREADY_GRACE_MS = 15000,
  SWITCH_HOLD = 'dash-switch-mode';
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
type GuardTurn = { kind: 'settled' } | { kind: 'failed'; cause: unknown };
interface IdentifiedHold {
  kind: 'known';
  file: string;
  identity: Identity;
  hold: Hold | undefined;
  decision: Decision | undefined;
}
type HoldEvidence = IdentifiedHold | { kind: 'unidentified'; file: string };
interface HoldScan {
  released: string[];
  corrupt: string | null;
}

function isAbsent(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}
function hasSameBirth(left: Identity, right: Identity): boolean {
  return formatIdentity(left) === formatIdentity(right);
}
function readNames(directory: string): string[] {
  try {
    return readdirSync(directory).sort();
  } catch (cause) {
    if (isAbsent(cause)) return [];
    throw cause;
  }
}
function readHoldEvidence(file: string): HoldEvidence | undefined {
  const hold = readHold(file),
    decision = readDecision(resolveReadyFile(file));
  if (
    hold !== undefined &&
    decision !== undefined &&
    decision.kind !== 'cancelled' &&
    formatIdentity(decision.identity) !== hold.bytes
  )
    throw new Error('hold decision names another helper birth');
  const identity =
    hold?.identity ??
    (decision?.kind === 'ready' || decision?.kind === 'retired' ? decision.identity : undefined);
  if (identity !== undefined) return { kind: 'known', file, identity, hold, decision };
  if (decision !== undefined || readGeneration(file) !== undefined)
    return { kind: 'unidentified', file };
  return undefined;
}
/** Compete for a ledger-authorized retirement without replacing Ready, Cancel or another birth. */
function publishRetirement(hold: Hold): Decision {
  const path = resolveReadyFile(hold.path);
  let decision = readDecision(path);
  if (decision === undefined) {
    try {
      decision = createDecision(path, 'retired', hold.identity);
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'EEXIST')) throw cause;
      decision = readDecision(path);
      if (decision === undefined)
        throw new Error('hold retirement decision disappeared', { cause });
    }
  }
  if (decision.kind !== 'cancelled' && !hasSameBirth(decision.identity, hold.identity))
    throw new Error('hold retirement decision names another helper');
  return decision;
}

/**
 * Reconcile durable host ownership with the runtime ledger. Pending acquisition is owned through
 * stop; Ready helpers outlive the frontend. New admission requires current Ready, while legacy
 * continuity drains existing compute before an unready live guard retires. Full process death
 * permits lost-authority recovery without releasing or pretending to settle charged compute.
 */
export class SingletonGuard {
  private attempt: { controller: AbortController; pending: Promise<GuardTurn> } | undefined;
  private failure: { kind: 'none' } | { kind: 'failed'; cause: unknown } = { kind: 'none' };
  private turns: Promise<GuardTurn> = Promise.resolve({ kind: 'settled' });
  private selected: Promise<HostLock> | undefined;
  private isStopped = false;
  private readonly environment: Readonly<Record<string, string | undefined>>;
  private readonly owned = new Map<string, HostHold>();
  private readonly retiring = new Set<string>();
  private unready: { birth: string; since: number } | undefined;

  constructor(
    private readonly runtime: ResourceRuntime,
    private readonly lock: () => HostLock | Promise<HostLock>,
    environment: Readonly<Record<string, string | undefined>>,
    private readonly report: (line: string) => void,
  ) {
    this.environment = Object.freeze({ ...environment });
  }

  private select(): Promise<HostLock> {
    this.selected ??= Promise.resolve().then(() => this.lock());
    return this.selected;
  }
  private throwFailure(): void {
    if (this.failure.kind === 'failed') throw this.failure.cause;
  }
  private schedule(work: () => Promise<void>): Promise<void> {
    const pending = this.turns.then(async (previous) => {
      if (previous.kind === 'failed') throw previous.cause;
      this.throwFailure();
      if (!this.isStopped) await work();
      this.throwFailure();
    });
    this.turns = pending.then(
      () => ({ kind: 'settled' as const }),
      (cause: unknown) => ({ kind: 'failed' as const, cause }),
    );
    return pending;
  }
  /** One serialized reconciliation; actual admission continues in its separately owned attempt. */
  tick(): Promise<void> {
    return this.schedule(async () => {
      this.runtime.reclaimDeadTickets(this.report);
      const scan = await this.scanSettledHolds();
      if (scan.corrupt !== null) return;
      await this.reconcileGuard();
    });
  }

  /** Await pending handoff/withdrawal before the caller closes its ledger; held owners remain durable. */
  async stop(): Promise<void> {
    this.isStopped = true;
    const failures = new Set<unknown>(),
      turn = await this.turns;
    if (turn.kind === 'failed') failures.add(turn.cause);
    const attempt = this.attempt;
    if (attempt !== undefined) {
      attempt.controller.abort();
      // Proof: skipping this await closed the ledger before the stop-ready handoff was recorded.
      const settled = await attempt.pending;
      if (settled.kind === 'failed') failures.add(settled.cause);
    }
    if (this.failure.kind === 'failed') failures.add(this.failure.cause);
    if (failures.size === 1) throw failures.values().next().value;
    if (failures.size > 1)
      throw new AggregateError([...failures], 'guard shutdown and reconciliation failed');
  }

  private start(file: string): void {
    if (this.attempt !== undefined || this.isStopped) return;
    const controller = new AbortController();
    const running = Promise.resolve().then(async () => {
      const lock = await this.select();
      if (controller.signal.aborted) return;
      if (this.runtime.guardObligation().holder !== null || readHoldEvidence(file) !== undefined)
        return;
      const outcome = await acquireHold(
        lock,
        {
          holdFile: file,
          label: GUARD_LABEL,
          waitSeconds: GUARD_ATTEMPT_SECONDS,
          pollSeconds: 5,
          signal: controller.signal,
          report: this.report,
        },
        this.environment,
      );
      if (outcome.kind === 'cancelled') return;
      if (outcome.kind === 'refused') {
        if (outcome.exitCode !== 75)
          throw new Error('singleton guard acquisition failed: ' + outcome.reason);
        this.report(
          'resources: singleton guard got no turn on the host lock (exit75); queueing again',
        );
        return;
      }
      if (this.runtime.adoptGuardHold(outcome.hold, lock.lockPath)) {
        this.owned.set(formatIdentity(outcome.hold.identity), outcome.hold);
        this.report(
          'resources: singleton guard holds the canonical flock ' +
            lock.lockPath +
            ' (pid ' +
            String(outcome.hold.pid) +
            ')',
        );
      } else {
        const status = await this.readExit(outcome.hold);
        if (status !== 0) throw new Error('unneeded singleton holder exited ' + String(status));
      }
    });
    const pending = running
      .then(
        () => ({ kind: 'settled' as const }),
        (cause: unknown) => {
          if (this.failure.kind === 'none') this.failure = { kind: 'failed', cause };
          return { kind: 'failed' as const, cause };
        },
      )
      .finally(() => {
        if (this.attempt?.controller === controller) this.attempt = undefined;
      });
    this.attempt = { controller, pending };
  }

  private async readExit(hold: HostHold): Promise<number> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        hold.exited,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error('singleton helper native exit remains unconfirmed'));
          }, 10000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Full helper qualification precedes every physical cleanup; the last witness is removed last. */
  private async clean(evidence: IdentifiedHold, recorded?: GuardHolder): Promise<boolean> {
    if (!hasProcessEnded(evidence.identity)) return false;
    const birth = formatIdentity(evidence.identity),
      owned = this.owned.get(birth);
    if (owned !== undefined) {
      const status = await this.readExit(owned);
      if (this.retiring.has(birth) && status !== 0)
        throw new Error('retired singleton helper exited ' + String(status));
      if (!this.retiring.has(birth) && status !== 0)
        this.report(
          'resources: singleton guard owner ended with status ' +
            String(status) +
            '; its authority was lost',
        );
      this.owned.delete(birth);
      this.retiring.delete(birth);
      return true;
    }
    const witness =
      evidence.decision?.kind === 'ready' || evidence.decision?.kind === 'retired'
        ? evidence.decision
        : evidence.hold;
    if (witness === undefined) {
      if (recorded === undefined || !hasSameBirth(recorded, evidence.identity))
        throw new Error('ended hold lacks a complete helper witness');
      return this.runtime.cleanupDeadGuard(recorded, () => {
        if (
          readHold(evidence.file) !== undefined ||
          readDecision(resolveReadyFile(evidence.file)) !== undefined
        )
          throw new Error('legacy guard cleanup acquired an unexpected file witness');
        const generation = readGeneration(evidence.file);
        if (generation !== undefined) removeGeneration(generation);
      });
    }
    if (verifyHold(witness) !== 'present') return false;
    const generation = readGeneration(evidence.file);
    if (verifyHold(witness) !== 'present') return false;
    if (generation !== undefined) removeGeneration(generation);
    if (evidence.decision?.kind === 'cancelled') {
      releaseHold(evidence.decision);
      if (evidence.hold === undefined) throw new Error('cancelled hold lost its helper witness');
      releaseHold(evidence.hold);
    } else {
      if (evidence.hold !== undefined) releaseHold(evidence.hold);
      if (evidence.decision !== undefined) releaseHold(evidence.decision);
    }
    return true;
  }

  private block(file: string): HoldScan {
    if (this.runtime.hostPoolTransition().holdCorruption !== file)
      this.runtime.recordHoldCorruption(file);
    this.report(
      'resources: the legacy hold directory holds ' +
        file +
        ', which Dash did not write; nothing is released and concurrent admission refuses until it is checked',
    );
    return { released: [], corrupt: file };
  }

  /** One-shot cleanup of settled job holds and ended switch controllers; never starts a guard. */
  async releaseSettledHolds(): Promise<HoldScan> {
    let scan: HoldScan | undefined;
    await this.schedule(async () => {
      scan = await this.scanSettledHolds();
    });
    if (scan === undefined) throw new Error('hold reconciliation was not run after guard shutdown');
    return scan;
  }

  private async scanSettledHolds(): Promise<HoldScan> {
    const directory = legacyHoldDirectory(this.runtime.configuration.root),
      bases = new Set<string>();
    for (const name of readNames(directory)) {
      const base = name.endsWith('.ready')
        ? name.slice(0, -6)
        : name.endsWith('.log')
          ? name.slice(0, -4)
          : name;
      if (base !== GUARD_LABEL && base !== SWITCH_HOLD && !JOB_ID.test(base))
        return this.block(join(directory, name));
      bases.add(base);
    }
    const plans: IdentifiedHold[] = [];
    for (const base of bases) {
      const file = join(directory, base);
      if (base === GUARD_LABEL) {
        if (this.attempt === undefined) {
          const evidence = readHoldEvidence(file);
          if (evidence?.kind === 'unidentified' && this.runtime.guardObligation().holder === null)
            return this.block(file);
        }
        continue;
      }
      let authorized: boolean;
      if (base === SWITCH_HOLD) {
        const switching = this.runtime.hostPoolTransition().switching;
        authorized = switching === null || hasProcessEnded(switching);
      } else {
        try {
          authorized = this.runtime.inspectHostJob(base).compute.state === 'released';
        } catch (cause) {
          if (!(cause instanceof Error && cause.message === 'host job not found')) throw cause;
          return this.block(file);
        }
      }
      if (!authorized) continue;
      const evidence = readHoldEvidence(file);
      if (evidence?.kind === 'unidentified') return this.block(file);
      if (evidence !== undefined) plans.push(evidence);
    }
    if (this.runtime.hostPoolTransition().holdCorruption !== null)
      this.runtime.recordHoldCorruption(null);
    const released: string[] = [];
    for (const evidence of plans) {
      if (!hasProcessEnded(evidence.identity)) {
        if (evidence.hold !== undefined) {
          const decision = publishRetirement(evidence.hold);
          if (decision.kind !== 'cancelled') {
            releaseHold(evidence.hold);
            released.push(evidence.file.slice(directory.length + 1));
            this.report(
              'resources: released the host lock hold token ' +
                evidence.file +
                '; its helper still settles',
            );
          }
        }
        continue;
      }
      if (await this.clean(evidence)) {
        released.push(evidence.file.slice(directory.length + 1));
        this.report('resources: cleaned the ended host lock hold ' + evidence.file);
      }
    }
    return { released, corrupt: null };
  }

  private async reconcileGuard(): Promise<void> {
    const obligation = this.runtime.guardObligation(),
      file = guardHoldFile(this.runtime.configuration.root);
    if (this.attempt !== undefined) {
      if (!obligation.required || !obligation.demand) this.attempt.controller.abort();
      return;
    }
    const lock = await this.select();
    if (this.isStopped) return;
    let evidence = readHoldEvidence(file);
    const recorded = obligation.holder;
    if (evidence?.kind === 'unidentified') {
      if (recorded === null) return void this.block(file);
      evidence = { kind: 'known', file, identity: recorded, hold: undefined, decision: undefined };
    }
    if (evidence === undefined) {
      if (recorded !== null) {
        if (!hasProcessEnded(recorded)) return;
        this.runtime.recordLostGuard(recorded);
        this.runtime.forgetDeadGuard(recorded);
      }
      const current = this.runtime.guardObligation();
      if (
        current.required &&
        current.demand &&
        current.holder === null &&
        readHoldEvidence(file) === undefined
      )
        this.start(file);
      return;
    }
    if (!hasProcessEnded(evidence.identity)) {
      const leader = identifyProcess(evidence.identity.pid);
      if (leader === null || !hasSameBirth(leader, evidence.identity)) return;
      if (!obligation.required || !obligation.demand) {
        if (
          evidence.hold !== undefined &&
          this.runtime.retireGuardHold(evidence.hold, 'settled') === 'retired'
        )
          this.retiring.add(formatIdentity(evidence.identity));
        return;
      }
      if (evidence.decision?.kind === 'ready' && evidence.hold !== undefined) {
        const { readStatus } = await import('@shared/heavy-lock'),
          holder = readStatus(lock.lockPath, BigInt(Math.floor(lock.clock.read() / 1000))).holder;
        if (
          holder.kind === 'recorded' &&
          holder.pidText === String(evidence.identity.pid) &&
          holder.label.kind === 'named' &&
          holder.label.text === GUARD_LABEL
        ) {
          this.runtime.recordGuardHolder(evidence.identity.pid, lock.lockPath);
          this.unready = undefined;
        }
        return;
      }
      if (evidence.decision?.kind === 'cancelled') return;
      if (evidence.hold === undefined) return;
      const isRecorded = recorded !== null && hasSameBirth(recorded, evidence.identity);
      if (obligation.hasUnreleasedCompute) return;
      if (!isRecorded && evidence.decision?.kind !== 'retired') {
        const { readStatus } = await import('@shared/heavy-lock'),
          holder = readStatus(lock.lockPath, BigInt(Math.floor(lock.clock.read() / 1000))).holder;
        if (
          holder.kind !== 'recorded' ||
          holder.pidText !== String(evidence.identity.pid) ||
          holder.label.kind !== 'named' ||
          holder.label.text !== GUARD_LABEL
        )
          return;
        const birth = formatIdentity(evidence.identity),
          now = lock.monotonic.now();
        if (this.unready?.birth !== birth) {
          this.unready = { birth, since: now };
          return;
        }
        if (now - this.unready.since < UNREADY_GRACE_MS) return;
      }
      if (this.runtime.retireGuardHold(evidence.hold, 'unready') === 'retired')
        this.retiring.add(formatIdentity(evidence.identity));
      return;
    }
    const matches = recorded !== null && hasSameBirth(recorded, evidence.identity);
    if (matches) {
      // Proof: omitting loss attribution left the actual native replacement without guardLost while compute stayed held.
      const marked = this.runtime.recordLostGuard(recorded);
      if (marked.length > 0)
        this.report(
          'resources: singleton guard holder pid ' +
            String(recorded.pid) +
            ' is gone while host jobs need it; the canonical flock was not held for ' +
            marked.join(', ') +
            '; admission waits, and the guard queues again',
        );
    } else if (obligation.required && obligation.hasUnreleasedCompute) return;
    if (await this.clean(evidence, matches ? recorded : undefined)) {
      if (matches) this.runtime.forgetDeadGuard(recorded);
      this.unready = undefined;
    }
  }
}
