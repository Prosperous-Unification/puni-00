import type { HoldOutcome, HoldRequest, HostHold, HostLock } from './host-lock';
import { acquireHold, resolveHostLock } from './host-lock';
export { guardHoldFile, holdLogFile, jobHoldFile, legacyHoldDirectory } from './hold-paths';

/** Compatibility names describe the shared queue protocol, whose current owner is native Bun. */
export type LegacyLock = HostLock;
export type LegacyHold = HostHold;
export type LegacyHoldRequest = HoldRequest;
export type LegacyHoldOutcome = HoldOutcome;
/** Resolve lazily from the selected protected executable prefix; no checkout dependency. */
export const productionLegacyLock = resolveHostLock;
/** Acquire through the current native holder while sharing the historical host queue. */
export const holdLegacyLock = acquireHold;

/** Human observations only: these records never certify kernel mutex ownership. */
export type LegacyHolderState =
  { kind: 'none' } | { kind: 'claiming' } | { kind: 'held'; pid: number; label: string };
export interface LegacyWaiter {
  pid: number;
  label: string;
  ageSeconds: number;
  budget: string;
}
export interface LegacyQueueStatus {
  holder: LegacyHolderState;
  waiters: LegacyWaiter[];
  lines: string[];
}

/** Preserve precise observed integers when adapting native protocol fields to existing consumers. */
function readSafeInteger(value: bigint, field: string): number {
  const integer = Number(value);
  // Proof: removing safe-integer admission failed the unsafe observational age control in legacy-lock.test.ts; restoration passed (2026-11-11).
  if (!Number.isSafeInteger(integer))
    throw new Error('heavy lock ' + field + ' is outside the safe integer range');
  return integer;
}
/** Parse observational PID text only at this typed boundary; malformed records remain loud. */
function readPid(text: string): number {
  // Proof: removing PID syntax admission failed the invalid-holder-PID diagnostic control; BigInt still rejects the malformed value (2026-11-11).
  if (!/^[0-9]+$/u.test(text)) throw new Error('heavy lock holder PID is malformed');
  const pid = readSafeInteger(BigInt(text), 'PID');
  // Proof: removing native PID bounds admitted zero in legacy-lock.test.ts; restoration passed (2026-11-11).
  if (pid < 1 || pid > 2147483647) throw new Error('heavy lock PID is outside the native range');
  return pid;
}
/**
 * Read native observational records lazily, preserving the historical human report.
 * @throws when trusted records are unreadable, malformed, or cannot be represented precisely.
 */
export async function readLegacyQueue(lock: LegacyLock): Promise<LegacyQueueStatus> {
  const nowSeconds = BigInt(Math.floor(lock.clock.read() / 1000));
  const { readStatus, renderStatus } = await import('@shared/heavy-lock');
  const status = readStatus(lock.lockPath, nowSeconds),
    observed = status.holder;
  const holder: LegacyHolderState =
    observed.kind !== 'recorded'
      ? observed
      : {
          kind: 'held',
          pid: readPid(observed.pidText),
          label:
            observed.label.kind === 'named' ? observed.label.text : 'unlabeled (pre-queue holder)',
        };
  const waiters = status.waiters.map((waiter) => ({
    pid: readPid(waiter.pidText),
    label: waiter.label,
    ageSeconds: readSafeInteger(waiter.ageSeconds, 'waiter age'),
    budget:
      waiter.budget.kind === 'expired' ? 'expired' : waiter.budget.seconds.toString() + 's left',
  }));
  return { holder, waiters, lines: renderStatus(status).split('\n').slice(0, -1) };
}

/**
 * Observe an already authorized release until confirmed normal native exit within a bounded budget.
 * This never signals an owner or decides whether compute permits removing its token.
 * @throws the native wait cause, unexpected status, or unconfirmed exit deadline.
 */
export async function awaitLegacyRelease(hold: LegacyHold, budgetMs = 10_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const status = await Promise.race([
      hold.exited,
      new Promise<never>((_resolve, reject) => {
        // Proof: removing this timer made the independently bounded native-exit control observe pending instead of failure; restoration passed (2026-11-11).
        timer = setTimeout(() => {
          reject(
            new Error(
              'durable holder ' + String(hold.pid) + ' native exit is unconfirmed after release',
            ),
          );
        }, budgetMs);
      }),
    ]);
    // Proof: removing status admission reported native exit 143 as released in legacy-lock.test.ts; restoration passed (2026-11-11).
    if (status !== 0)
      throw new Error(
        'durable holder ' +
          String(hold.pid) +
          ' released with unexpected native exit ' +
          String(status),
      );
  } finally {
    clearTimeout(timer);
  }
}
