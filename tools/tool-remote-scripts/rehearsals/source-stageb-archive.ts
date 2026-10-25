import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';

const slots = [
  'input-manifest',
  'approval-reference',
  'setup',
  'journal',
  'capture-fd4',
  'channel-transcript',
  'observer-backend',
  'observer-gateway',
  'observer-mcp',
  'observer-frontend',
  'instrument-finalization',
  'source-channel-settlement',
  'runner-settlement',
  'provider-cleanup',
  'failures',
] as const;
type Slot = (typeof slots)[number];
type Status = 'recorded' | 'not-reached' | 'unavailable';
type Binding = Readonly<{
  implementationSha: string;
  workflowSha: string;
  nonce: string;
  inputManifestSha256: string;
  recipientFingerprint: string;
}>;
declare const archiveBrand: unique symbol;
/** Original private collector identity only; claims confer no authenticated authority. */
export interface SourceArchive {
  readonly [archiveBrand]: true;
}
/** Mutable private handoff. A2 must hash the exact bytes it consumes again. */
export interface SourceArchiveBytes {
  readonly evidence: 'private-serialized';
  readonly bytes: Uint8Array;
  readonly indexSha256: string;
  readonly plaintextSha256: string;
}
interface Member {
  slot: Slot;
  ordinal: number;
  bytes: Buffer;
  length: number;
  sha256: string;
}
interface Closure {
  slot: Slot;
  status: Status | undefined;
  count: number;
}
interface Counters {
  count: number;
  journalCount: number;
  journalBytes: number;
  rawBytes: number;
  chargedBytes: number;
}
interface Collector {
  binding: Binding;
  deadline: number;
  members: Member[];
  closures: Closure[];
  counters: Counters;
  live: boolean;
}
const collectors = new WeakMap<SourceArchive, Collector>();
const memberLimit = 8388608;
const countLimit = 8192;
const journalCountLimit = 4096;
const journalMemberLimit = 16384;
const journalByteLimit = 4194304;
const archiveLimit = 134217728;
const digestPlaceholder = '0'.repeat(64);
function refuse(): never {
  throw new Error('source archive refused');
}
function digest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function fields(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    refuse();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  // Proof: closed-fields omission admitted an extra private request field (watched closed-fields).
  if (Reflect.ownKeys(descriptors).length !== names.length) refuse();
  const checked: Record<string, unknown> = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable)
      refuse();
    checked[name] = descriptor.value;
  }
  return checked;
}
function parseBinding(value: unknown): Binding {
  const checked = fields(value, [
    'implementationSha',
    'workflowSha',
    'nonce',
    'inputManifestSha256',
    'recipientFingerprint',
  ]);
  function hex(name: string, length: number): string {
    const claim = checked[name];
    // Proof: binding-shape omission admitted a malformed nonce (watched binding-shape).
    if (typeof claim !== 'string' || claim.length !== length || !/^[0-9a-f]+$/.test(claim))
      refuse();
    return claim;
  }
  return Object.freeze({
    implementationSha: hex('implementationSha', 40),
    workflowSha: hex('workflowSha', 40),
    nonce: hex('nonce', 32),
    inputManifestSha256: hex('inputManifestSha256', 64),
    recipientFingerprint: hex('recipientFingerprint', 64),
  });
}
function parseSlot(value: unknown): Slot {
  // Proof: slot-cardinality fallback admitted a traversal-shaped slot as setup.
  for (const slot of slots) if (slot === value) return slot;
  return refuse();
}
function integer(value: unknown): number {
  // Proof: safe-integer omission admitted a negative retained-byte counter.
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) refuse();
  return value;
}
function assertDeadline(collector: Collector): void {
  if (!collector.live || performance.now() >= collector.deadline) refuse();
}
function getCollector(token: SourceArchive): Collector {
  const collector = collectors.get(token);
  if (collector === undefined) refuse();
  return collector;
}
function drop(collector: Collector): void {
  collector.live = false;
  collector.members = [];
  collector.closures = [];
}
function mutate<T>(token: SourceArchive, operation: (collector: Collector) => T): T {
  const collector = getCollector(token);
  try {
    // Proof: deadline-operation omission admitted append after the original entry deadline.
    assertDeadline(collector);
    return operation(collector);
  } catch {
    // Boundary: every mutation failure destroys retained state; private dependency errors never escape.
    // Proof: poison-failure omission allowed a corrected append after a failed mutation.
    drop(collector);
    return refuse();
  }
}
function baseLength(
  binding: Binding,
  closures: readonly { slot: Slot; status: Status; count: number }[],
): number {
  return Buffer.byteLength(
    JSON.stringify({
      format: 'source-stageb-private-archive',
      version: 1,
      index: {
        format: 'source-stageb-private-index',
        version: 1,
        binding,
        slots: closures,
        members: [],
      },
      members: [],
    }) + '\n',
  );
}
function memberLength(slot: Slot, ordinal: number, bytes: number): number {
  return (
    Buffer.byteLength(JSON.stringify({ slot, ordinal, bytes, sha256: digestPlaceholder })) +
    Buffer.byteLength(JSON.stringify({ slot, ordinal, base64: '' })) +
    4 * Math.ceil(bytes / 3)
  );
}
/**
 * The initial charge reserves every slot's longest status and four-digit count.
 * Thus chargedBytes is a conservative reservation until actual closures replace that baseline.
 * This pure arithmetic API cannot mint a collector or alter its fixed limits.
 * @internal
 */
export function reserveSourceArchiveMember(
  slot: unknown,
  ordinal: unknown,
  bytes: unknown,
  previous: Readonly<Counters>,
): Counters {
  const checkedSlot = parseSlot(slot);
  const checkedOrdinal = integer(ordinal);
  const length = integer(bytes);
  const checked = fields(previous, [
    'count',
    'journalCount',
    'journalBytes',
    'rawBytes',
    'chargedBytes',
  ]);
  const count = integer(checked['count']);
  const journalCount = integer(checked['journalCount']);
  const journalBytes = integer(checked['journalBytes']);
  const rawBytes = integer(checked['rawBytes']);
  const chargedBytes = integer(checked['chargedBytes']);
  // Proof: member-cap/count-cap/manifest-cardinality omissions admitted forbidden actual appends.
  if (
    length < 1 ||
    length > memberLimit ||
    checkedOrdinal >= countLimit ||
    count >= countLimit ||
    journalCount > journalCountLimit ||
    journalCount > count ||
    journalBytes > journalByteLimit ||
    rawBytes > archiveLimit ||
    chargedBytes > archiveLimit ||
    (checkedSlot === 'input-manifest' && checkedOrdinal !== 0)
  )
    refuse();
  const isJournal = checkedSlot === 'journal';
  // Proof: journal-count-cap/member-cap/byte-cap omissions admitted corresponding reduced-cap chunks.
  if (
    isJournal &&
    (length > journalMemberLimit ||
      journalCount >= journalCountLimit ||
      journalBytes + length > journalByteLimit)
  )
    refuse();
  const next = {
    count: count + 1,
    journalCount: journalCount + (isJournal ? 1 : 0),
    journalBytes: journalBytes + (isJournal ? length : 0),
    rawBytes: rawBytes + length,
    chargedBytes:
      chargedBytes + memberLength(checkedSlot, checkedOrdinal, length) + (count === 0 ? 0 : 2),
  };
  if (
    !Number.isSafeInteger(next.chargedBytes) ||
    next.chargedBytes > archiveLimit ||
    next.rawBytes > archiveLimit
  )
    refuse();
  return next;
}
function byteView(value: unknown): Uint8Array {
  // Proof: view-kind omission admitted Uint16Array bytes; shared-view omission retained a shared view.
  if (
    typeof value !== 'object' ||
    value === null ||
    isProxy(value) ||
    !ArrayBuffer.isView(value) ||
    (Object.getPrototypeOf(value) !== Uint8Array.prototype &&
      Object.getPrototypeOf(value) !== Buffer.prototype)
  )
    refuse();
  const prototype: unknown = Object.getPrototypeOf(Uint8Array.prototype);
  if (typeof prototype !== 'object' || prototype === null) refuse();
  function intrinsic(name: string): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (descriptor?.get === undefined) refuse();
    return descriptor.get.call(value);
  }
  const buffer: unknown = intrinsic('buffer');
  const offset = integer(intrinsic('byteOffset'));
  const length = integer(intrinsic('byteLength'));
  if (!(buffer instanceof ArrayBuffer)) refuse();
  return new Uint8Array(buffer, offset, length);
}
/** Creates a bounded collector from detached, syntactically checked, unauthenticated claims. */
export function createSourceArchive(request: unknown): SourceArchive {
  const entered = performance.now();
  try {
    const checked = fields(request, ['binding', 'deadline']);
    const binding = parseBinding(checked['binding']);
    const deadline = checked['deadline'];
    // Proof: deadline-creation-upper omission admitted a deadline beyond 600000ms.
    if (
      typeof deadline !== 'number' ||
      !Number.isFinite(deadline) ||
      deadline <= performance.now() ||
      deadline > entered + 600000
    )
      refuse();
    const closures = slots.map((slot) => ({ slot, status: undefined, count: 0 }));
    const chargedBytes = baseLength(
      binding,
      slots.map((slot) => ({ slot, status: 'unavailable', count: 8192 })),
    );
    // Boundary: only the private WeakMap grants original identity; no visible token fields carry authority.
    const token = Object.freeze({}) as SourceArchive;
    const collector: Collector = {
      binding,
      deadline,
      members: [],
      closures,
      counters: { count: 0, journalCount: 0, journalBytes: 0, rawBytes: 0, chargedBytes },
      live: true,
    };
    assertDeadline(collector);
    collectors.set(token, collector);
    return token;
  } catch {
    return refuse();
  }
}
/** Copies one ordered raw chunk only after reserving all payload and future index costs. Failure poisons the collector. */
export function appendSourceArchiveMember(token: SourceArchive, request: unknown): void {
  mutate(token, (collector) => {
    const checked = fields(request, ['slot', 'ordinal', 'bytes']);
    const slot = parseSlot(checked['slot']);
    const ordinal = integer(checked['ordinal']);
    const closure = collector.closures.find((candidate) => candidate.slot === slot);
    // Proof: ordinal and append-closed-slot omissions admitted skipped ordinals and appends after closure.
    if (closure === undefined || closure.status !== undefined || ordinal !== closure.count)
      refuse();
    const view = byteView(checked['bytes']);
    // Proof: reservation-consumer omission retained a chunk when metadata alone exhausted the reduced archive cap.
    const reservation = reserveSourceArchiveMember(
      slot,
      ordinal,
      view.byteLength,
      collector.counters,
    );
    collector.counters = reservation;
    // Proof: copy-ownership alias fault caused later retained-hash refusal after caller mutation, not unsafe serialized success.
    const bytes = Buffer.from(view);
    const sha256 = digest(bytes);
    // Proof: manifest-hash omission admitted unequal exact input bytes.
    if (slot === 'input-manifest' && sha256 !== collector.binding.inputManifestSha256) refuse();
    collector.members.push({ slot, ordinal, bytes, length: view.byteLength, sha256 });
    closure.count++;
    assertDeadline(collector);
  });
}
/** Closes a fixed slot explicitly. Status describes retained material, never producer truth or authority. */
export function finishSourceArchiveSlot(token: SourceArchive, request: unknown): void {
  mutate(token, (collector) => {
    const checked = fields(request, ['slot', 'status']);
    const slot = parseSlot(checked['slot']);
    const status = checked['status'];
    // Proof: status-enumeration and status-membership omissions admitted invalid closures.
    if (status !== 'recorded' && status !== 'not-reached' && status !== 'unavailable') refuse();
    const closure = collector.closures.find((candidate) => candidate.slot === slot);
    // Proof: duplicate-close omission allowed a second status on one slot.
    if (
      closure === undefined ||
      closure.status !== undefined ||
      (status === 'recorded') !== closure.count > 0
    )
      refuse();
    closure.status = status;
    assertDeadline(collector);
  });
}
/**
 * Emits fixed-order compact JSON with base64 bodies and one LF, then permanently closes.
 * Index SHA256 excludes LF; plaintext SHA256 includes it. No recursive index/ciphertext hash exists.
 * Synchronous work is not preemptible: original expiry is checked before successful return.
 */
export function serializeSourceArchive(token: SourceArchive): SourceArchiveBytes {
  return mutate(token, (collector) => {
    // Proof: final-completeness omission emitted bytes without explicit closure of every slot.
    const closures = collector.closures.map((closure) => {
      if (closure.status === undefined) refuse();
      return { slot: closure.slot, status: closure.status, count: closure.count };
    });
    const ordered = slots.flatMap((slot) =>
      collector.members.filter((member) => member.slot === slot),
    );
    // Proof: retained-hash omission emitted corrupted retained bytes under a stale index digest.
    for (const member of ordered)
      if (
        member.bytes.length !== member.length ||
        member.length < 1 ||
        digest(member.bytes) !== member.sha256
      )
        refuse();
    const index = {
      format: 'source-stageb-private-index',
      version: 1,
      binding: collector.binding,
      slots: closures,
      members: ordered.map((member) => ({
        slot: member.slot,
        ordinal: member.ordinal,
        bytes: member.bytes.length,
        sha256: member.sha256,
      })),
    };
    const reservedBase = baseLength(
      collector.binding,
      slots.map((slot) => ({ slot, status: 'unavailable', count: 8192 })),
    );
    const planned =
      collector.counters.chargedBytes - reservedBase + baseLength(collector.binding, closures);
    if (planned > archiveLimit || planned > collector.counters.chargedBytes) refuse();
    const envelope = {
      format: 'source-stageb-private-archive',
      version: 1,
      index,
      members: ordered.map((member) => ({
        slot: member.slot,
        ordinal: member.ordinal,
        base64: member.bytes.toString('base64'),
      })),
    };
    const bytes = new Uint8Array(Buffer.from(JSON.stringify(envelope) + '\n', 'utf8'));
    // Proof: emitted-bound omission returned injected bytes beyond the reduced serialized ceiling.
    if (bytes.byteLength !== planned || bytes.byteLength > archiveLimit) refuse();
    const indexSha256 = digest(JSON.stringify(index));
    const plaintextSha256 = digest(bytes);
    // Proof: deadline-final omission returned private serialized bytes after original expiry; replay omission permitted serialization twice.
    assertDeadline(collector);
    drop(collector);
    return { evidence: 'private-serialized', bytes, indexSha256, plaintextSha256 };
  });
}
/**
 * Idempotently releases private references; promises no secure memory erasure. Foreign identities refuse.
 * Proof: discard omission admitted a subsequent append on the discarded original identity.
 */
export function discardSourceArchive(token: SourceArchive): void {
  drop(getCollector(token));
}
