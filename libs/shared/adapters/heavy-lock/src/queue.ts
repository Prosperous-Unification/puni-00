import {
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { holdLock, readEpochNanoseconds } from './native';
import {
  decodeTicketName,
  readDirectory,
  readObservedBytes,
  readObservedText,
  readTicket,
} from './records';

export interface QueueRuntime {
  readonly pid: number;
  readonly signal: AbortSignal;
  readonly readEpoch: () => bigint;
  readonly readElapsed: () => number;
  readonly isAlive: (pid: number) => boolean;
  readonly wait: (seconds: number) => Promise<'elapsed' | 'cancelled'>;
}
/** Invalid caller-controlled queue fields; native identities and trusted records fail separately. */
export class RequestRefusal extends Error {
  override readonly name = 'RequestRefusal';
}

export interface QueueRequest {
  readonly path: string;
  readonly label: string;
  readonly command: string;
  readonly waitSeconds: number;
  readonly pollSeconds: number;
}
/** Queue observations delivered after admission, before protected work starts. */
export interface Admission {
  readonly aheadAtArrival: number;
  readonly waitedSeconds: number;
}
/** Refusal-time informational records, never proof of current native mutex ownership. */
export type Contention =
  | { readonly kind: 'holder'; readonly pidText: string | undefined }
  | {
      readonly kind: 'tickets';
      readonly tickets: readonly {
        readonly pidText: string;
        readonly label:
          { readonly kind: 'named'; readonly text: string } | { readonly kind: 'gone' };
      }[];
    };
export type QueueOutcome<T> =
  | { readonly kind: 'cancelled' }
  | {
      readonly kind: 'refused';
      readonly aheadAtArrival: number;
      readonly ahead: number;
      readonly waitedSeconds: number;
      readonly contention: Contention;
    }
  | { readonly kind: 'completed'; readonly aheadAtArrival: number; readonly value: T };

function hasCode(cause: unknown, code: string): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === code;
}

/** Only ESRCH certifies a dead PID. In particular EPERM cannot authorize reclamation. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    // Proof: c30b-liveness-esrch-only; injected treat EPERM as proof of death failed `distinguishes only ESRCH from a live or unknown process`; restoration passed. Controlled actual process.kill boundary error; EPERM is unknown rather than proof of death.
    if (hasCode(cause, 'ESRCH')) return false;
    throw cause;
  }
}

/** Wake promptly on admission cancellation; remove the timer/listener whichever settles first. */
export function waitForPoll(
  seconds: number,
  signal: AbortSignal,
): Promise<'elapsed' | 'cancelled'> {
  if (signal.aborted) return Promise.resolve('cancelled');
  return new Promise((resolve) => {
    const finish = (kind: 'elapsed' | 'cancelled') => {
      clearTimeout(timer);
      // Proof: c30b-wait-detach; injected retain the settled abort listener failed `wakes a real thirty second wait promptly on cancellation and detaches its listener` and 1 additional named controls; restoration passed. Structural listener-release observation at the real AbortSignal boundary; no process-lifetime leak claim.
      signal.removeEventListener('abort', cancel);
      resolve(kind);
    };
    const cancel = () => {
      // Proof: c30b-wait-cancellation; injected report cancellation as elapsed failed `wakes a real thirty second wait promptly on cancellation and detaches its listener`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
      finish('cancelled');
    };
    const timer = setTimeout(() => {
      finish('elapsed');
    }, seconds * 1000);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) finish('cancelled');
  });
}

/** Capture process-owned capabilities. Executable owners map their first signal to an exit code. */
export function createQueueRuntime(signal: AbortSignal): QueueRuntime {
  return {
    pid: process.pid,
    signal,
    readEpoch: readEpochNanoseconds,
    readElapsed: () => performance.now() / 1000,
    isAlive: isProcessAlive,
    wait: (seconds) => waitForPoll(seconds, signal),
  };
}

/** Select the existing canonical host inode; environment variables cannot redirect the mutex. */
export function selectLockPath(platform: string): string {
  if (platform === 'linux') return '/home/puni1/.cache/wbs-heavy-work.lock';
  if (platform === 'darwin') return '/tmp/wbs-heavy-work.lock';
  // Proof: c30b-canonical-platform; injected guess a path on unsupported platform failed `selects only the existing platform canonical paths`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
  throw new Error('heavy lock platform is unsupported: ' + platform);
}

function removeFile(path: string): void {
  try {
    unlinkSync(path);
  } catch (cause) {
    if (!hasCode(cause, 'ENOENT')) throw cause;
  }
}

/** Attempt every known cleanup independently; preserve unknown content and all failure causes. */
async function settleWithCleanup<T>(
  work: () => Promise<T>,
  cleanup: readonly (() => void)[],
): Promise<T> {
  const attempt = await work().then(
    (value) => ({ kind: 'completed' as const, value }),
    (cause: unknown) => ({ kind: 'failed' as const, cause }),
  );
  const failures: unknown[] = [];
  // Proof: c30b-settlement-original-cause; injected drop the callback cause failed `preserves the exact callback failure after record and queue cleanup`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
  if (attempt.kind === 'failed') failures.push(attempt.cause);
  for (const release of cleanup) {
    try {
      // Proof: c30b-settlement-cleanup-cause; injected drop the independent cleanup cause failed `preserves both a partial draft write failure and its real descriptor close failure`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
      release();
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'heavy lock operation and cleanup failed');
  if (attempt.kind === 'failed') throw new Error('heavy lock failure was not preserved');
  return attempt.value;
}

function removeRecord(path: string): void {
  const failures: unknown[] = [];
  for (const field of ['label', 'holder']) {
    try {
      // Proof: c30b-record-independent-cleanup; injected stop cleanup at the first field failure failed `attempts record and ticket cleanup independently and reports callback plus cleanup failures`; restoration passed. The first oracle is attemptedHolder after label unlink fails; aggregate shape is secondary.
      removeFile(join(path, field));
    } catch (cause) {
      failures.push(cause);
    }
  }
  try {
    // Proof: c30b-record-unknown-content; injected recursively remove unknown record content failed `reclaims only the known files of a dead holder and retains unknown content as a refusal`; restoration passed. First failure is erroneous admission; later operator-byte assertion is not reached.
    rmdirSync(path);
  } catch (cause) {
    if (!hasCode(cause, 'ENOENT')) failures.push(cause);
  }
  if (failures.length > 0) throw new AggregateError(failures, 'heavy lock record cleanup failed');
}

function decodeHolder(text: string): number {
  // Proof: c30b-holder-pid-text; injected skip holder PID text admission failed `refuses a malformed holder before entering work and leaves it intact`; restoration passed. Diagnostic boundary only; BigInt still refuses malformed PID text.
  if (!/^[0-9]+$/u.test(text)) throw new Error('heavy lock holder PID is malformed');
  const pid = BigInt(text);
  // Proof: c30b-holder-pid-lower; injected admit zero holder PID failed `refuses a holder PID outside the native range 0`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
  // Proof: c30b-holder-pid-upper; injected admit out-of-range holder PID failed `refuses a holder PID outside the native range 2147483648`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
  if (pid < 1n || pid > 2147483647n)
    throw new Error('heavy lock holder PID is outside the native range');
  return Number(pid);
}

/** Called only while native ownership is held; still respect older record-only holders. */
function canPublishRecord(record: string, isAlive: QueueRuntime['isAlive']): boolean {
  if (readDirectory(record) === undefined) return true;
  const holder = readObservedText(join(record, 'holder'));
  // Proof: c30b-holder-incomplete; injected decode an incomplete holder instead of modeling contention failed `respects an incomplete or live pre-flock holder undefined` and 1 additional named controls; restoration passed. Guard removal reaches later PID decoding refusal rather than a modeled busy outcome; classification only.
  if (holder === undefined || holder === '') return false;
  // Proof: c30b-holder-live; injected reclaim a live pre-flock holder failed `respects an incomplete or live pre-flock holder live`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
  if (isAlive(decodeHolder(holder))) return false;
  removeRecord(record);
  return true;
}

function reclaimQueue(
  queue: string,
  now: bigint,
  isAlive: QueueRuntime['isAlive'],
): readonly string[] {
  const names = readDirectory(queue);
  if (names === undefined) throw new Error('heavy lock published queue disappeared');
  for (const name of names) {
    if (name.startsWith('.') && !name.startsWith('.draft-')) continue;
    const draft = name.startsWith('.draft-'),
      identity = decodeTicketName(draft ? name.slice(7) : name);
    const path = join(queue, name);
    if (!isAlive(identity.pid)) {
      // Proof: c30b-queue-dead-reclaim; injected retain dead tickets and drafts failed `reclaims dead tickets and drafts before decoding their incomplete bodies`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
      // Proof: c30b-queue-dead-draft-bytes; injected decode incomplete dead draft UTF8 failed `reclaims an interrupted dead draft whose command ends in partial UTF8`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
      if (readObservedBytes(path) !== undefined) removeFile(path);
    } else if (!draft) {
      const ticket = readTicket(queue, name);
      // Proof: c30b-queue-grace; injected reclaim at the sixty-second boundary failed `reclaims a live ticket only strictly beyond its deadline plus sixty seconds`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
      if (ticket !== undefined && now > ticket.deadline + 60n) removeFile(path);
    }
  }
  const remaining = readDirectory(queue);
  if (remaining === undefined) throw new Error('heavy lock published queue disappeared');
  return remaining.filter((name) => !name.startsWith('.')).sort();
}

/**
 * Publish a complete hidden draft, then exclusively link it into queue order without overwriting
 * another ticket. Stable trusted parent namespaces and cooperating protocol writers are required;
 * path cleanup is not an atomic identity check against arbitrary namespace replacement.
 * Admission cancellation never races active work: after entry, work and known record cleanup
 * settle inside native ownership. Wait budgets are monotonic; published deadlines are epoch time.
 * Work receives its first-arrival count and elapsed whole seconds under ownership, so executable
 * adapters can report admission before spawning their payload. The runtime clock is monotonic.
 * This adapter owns no signals or descendants and leaves the canonical mutex inode intact.
 */
export async function runQueuedWork<T>(
  request: QueueRequest,
  work: (admission: Admission) => Promise<T>,
  runtime: QueueRuntime,
): Promise<QueueOutcome<T>> {
  const { path, label, command, waitSeconds, pollSeconds } = request;
  const { pid, signal, readEpoch, readElapsed, isAlive, wait } = runtime;
  // Proof: c30b-wait-validation; injected skip wait budget admission failed `refuses invalid request waitSeconds -1 before touching the filesystem` and 2 additional named controls; restoration passed. Negative budget reaches erroneous admission; fractional/nonfinite values can still meet BigInt conversion after queue creation.
  if (!Number.isSafeInteger(waitSeconds) || waitSeconds < 0)
    throw new RequestRefusal('heavy lock wait seconds must be a nonnegative safe integer');
  // Proof: c30b-poll-validation; injected skip poll interval admission failed `refuses invalid request pollSeconds 0 before touching the filesystem` and 2 additional named controls; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
  if (!Number.isInteger(pollSeconds) || pollSeconds < 1 || pollSeconds > 30)
    throw new RequestRefusal('heavy lock poll seconds must be between 1 and 30');
  // Proof: c30b-pid-validation; injected skip caller PID admission failed `refuses invalid caller PID 0` and 2 additional named controls; restoration passed. Secondary ticket PID guards remain; this proves refusal before filesystem publication.
  if (!Number.isInteger(pid) || pid < 1 || pid > 2147483647)
    throw new Error('heavy lock caller PID is outside the native range');
  // Proof: c30b-label-validation; injected skip single-line lane-label admission failed `refuses invalid request label "" before touching the filesystem` and 3 additional named controls; restoration passed. Some cases still meet positional ticket refusal; preserve prepublication ordering and actual admitted cases separately.
  if (label === '' || /[\r\n\0]/u.test(label))
    throw new RequestRefusal('heavy lock label must be a nonempty single line');
  // Proof: c30b-prepublication-cancel; injected publish state for an already-cancelled caller failed `cancels before publishing and while waiting without entering protected work`; restoration passed. Without the early guard later cancellation may still refuse; no queue may have been created in the already-cancelled branch.
  if (signal.aborted) return { kind: 'cancelled' };
  const started = new Date(Number(readEpoch() / 1000000n)).toISOString().replace(/\.\d{3}Z$/u, 'Z');
  const stamp = readEpoch();
  // Proof: c30b-stamp-validation; injected skip stamp-width admission failed `refuses an invalid queue stamp before creating filesystem state`; restoration passed. Secondary filename admission remains; this proves the explicit diagnostic and prepublication ordering.
  if (!/^[0-9]{19}$/u.test(stamp.toString()))
    throw new Error('heavy lock ticket stamp must contain 19 digits');
  const queue = path + '.queue',
    record = path + '.d',
    name = stamp.toString() + '-' + String(pid);
  const draft = join(queue, '.draft-' + name),
    ticket = join(queue, name);
  try {
    mkdirSync(queue);
  } catch (cause) {
    if (!hasCode(cause, 'EEXIST')) throw cause;
  }
  if (readDirectory(queue) === undefined)
    throw new Error('heavy lock queue is absent after provisioning');
  let ownsDraft = false,
    ownsTicket = false;
  return settleWithCleanup(async () => {
    const descriptor = openSync(draft, 'wx', 0o600);
    // Proof: c30b-draft-ownership; injected forget partial-draft cleanup ownership failed `preserves both a partial draft write failure and its real descriptor close failure`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
    ownsDraft = true;
    await settleWithCleanup(async () => {
      writeFileSync(
        descriptor,
        'pid ' +
          String(pid) +
          '\nlabel ' +
          label +
          '\nstarted ' +
          started +
          '\ndeadline ' +
          (stamp / 1000000000n + BigInt(waitSeconds)).toString() +
          '\ncommand ' +
          command +
          '\n',
      );
      await Promise.resolve();
    }, [
      () => {
        closeSync(descriptor);
      },
    ]);
    // Proof: c30b-ticket-exclusive-publication; injected overwrite a published ticket with rename failed `refuses a duplicate published ticket without overwriting or removing its bytes`; restoration passed. First failure is erroneous resolved admission; later byte-preservation assertion is not reached.
    linkSync(draft, ticket);
    ownsTicket = true;
    removeFile(draft);
    ownsDraft = false;
    const enqueuedAt = readElapsed();
    let aheadAtArrival: number | undefined;
    for (;;) {
      if (signal.aborted) return { kind: 'cancelled' };
      const names = reclaimQueue(queue, readEpoch() / 1000000000n, isAlive);
      // Proof: c30b-own-ticket-scan; injected skip the early own-ticket presence check failed `refuses to claim when its published ticket disappeared during admission`; restoration passed. Early admission ordering only: removed scan guard still meets the later native ticket refusal, but must not have created the mutex.
      if (!names.includes(name)) throw new Error('heavy lock own ticket vanished before admission');
      const ahead = names.filter((candidate) => candidate < name).length;
      // Proof: c30b-arrival-count; injected overwrite the arrival queue count failed `retains first arrival count while a bounded waiter advances after the earlier ticket leaves`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
      aheadAtArrival ??= ahead;
      // Proof: c30b-queue-fairness; injected allow a later waiter to skip the queue head failed `serves the slower earlier Bun process before the faster later process after a real holder releases`; restoration passed. Actual independent Bun processes poll at 2 and 1 seconds behind an actual flock holder. Queue-order removal must produce a reversed work log, not a test timeout.
      // Proof: c30b-zero-budget-attempt; injected skip a free first attempt at zero budget failed `publishes complete legacy metadata before a zero-budget claim and removes its ticket before work`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
      if (ahead === 0) {
        const arrival = aheadAtArrival;
        const claimed = await holdLock(path, async () => {
          if (signal.aborted) return { kind: 'cancelled' as const };
          // Proof: c30b-own-ticket-native; injected skip the own-ticket check under native ownership failed `rechecks its ticket inside native ownership before publishing a record`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
          if (readTicket(queue, name) === undefined)
            throw new Error('heavy lock own ticket vanished inside native ownership');
          if (!canPublishRecord(record, isAlive)) return { kind: 'busy' as const };
          mkdirSync(record);
          return settleWithCleanup(async () => {
            // Proof: c30b-request-capture; injected reread mutable request label after clock callback failed `captures request and runtime functions before entering a caller supplied capability`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
            // Proof: c30b-holder-publication-order; injected write holder before label failed `cleans a partial holder publication before returning its exact write failure`; restoration passed. Actual holder-write failure boundary observes whether the label has already been written.
            writeFileSync(join(record, 'label'), label + '\n', { flag: 'wx', mode: 0o600 });
            writeFileSync(join(record, 'holder'), String(pid) + '\n', { flag: 'wx', mode: 0o600 });
            // Proof: c30b-ticket-remove-before-work; injected retain the holder ticket during work failed `publishes complete legacy metadata before a zero-budget claim and removes its ticket before work`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
            removeFile(ticket);
            ownsTicket = false;
            if (signal.aborted) return { kind: 'cancelled' as const };
            // Proof: c30b-queue-await-work; injected return the callback promise without awaiting it failed `keeps the native lock and holder until active work settles after cancellation`; restoration passed. First failure is API settled=true while work is pending; later holder/kernel assertions are not reached.
            return {
              kind: 'worked' as const,
              value: await work({
                aheadAtArrival: arrival,
                waitedSeconds: Math.floor(readElapsed() - enqueuedAt),
              }),
            };
          }, [
            () => {
              // Proof: c30b-record-cleanup; injected leave partial holder metadata behind failed `cleans a partial holder publication before returning its exact write failure`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
              removeRecord(record);
            },
          ]);
        });
        if (claimed.kind === 'owned') {
          if (claimed.value.kind === 'cancelled') return { kind: 'cancelled' };
          if (claimed.value.kind === 'worked')
            return { kind: 'completed', value: claimed.value.value, aheadAtArrival };
        }
      }
      // Proof: c30b-monotonic-budget; injected extend the monotonic budget by one poll failed `uses its monotonic wait budget independently of repeated wall clock epochs`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
      const waited = readElapsed() - enqueuedAt;
      if (waited >= waitSeconds) {
        const contention: Contention =
          ahead === 0
            ? { kind: 'holder', pidText: readObservedText(join(record, 'holder')) }
            : {
                kind: 'tickets',
                tickets: names
                  .filter((candidate) => candidate < name)
                  .map((candidate) => {
                    const identity = decodeTicketName(candidate),
                      published = readTicket(queue, candidate);
                    return {
                      pidText: identity.pidText,
                      label:
                        published === undefined
                          ? { kind: 'gone' as const }
                          : { kind: 'named' as const, text: published.label },
                    };
                  }),
              };
        return {
          kind: 'refused',
          ahead,
          aheadAtArrival,
          waitedSeconds: Math.floor(waited),
          contention,
        };
      }
      if ((await wait(pollSeconds)) === 'cancelled') return { kind: 'cancelled' };
    }
  }, [
    () => {
      // Proof: c30b-ticket-cleanup; injected leave a refused caller ticket behind failed `never jumps an earlier live ticket even when the kernel mutex is free`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
      if (ownsTicket) removeFile(ticket);
    },
    () => {
      if (ownsDraft) removeFile(draft);
    },
  ]);
}
