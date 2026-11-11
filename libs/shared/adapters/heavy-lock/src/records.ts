import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';

export type HolderObservation =
  | { readonly kind: 'none' }
  | { readonly kind: 'claiming' }
  | {
      readonly kind: 'recorded';
      readonly pidText: string;
      readonly label:
        { readonly kind: 'pre-queue' } | { readonly kind: 'named'; readonly text: string };
    };
export interface Ticket {
  readonly name: string;
  readonly stamp: bigint;
  readonly pid: number;
  readonly pidText: string;
  readonly label: string;
  readonly deadline: bigint;
}
export interface Status {
  readonly holder: HolderObservation;
  readonly waiters: readonly {
    readonly name: string;
    readonly pidText: string;
    readonly label: string;
    readonly ageSeconds: bigint;
    readonly budget:
      { readonly kind: 'expired' } | { readonly kind: 'left'; readonly seconds: bigint };
  }[];
}

function isAbsent(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

/** Read a physical protocol directory. Absence is expected during provisioning/release only. */
export function readDirectory(path: string): readonly string[] | undefined {
  let directory;
  try {
    // Proof: c30b-directory-parent-error; injected treat unreadable lstat as absence failed `refuses an unreadable parent before classifying a directory as absent`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
    directory = lstatSync(path);
  } catch (cause) {
    if (isAbsent(cause)) return undefined;
    throw new Error('heavy lock directory is unreadable: ' + path, { cause });
  }
  // Proof: c30b-directory-physical; injected follow a metadata-directory symlink failed `refuses a protocol symlink record` and 1 additional named controls; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
  if (!directory.isDirectory())
    throw new Error('heavy lock metadata must use a physical directory: ' + path);
  try {
    // Proof: c30b-directory-list-error; injected treat unreadable listing as absence failed `refuses unreadable queue state rather than reporting absence`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
    return readdirSync(path);
  } catch (cause) {
    if (isAbsent(cause)) return undefined;
    throw new Error('heavy lock directory is unreadable: ' + path, { cause });
  }
}

/**
 * Read one mutable protocol entry through its owned nonblocking descriptor. A vanished file is
 * expected, but unreadable/nonregular/symlink state throws. Incomplete dead drafts are bytes,
 * not UTF8 documents. Complete published metadata is decoded by readObservedText.
 * This descriptor observation does not certify current ownership.
 */
export function readObservedBytes(path: string): Uint8Array | undefined {
  let descriptor: number;
  try {
    // Proof: c30b-metadata-open-error; injected treat unreadable metadata as absent failed `refuses unreadable holder state rather than reporting absence` and 3 additional named controls; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
    // Proof: c30b-metadata-nofollow; injected follow metadata symlinks failed `refuses a protocol symlink holder` and 1 additional named controls; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
    // Proof: c30b-metadata-nonblocking; injected open the readerless metadata FIFO without NONBLOCK failed `refuses a readerless metadata FIFO before opening it can block`; restoration passed. Actual reader-side FIFO child is bounded by parent SIGKILL. Removed NONBLOCK yields ordinary child-exit assertion failure, not a Bun test timeout.
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  } catch (cause) {
    if (isAbsent(cause)) return undefined;
    throw new Error('heavy lock metadata is unreadable: ' + path, { cause });
  }
  let attempt:
    | { readonly kind: 'read'; readonly bytes: Uint8Array }
    | { readonly kind: 'failed'; readonly cause: unknown };
  try {
    // Proof: c30b-metadata-regular; injected remove regular-file admission failed `refuses a nonregular holder before metadata acquisition` and 3 additional named controls; restoration passed. Removing regular-file guard can still meet EISDIR at read; exact regular-file diagnostic, not successful admission, is the oracle.
    if (!fstatSync(descriptor).isFile())
      throw new Error('heavy lock metadata must be a regular file: ' + path);
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(descriptor);
    } catch (cause) {
      throw new Error('heavy lock metadata is unreadable: ' + path, { cause });
    }
    attempt = { kind: 'read', bytes };
  } catch (cause) {
    attempt = { kind: 'failed', cause };
  }
  let release: { readonly cause: unknown } | undefined;
  try {
    closeSync(descriptor);
  } catch (cause) {
    release = { cause };
  }
  if (attempt.kind === 'failed') {
    if (release !== undefined)
      throw new AggregateError(
        // Proof: c30b-metadata-paired; injected drop the paired close cause failed `preserves the metadata read failure and a close failure after closing the real descriptor`; restoration passed. Injected close actually closes the real descriptor then throws; the read and close cause tuple must remain intact.
        [attempt.cause, release.cause],
        'heavy lock metadata read and close failed: ' + path,
      );
    throw attempt.cause;
  }
  // Proof: c30b-metadata-close-only; injected discard a real-close-then-throw failure failed `propagates a metadata close failure after a successful read`; restoration passed. Injected close actually closes the real descriptor then throws; proves error identity, not release after a failed close.
  if (release !== undefined) throw release.cause;
  return attempt.bytes;
}

/** Decode complete published metadata only; dead drafts may contain incomplete UTF8. */
export function readObservedText(path: string): string | undefined {
  const bytes = readObservedBytes(path);
  if (bytes === undefined) return undefined;
  try {
    // Proof: c30b-metadata-utf8; injected replace invalid UTF8 instead of refusing failed `refuses malformed published UTF8 rather than silently replacing its bytes`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
    // Proof: c30b-metadata-newline; injected retain legacy trailing LF bytes failed `reports holder text observationally and applies legacy trailing-LF normalization`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
      .decode(bytes)
      .replace(/\n+$/u, '');
  } catch (cause) {
    throw new Error('heavy lock metadata UTF8 is malformed: ' + path, { cause });
  }
}

/** The filename owns ordering/PID. Only its decimal stamp and native positive PID are accepted. */
export function decodeTicketName(name: string) {
  // Proof: c30b-ticket-name; injected remove epoch/PID name admission failed `refuses malformed published ticket note/label x/deadline 1`; restoration passed. Diagnostic boundary only; BigInt still refuses nonnumeric text after explicit filename guard removal.
  if (!/^[0-9]{19}-[0-9]+$/u.test(name))
    throw new Error('heavy lock queue entry is not an epoch/PID ticket: ' + name);
  const stamp = BigInt(name.slice(0, 19)),
    pidText = name.slice(20),
    pid = BigInt(pidText);
  // Proof: c30b-ticket-pid-lower; injected admit zero ticket PID failed `refuses a published ticket PID outside the native range 0`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
  // Proof: c30b-ticket-pid-upper; injected admit out-of-range ticket PID failed `refuses a published ticket PID outside the native range 2147483648`; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
  if (pid < 1n || pid > 2147483647n)
    throw new Error('heavy lock ticket PID is outside the native range: ' + name);
  return { name, stamp, pid: Number(pid), pidText };
}

/**
 * Decode the legacy positional fields actually used by admission/status: label2 and deadline4.
 * PID comes from the filename; informational pid/started lines and opaque command tails cannot
 * contribute replacement metadata. A ticket disappearing before open is an expected scan race.
 */
export function readTicket(directory: string, name: string): Ticket | undefined {
  const identity = decodeTicketName(name),
    path = join(directory, name),
    text = readObservedText(path);
  if (text === undefined) return undefined;
  const lines = text.split('\n'),
    labelLine = lines.at(1),
    deadlineLine = lines.at(3);
  // Proof: c30b-ticket-label; injected skip the positional label guard failed `refuses malformed published ticket 1800000000000000000-12345/no-label/deadline 1`; restoration passed. Exact label diagnostic; a missing positional line can also fail through later string acquisition.
  if (labelLine === undefined || !labelLine.startsWith('label ') || labelLine.length === 6)
    throw new Error('heavy lock ticket records no lane label: ' + path);
  // Proof: c30b-ticket-deadline; injected skip the positional deadline guard failed `refuses malformed published ticket 1800000000000000000-12345/label x/deadline invalid`; restoration passed. Diagnostic boundary only; BigInt still refuses the invalid deadline after explicit check removal.
  if (deadlineLine === undefined || !/^deadline [0-9]+$/u.test(deadlineLine))
    throw new Error('heavy lock ticket deadline is malformed: ' + path);
  return { ...identity, label: labelLine.slice(6), deadline: BigInt(deadlineLine.slice(9)) };
}

/**
 * Observe record/queue files without acquiring/creating a mutex or reclaiming any ticket.
 * Corrupt holder PID text is preserved for the legacy human report; admission validates it
 * separately. Missing/empty holder means claiming, absent label means a pre-queue holder,
 * and a directory that disappears during the read means none. Snapshots may be stale or mixed
 * across a concurrent release/publication; no caller may use this view as proof of kernel ownership.
 */
export function readStatus(path: string, nowSeconds: bigint): Status {
  const record = path + '.d',
    queue = path + '.queue';
  let holder: HolderObservation;
  if (readDirectory(record) === undefined) holder = { kind: 'none' };
  else {
    const pidText = readObservedText(join(record, 'holder')),
      // Proof: c30b-status-incomplete-label; injected skip the label read during incomplete holder publication failed `refuses an unreadable label during incomplete holder publication undefined` and 1 additional named controls; restoration passed. Production-path fault and exact restored named control; credit follows the first observed assertion.
      label = readObservedText(join(record, 'label'));
    if (pidText === undefined || pidText === '')
      holder = readDirectory(record) === undefined ? { kind: 'none' } : { kind: 'claiming' };
    else {
      holder =
        label === undefined && readDirectory(record) === undefined
          ? { kind: 'none' }
          : {
              kind: 'recorded',
              pidText,
              label: label === undefined ? { kind: 'pre-queue' } : { kind: 'named', text: label },
            };
    }
  }
  const names = readDirectory(queue),
    waiters: Status['waiters'][number][] = [];
  // Dot files are unpublished entries. Status neither interprets nor reclaims their bodies.
  for (const name of (names === undefined ? [] : [...names])
    .filter((name) => !name.startsWith('.'))
    .sort()) {
    const ticket = readTicket(queue, name);
    if (ticket === undefined) continue;
    waiters.push({
      name,
      pidText: ticket.pidText,
      label: ticket.label,
      ageSeconds: nowSeconds - ticket.stamp / 1000000000n,
      budget:
        nowSeconds < ticket.deadline
          ? { kind: 'left', seconds: ticket.deadline - nowSeconds }
          : { kind: 'expired' },
    });
  }
  return { holder, waiters };
}

/** Render exactly the legacy human line protocol; observations confer no admission authority. */
export function renderStatus(status: Status): string {
  const holder = status.holder;
  const first =
    holder.kind === 'none'
      ? 'heavy lock: holder none'
      : holder.kind === 'claiming'
        ? 'heavy lock: holder claiming'
        : 'heavy lock: holder pid ' +
          holder.pidText +
          ' label ' +
          (holder.label.kind === 'pre-queue' ? 'unlabeled (pre-queue holder)' : holder.label.text);
  return (
    [
      first,
      ...status.waiters.map(
        (waiter) =>
          'heavy lock: waiter pid ' +
          waiter.pidText +
          ' label ' +
          waiter.label +
          ' age ' +
          waiter.ageSeconds.toString() +
          's budget ' +
          (waiter.budget.kind === 'expired'
            ? 'expired'
            : waiter.budget.seconds.toString() + 's left'),
      ),
    ].join('\n') + '\n'
  );
}
