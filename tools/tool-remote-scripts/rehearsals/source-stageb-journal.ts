import { createHash } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import { type FileHandle, lstat, open, readdir } from 'node:fs/promises';

const journalBrand: unique symbol = Symbol('journal');
const intentBrand: unique symbol = Symbol('intent');
const dispatchBrand: unique symbol = Symbol('dispatch');
const resourceBrand: unique symbol = Symbol('resource');
export interface SourceJournal {
  readonly [journalBrand]: true;
}
export interface SourceIntent {
  readonly [intentBrand]: true;
}
export interface SourceDispatch {
  readonly [dispatchBrand]: true;
}
/** Original control evidence only; never native ownership, liveness or cleanup authority. */
export interface RecordedResource {
  readonly [resourceBrand]: true;
}
type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
type Fields = Record<string, unknown>;
type Operation =
  'create' | 'start' | 'stop-join' | 'remove' | 'write' | 'capture' | 'acknowledge' | 'finalize';
type ResourceClass =
  'container' | 'network' | 'image-tag' | 'directory' | 'file' | 'unit' | 'helper' | 'descriptor';
type Phase = 'open' | 'cleanup-only' | 'sealed' | 'unusable' | 'closed';
interface Identity {
  readonly fields: Readonly<Record<string, string | number>>;
  readonly key: string;
  readonly kind: ResourceClass;
}
interface Resource {
  readonly journal: Journal;
  readonly ordinal: number;
  readonly identity: Identity;
  readonly token: RecordedResource;
  status: 'recorded' | 'absence-recorded';
}
interface Intent {
  readonly journal: Journal;
  readonly sequence: number;
  readonly operation: Operation;
  readonly ordinal: number;
  readonly resourceClass?: ResourceClass;
  readonly resource?: Resource;
  status: 'unused' | 'dispatched' | 'settled';
}
interface Dispatch {
  readonly journal: Journal;
  readonly intent: Intent;
  settled: boolean;
}
interface Entry {
  readonly name: string;
  readonly bytes: Buffer;
  readonly identity: BigIntStats;
  readonly record: Json;
}
interface Journal {
  readonly parent: FileHandle;
  readonly directory: FileHandle;
  nonce: string;
  readonly deadline: number;
  uid: number;
  gid: number;
  parentIdentity?: BigIntStats;
  directoryIdentity?: BigIntStats;
  readonly entries: Entry[];
  readonly intents: Set<Intent>;
  readonly resources: Resource[];
  phase: Phase;
  busy: boolean;
  charged: number;
  reserved: number;
  failure?: { readonly cause: unknown };
  closing?: Promise<void>;
  active?: Promise<void>;
  readonly leaves: Set<FileHandle>;
  readonly closedDescriptors: WeakSet<FileHandle>;
  readonly cleanup: unknown[];
}
const journals = new WeakMap<SourceJournal, Journal>();
const intents = new WeakMap<SourceIntent, Intent>();
const dispatches = new WeakMap<SourceDispatch, Dispatch>();
const resources = new WeakMap<RecordedResource, Resource>();

/** Retains the first private failure independently of later owned IO and descriptor-close failures. */
export class SourceJournalFailure extends Error {
  constructor(
    readonly primary: unknown,
    readonly cleanup: readonly unknown[],
  ) {
    super('private source journal failed');
  }
}
const recordLimit = 4096;
const recordBytesLimit = 16384;
const journalBytesLimit = 4194304;
const resourceLimit = 256;

/** Pure fixed-ceiling accounting; creates no journal or token authority. @internal */
export function reserveSourceJournalRecord(
  recordCount: number,
  chargedBytes: number,
  nextBytes: number,
): { readonly recordCount: number; readonly chargedBytes: number } {
  integer(recordCount, 0, recordLimit);
  integer(chargedBytes, 0, journalBytesLimit);
  // Proof: planner-record-bytes omission let a bounded oversized serialization publish and return dispatch.
  integer(nextBytes, 1, recordBytesLimit);
  // Proof: planner-record-count omission returned count 4097 at the exact shipping boundary.
  if (recordCount >= recordLimit) reject('record count exceeded');
  // Proof: planner-cumulative omission returned 4194305 bytes at the one-byte shipping overflow boundary.
  if (nextBytes > journalBytesLimit - chargedBytes) reject('cumulative bytes exceeded');
  return Object.freeze({ recordCount: recordCount + 1, chargedBytes: chargedBytes + nextBytes });
}
/** Pure lifetime reference accounting, including pending creations. @internal */
export function reserveSourceJournalCreation(
  recordedResources: number,
  pendingCreations: number,
): number {
  integer(recordedResources);
  integer(pendingCreations);
  const reservations = recordedResources + pendingCreations;
  // Proof: planner-resource omission returned reference reservation 257 instead of refusing.
  if (!Number.isSafeInteger(reservations) || reservations >= resourceLimit)
    reject('resource bound');
  return reservations + 1;
}
function reject(message: string): never {
  throw new Error(`source journal ${message}`);
}
function fields(value: unknown, keys: readonly string[]): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) reject('object refused');
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    reject('fields refused');
  // Boundary: the non-null non-array object was checked above; each property is still unknown and validated by its consumer.
  return value as Fields;
}
function text(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || value.length > 16384 || !pattern.test(value))
    reject('text refused');
  return value;
}
function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    reject('integer refused');
  return value;
}
function member<T extends string>(value: unknown, choices: readonly T[]): T {
  for (const choice of choices) if (value === choice) return choice;
  return reject('vocabulary refused');
}
const classes: readonly ResourceClass[] = [
  'container',
  'network',
  'image-tag',
  'directory',
  'file',
  'unit',
  'helper',
  'descriptor',
];
const operations: readonly Operation[] = [
  'create',
  'start',
  'stop-join',
  'remove',
  'write',
  'capture',
  'acknowledge',
  'finalize',
];
const purposes = [
  'source',
  'backend',
  'gateway',
  'ingress',
  'solver',
  'store',
  'runtime',
  'inputs',
  'instrument',
  'transport',
] as const;
const digestPattern = /^[a-f0-9]{64}$/;
function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function parseClaim(value: unknown): { readonly nonce: string; readonly projection: Json } {
  const claim = fields(value, [
    'format',
    'version',
    'nonce',
    'implementationSha',
    'workflowSha',
    'sourceSha',
    'inputManifestSha256',
  ]);
  if (claim['format'] !== 'source-stageb-journal' || claim['version'] !== 1)
    reject('claim version refused');
  const nonce = text(claim['nonce'], /^[a-f0-9]{32}$/);
  return {
    nonce,
    projection: {
      format: 'source-stageb-journal',
      version: 1,
      nonce,
      implementationSha: text(claim['implementationSha'], /^[a-f0-9]{40}$/),
      workflowSha: text(claim['workflowSha'], /^[a-f0-9]{40}$/),
      sourceSha: text(claim['sourceSha'], /^[a-f0-9]{40}$/),
      inputManifestSha256: text(claim['inputManifestSha256'], digestPattern),
    },
  };
}
function parseIdentity(value: unknown): Identity {
  if (typeof value !== 'object' || value === null || !('kind' in value)) reject('identity refused');
  const kind = member(value.kind, classes);
  const hash = (value: unknown) => text(value, digestPattern);
  const decimal = (value: unknown) => text(value, /^(0|[1-9][0-9]*)$/);
  const positive = (value: unknown) => text(value, /^[1-9][0-9]*$/);
  let projection: Record<string, string | number>;
  let key: string;
  switch (kind) {
    case 'container': {
      const identity = fields(value, ['kind', 'id', 'imageId']);
      const id = hash(identity['id']);
      projection = { kind, id, imageId: text(identity['imageId'], /^sha256:[a-f0-9]{64}$/) };
      key = `${kind}:${id}`;
      break;
    }
    case 'network': {
      const identity = fields(value, ['kind', 'id']);
      const id = hash(identity['id']);
      projection = { kind, id };
      key = `${kind}:${id}`;
      break;
    }
    case 'image-tag': {
      const identity = fields(value, ['kind', 'tagSha256', 'imageId']);
      const tagSha256 = hash(identity['tagSha256']);
      projection = { kind, tagSha256, imageId: text(identity['imageId'], /^sha256:[a-f0-9]{64}$/) };
      key = `${kind}:${tagSha256}`;
      break;
    }
    case 'file':
    case 'directory': {
      const identity = fields(value, ['kind', 'device', 'inode', 'uid', 'gid', 'mode']);
      const device = decimal(identity['device']);
      const inode = positive(identity['inode']);
      projection = {
        kind,
        device,
        inode,
        uid: integer(identity['uid']),
        gid: integer(identity['gid']),
        mode: integer(identity['mode'], 0, 0o7777),
      };
      key = `filesystem:${device}:${inode}`;
      break;
    }
    case 'unit': {
      const identity = fields(value, ['kind', 'nameSha256', 'definitionSha256']);
      const nameSha256 = hash(identity['nameSha256']);
      projection = { kind, nameSha256, definitionSha256: hash(identity['definitionSha256']) };
      key = `${kind}:${nameSha256}`;
      break;
    }
    case 'helper': {
      const identity = fields(value, ['kind', 'pid', 'start', 'uid', 'gid', 'executableSha256']);
      const pid = integer(identity['pid'], 1);
      const start = positive(identity['start']);
      projection = {
        kind,
        pid,
        start,
        uid: integer(identity['uid']),
        gid: integer(identity['gid']),
        executableSha256: hash(identity['executableSha256']),
      };
      key = `${kind}:${String(pid)}:${start}`;
      break;
    }
    case 'descriptor': {
      const identity = fields(value, ['kind', 'descriptor', 'device', 'inode', 'mode']);
      const descriptor = integer(identity['descriptor']);
      projection = {
        kind,
        descriptor,
        device: decimal(identity['device']),
        inode: positive(identity['inode']),
        mode: integer(identity['mode'], 0, 0o7777),
      };
      key = `${kind}:${String(descriptor)}`;
      break;
    }
  }
  return Object.freeze({ kind, fields: Object.freeze(projection), key });
}
function path(directory: FileHandle, leaf?: string): string {
  if (!Number.isSafeInteger(directory.fd) || directory.fd < 0) reject('descriptor closed');
  return `/proc/self/fd/${String(directory.fd)}${leaf === undefined ? '' : `/${leaf}`}`;
}
function sameIdentity(current: BigIntStats, retained: BigIntStats, file: boolean): void {
  // Proof: retained-inode omission accepted a same-byte 0600 replacement in the dispatch consumer.
  if (
    current.dev !== retained.dev ||
    current.ino !== retained.ino ||
    current.mode !== retained.mode ||
    current.uid !== retained.uid ||
    current.gid !== retained.gid ||
    (file && (current.size !== retained.size || current.nlink !== 1n))
  )
    reject('identity changed');
}
function assertDirectory(identity: BigIntStats, journal: Journal): void {
  // Proof: separate foreign-uid and foreign-gid guard omissions admitted a claim/journal under controlled owned-stat faults.
  if (
    !identity.isDirectory() ||
    (identity.mode & 0o7777n) !== 0o700n ||
    identity.uid !== BigInt(journal.uid) ||
    identity.gid !== BigInt(journal.gid)
  )
    reject('private directory refused');
}
function retainFailure(journal: Journal, cause: unknown): void {
  // Proof: first-primary omission lost the timeout to late IO; close-only-primary omission invented a nested operation failure.
  if (!(
    cause instanceof SourceJournalFailure &&
    cause.primary === undefined &&
    journal.cleanup.length > 0
  ))
    journal.failure ??= { cause };
  if (journal.phase !== 'closed') journal.phase = 'unusable';
}
function journalFailure(journal: Journal): unknown {
  // Proof: primary-cleanup-join omission returned the timeout without the exact late leaf-close failure.
  if (journal.cleanup.length > 0)
    return new SourceJournalFailure(journal.failure?.cause, Object.freeze([...journal.cleanup]));
  if (journal.failure === undefined)
    return new Error('source journal settlement failed without cause');
  return journal.failure.cause;
}
function assertLive(journal: Journal): void {
  if (journal.phase === 'closed' || journal.phase === 'unusable') {
    if (journal.failure !== undefined) throw journal.failure.cause;
    reject('unusable or closed');
  }
  if (performance.now() >= journal.deadline) {
    retainFailure(journal, new Error('source journal deadline exceeded'));
    throw journalFailure(journal);
  }
}
/** The deadline invalidates success, but completion joins the already-started noncancellable IO. */
async function bounded<T>(journal: Journal, invoke: () => Promise<T>): Promise<T> {
  assertLive(journal);
  let value: T;
  try {
    value = await invoke();
  } catch (cause) {
    if (journal.failure !== undefined && cause !== journal.failure.cause)
      journal.cleanup.push(cause);
    retainFailure(journal, cause);
    throw journalFailure(journal);
  }
  assertLive(journal);
  return value;
}
async function closeDescriptor(journal: Journal, descriptor: FileHandle): Promise<void> {
  // Proof: exact-once-close omission invoked close twice on the same transferred FileHandle during alias refusal.
  if (journal.closedDescriptors.has(descriptor)) return;
  journal.closedDescriptors.add(descriptor);
  journal.leaves.delete(descriptor);
  const closure = await Promise.allSettled([Promise.resolve().then(() => descriptor.close())]);
  for (const settlement of closure)
    if (settlement.status === 'rejected') journal.cleanup.push(settlement.reason);
}
async function openLeaf(
  journal: Journal,
  filename: string,
  flags: number,
  mode?: number,
): Promise<FileHandle> {
  return bounded(journal, async () => {
    const leaf = await open(filename, flags, mode);
    journal.leaves.add(leaf);
    return leaf;
  });
}
async function useLeaf<T>(
  journal: Journal,
  leaf: FileHandle,
  action: () => Promise<T>,
): Promise<T> {
  let outcome: { readonly ok: true; readonly value: T } | { readonly ok: false };
  try {
    outcome = { ok: true, value: await action() };
  } catch (cause) {
    retainFailure(journal, cause);
    outcome = { ok: false };
  }
  const before = journal.cleanup.length;
  await closeDescriptor(journal, leaf);
  if (!outcome.ok || journal.cleanup.length !== before) throw journalFailure(journal);
  return outcome.value;
}
async function joinDirectory(journal: Journal): Promise<void> {
  const parentIdentity = await bounded(journal, () => journal.parent.stat({ bigint: true }));
  const directoryIdentity = await bounded(journal, () => journal.directory.stat({ bigint: true }));
  assertDirectory(parentIdentity, journal);
  assertDirectory(directoryIdentity, journal);
  if (journal.parentIdentity === undefined || journal.directoryIdentity === undefined)
    reject('directory snapshots absent');
  sameIdentity(parentIdentity, journal.parentIdentity, false);
  sameIdentity(directoryIdentity, journal.directoryIdentity, false);
  const named = await openLeaf(
    journal,
    path(journal.parent, `source-stageb-${journal.nonce}`),
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  await useLeaf(journal, named, async () => {
    if (journal.directoryIdentity === undefined) reject('directory snapshot absent'); // Proof: named-directory omission returned dispatch after replacing the nonce child under the retained parent.
    sameIdentity(
      await bounded(journal, () => named.stat({ bigint: true })),
      journal.directoryIdentity,
      false,
    );
  });
}
async function assertRoster(journal: Journal): Promise<void> {
  const names = await bounded(journal, () => readdir(path(journal.directory)));
  const expected = journal.entries.map((entry) => entry.name).sort();
  names.sort();
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index]))
    reject('entry roster changed');
}
async function readEntry(journal: Journal, entry: Entry): Promise<void> {
  const filename = path(journal.directory, entry.name);
  const namedBefore = await bounded(journal, () => lstat(filename, { bigint: true }));
  sameIdentity(namedBefore, entry.identity, true);
  const reader = await openLeaf(
    journal,
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  await useLeaf(journal, reader, async () => {
    sameIdentity(await bounded(journal, () => reader.stat({ bigint: true })), entry.identity, true);
    const bytes = Buffer.alloc(entry.bytes.length + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await bounded(journal, () =>
        reader.read(bytes, offset, bytes.length - offset, offset),
      );
      if (read.bytesRead === 0) break;
      offset += read.bytesRead;
    }
    sameIdentity(await bounded(journal, () => reader.stat({ bigint: true })), entry.identity, true);
    sameIdentity(
      await bounded(journal, () => lstat(filename, { bigint: true })),
      entry.identity,
      true,
    );
    // Proof: exact-bytes omission returned dispatch when the owned read dependency corrupted same-length bytes.
    if (offset !== entry.bytes.length || !bytes.subarray(0, offset).equals(entry.bytes))
      reject('exact bytes changed');
    new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset));
  });
}
async function verifyJournal(journal: Journal): Promise<void> {
  await joinDirectory(journal);
  await assertRoster(journal);
  for (const entry of journal.entries) await readEntry(journal, entry);
  await joinDirectory(journal);
  await assertRoster(journal);
}
async function publish(journal: Journal, payload: Json): Promise<number> {
  await verifyJournal(journal);
  const sequence = journal.entries.length;
  const preceding = journal.entries.at(-1);
  const record: Json = {
    nonce: journal.nonce,
    sequence,
    precedingSha256: preceding === undefined ? null : digest(preceding.bytes),
    payload,
  };
  const serialized = `${JSON.stringify(record)}\n`;
  // Proof: consumer-record-count and consumer-cumulative call omissions admitted a new immutable entry past privately reduced caps.
  const reservation = reserveSourceJournalRecord(
    journal.entries.length,
    journal.charged,
    Buffer.byteLength(serialized, 'utf8'),
  );
  journal.charged = reservation.chargedBytes;
  const bytes = Buffer.from(serialized, 'utf8');
  const name = `${String(sequence).padStart(8, '0')}.${sequence === 0 ? 'claim' : 'event'}.json`;
  // Proof: exclusive-create omission let both barrier-synchronized real-filesystem constructors return original journals.
  const writer = await openLeaf(
    journal,
    path(journal.directory, name),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  const identity = await useLeaf(journal, writer, async () => {
    await bounded(journal, () => writer.writeFile(bytes));
    // Proof: file-sync omission enabled the inert effect without entering its gated file-sync witness.
    await bounded(journal, () => writer.sync());
    const written = await bounded(journal, () => writer.stat({ bigint: true }));
    if (
      !written.isFile() ||
      (written.mode & 0o7777n) !== 0o600n ||
      written.uid !== BigInt(journal.uid) ||
      written.gid !== BigInt(journal.gid) ||
      written.nlink !== 1n ||
      written.size !== BigInt(bytes.length)
    )
      reject('record metadata refused');
    return written;
  });
  // Proof: directory-sync omission enabled the inert effect without entering its gated directory-sync witness.
  await bounded(journal, () => journal.directory.sync());
  const entry: Entry = { name, bytes, identity, record };
  journal.entries.push(entry);
  await verifyJournal(journal);
  return sequence;
}
function getJournal(token: SourceJournal): Journal {
  const journal = journals.get(token);
  if (journal === undefined) reject('foreign journal');
  return journal;
}
// Proof: original-token fallback admitted a spread intent; dispatch-one-shot omission admitted replay, each returning dispatch.
function getIntent(journal: Journal, token: SourceIntent): Intent {
  const intent = intents.get(token);
  if (intent?.journal !== journal || intent.status !== 'unused')
    reject('foreign or settled intent');
  return intent;
}
function getDispatch(journal: Journal, token: SourceDispatch): Dispatch {
  const dispatch = dispatches.get(token);
  if (dispatch?.journal !== journal || dispatch.settled) reject('foreign or settled dispatch');
  return dispatch;
}
function getResource(journal: Journal, token: unknown): Resource {
  if (typeof token !== 'object' || token === null) reject('foreign resource');
  // Boundary: WeakMap lookup grants authority only to the original token; no visible fields are trusted.
  const resource = resources.get(token as RecordedResource);
  if (resource?.journal !== journal || resource.status !== 'recorded')
    reject('foreign or absent resource');
  return resource;
}
async function perform<T>(journal: Journal, action: () => Promise<T>): Promise<T> {
  if (journal.busy) reject('overlap refused');
  journal.busy = true;
  let finish: (() => void) | undefined;
  journal.active = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const remaining = journal.deadline - performance.now();
  // Proof: deadline-primary omission lost the original timeout when caller close happened during held acquisition.
  const timer =
    Number.isFinite(remaining) && remaining > 0 && remaining <= 600000
      ? setTimeout(() => {
          retainFailure(journal, new Error('source journal deadline exceeded'));
        }, remaining)
      : undefined;
  let outcome: { readonly ok: true; readonly value: T } | { readonly ok: false };
  try {
    const value = await action();
    // Proof: final-fulfillment omission returned dispatch and enabled the inert effect after caller close in final readback.
    assertLive(journal);
    outcome = { ok: true, value };
  } catch (cause) {
    retainFailure(journal, cause);
    outcome = { ok: false };
  } finally {
    clearTimeout(timer);
    journal.busy = false;
    if (finish === undefined) reject('operation settlement absent');
    finish();
  }
  if (!outcome.ok) {
    await closeLifetime(journal);
    throw journalFailure(journal);
  }
  return outcome.value;
}
async function run<T>(journal: Journal, action: () => Promise<T>): Promise<T> {
  assertLive(journal);
  return perform(journal, action);
}
function requireAppend(journal: Journal): void {
  assertLive(journal);
  if (journal.phase === 'sealed') reject('sealed');
  if (journal.busy) reject('overlap refused');
}
async function settle(journal: Journal): Promise<void> {
  // Proof: pending-work-join omission returned close while the independently gated owned acquisition was still pending.
  await journal.active;
  // Proof: late-leaf-cleanup omission returned failure/close with the late acquired owned descriptor still open.
  for (const leaf of [...journal.leaves]) await closeDescriptor(journal, leaf);
  await Promise.all([
    closeDescriptor(journal, journal.parent),
    closeDescriptor(journal, journal.directory),
  ]);
  if (journal.failure !== undefined || journal.cleanup.length > 0) throw journalFailure(journal);
}
function closeLifetime(journal: Journal): Promise<void> {
  journal.closing ??= settle(journal);
  return journal.closing;
}
/**
 * Private experimental control ledger. Transfers both descriptors immediately, even on refusal.
 * Claims are unverified; one-parent exclusive claim publication is not global replay prevention.
 * No native resource operations, authenticated input or measured/cleanup-proved result exist here.
 */
export async function createSourceJournal(request: {
  readonly parent: FileHandle;
  readonly directory: FileHandle;
  readonly claim: unknown;
  readonly deadline: number;
}): Promise<SourceJournal> {
  const entered = performance.now();
  const { parent, directory, deadline } = request;
  const journal: Journal = {
    parent,
    directory,
    nonce: '',
    deadline,
    uid: -1,
    gid: -1,
    entries: [],
    intents: new Set(),
    resources: [],
    phase: 'open',
    busy: false,
    charged: 0,
    reserved: 0,
    leaves: new Set(),
    closedDescriptors: new WeakSet(),
    cleanup: [],
  };
  return perform(journal, async () => {
    const checked = fields(request, ['parent', 'directory', 'claim', 'deadline']);
    const claim = parseClaim(checked['claim']);
    const now = performance.now();
    if (!Number.isFinite(deadline) || deadline <= now || deadline > entered + 600000)
      reject('deadline refused');
    if (
      process.platform !== 'linux' ||
      typeof process.geteuid !== 'function' ||
      typeof process.getegid !== 'function'
    )
      reject('platform refused');
    const uid = integer(process.geteuid());
    const gid = integer(process.getegid());
    if (parent === directory || parent.fd === directory.fd) reject('descriptor alias');
    journal.nonce = claim.nonce;
    journal.uid = uid;
    journal.gid = gid;
    journal.parentIdentity = await bounded(journal, () => parent.stat({ bigint: true }));
    journal.directoryIdentity = await bounded(journal, () => directory.stat({ bigint: true }));
    if (
      journal.parentIdentity.dev === journal.directoryIdentity.dev &&
      journal.parentIdentity.ino === journal.directoryIdentity.ino
    )
      reject('directory alias');
    await publish(journal, { kind: 'claim', claim: claim.projection });
    const token: SourceJournal = Object.freeze({ [journalBrand]: true as const });
    journals.set(token, journal);
    return token;
  });
}
/** Persists an intention before minting its original unused control token. */
export async function appendSourceIntent(
  token: SourceJournal,
  request: unknown,
): Promise<SourceIntent> {
  const journal = getJournal(token);
  requireAppend(journal);
  if (typeof request !== 'object' || request === null || !('operation' in request))
    reject('request refused');
  const operation = member(request.operation, operations);
  let resource: Resource | undefined;
  let resourceClass: ResourceClass | undefined;
  let purpose: string | undefined;
  if (operation === 'create') {
    const checked = fields(request, ['operation', 'resourceClass', 'purpose']);
    resourceClass = member(checked['resourceClass'], classes);
    purpose = member(checked['purpose'], purposes);
  } else {
    const checked = fields(request, ['operation', 'resource']);
    resource = getResource(journal, checked['resource']);
    for (const pending of journal.intents)
      if (pending.resource === resource) reject('resource already outstanding');
  }
  if (
    journal.phase === 'cleanup-only' &&
    (operation === 'create' || !['capture', 'stop-join', 'remove', 'finalize'].includes(operation))
  )
    reject('cleanup-only operation refused');
  if (journal.intents.size >= 32) reject('outstanding bound');
  let pendingCreations = 0;
  for (const pending of journal.intents) if (pending.operation === 'create') pendingCreations++;
  // Proof: consumer-resource call omission and consumer-pending operand omission returned an extra original intention at private cap two.
  if (operation === 'create')
    reserveSourceJournalCreation(journal.resources.length, pendingCreations);
  const ordinal = resource === undefined ? ++journal.reserved : resource.ordinal;
  const payload: Json =
    operation === 'create'
      ? {
          kind: 'intent',
          operation,
          resourceOrdinal: ordinal,
          resourceClass: resourceClass ?? reject('class absent'),
          purpose: purpose ?? reject('purpose absent'),
        }
      : { kind: 'intent', operation, resourceOrdinal: ordinal };
  return run(journal, async () => {
    const sequence = await publish(journal, payload);
    const intent: Intent = {
      journal,
      sequence,
      operation,
      ordinal,
      resourceClass,
      resource,
      status: 'unused',
    };
    const original: SourceIntent = Object.freeze({ [intentBrand]: true as const });
    intents.set(original, intent);
    journal.intents.add(intent);
    return original;
  });
}
/** Dispatch is durable intention only. The caller may begin its independently authorized effect after fulfillment. */
export async function dispatchSourceIntent(
  token: SourceJournal,
  supplied: SourceIntent,
): Promise<SourceDispatch> {
  const journal = getJournal(token);
  requireAppend(journal);
  const intent = getIntent(journal, supplied);
  if (
    journal.phase === 'cleanup-only' &&
    !['capture', 'stop-join', 'remove', 'finalize'].includes(intent.operation)
  )
    reject('cleanup-only dispatch refused');
  intent.status = 'dispatched';
  return run(journal, async () => {
    await publish(journal, { kind: 'dispatch', intentSequence: intent.sequence });
    const original: SourceDispatch = Object.freeze({ [dispatchBrand]: true as const });
    dispatches.set(original, { journal, intent, settled: false });
    return original;
  });
}
/** Abandonment is reserved for intentions that never dispatched. */
export async function abandonSourceIntent(
  token: SourceJournal,
  supplied: SourceIntent,
): Promise<void> {
  const journal = getJournal(token);
  requireAppend(journal);
  const intent = getIntent(journal, supplied);
  intent.status = 'settled';
  return run(journal, async () => {
    await publish(journal, { kind: 'abandoned', intentSequence: intent.sequence });
    journal.intents.delete(intent);
  });
}
/** Records supplied independent evidence, without establishing that a native observation happened. */
export async function recordSourceObservation(
  token: SourceJournal,
  supplied: SourceDispatch,
  observation: unknown,
): Promise<RecordedResource | undefined> {
  const journal = getJournal(token);
  requireAppend(journal);
  const dispatch = getDispatch(journal, supplied);
  const intent = dispatch.intent;
  const checked = fields(
    observation,
    intent.operation === 'create' ? ['identity', 'observationSha256'] : ['observationSha256'],
  );
  const observationSha256 = text(checked['observationSha256'], digestPattern);
  let identity: Identity | undefined;
  if (intent.operation === 'create') {
    identity = parseIdentity(checked['identity']);
    // Proof: class-join omission minted a foreign-class reference; identity-uniqueness omission minted a duplicate live reference.
    if (identity.kind !== intent.resourceClass) reject('identity class mismatch');
    if (
      journal.resources.some(
        (resource) => resource.status === 'recorded' && resource.identity.key === identity?.key,
      )
    )
      reject('duplicate identity');
  }
  dispatch.settled = true;
  return run(journal, async () => {
    await publish(
      journal,
      identity === undefined
        ? { kind: 'observed', intentSequence: intent.sequence, observationSha256 }
        : {
            kind: 'observed',
            intentSequence: intent.sequence,
            observationSha256,
            identity: identity.fields,
          },
    );
    intent.status = 'settled';
    journal.intents.delete(intent);
    if (intent.operation === 'create') {
      if (identity === undefined) reject('creation identity absent');
      const original: RecordedResource = Object.freeze({ [resourceBrand]: true as const });
      const resource: Resource = {
        journal,
        ordinal: intent.ordinal,
        identity,
        token: original,
        status: 'recorded',
      };
      resources.set(original, resource);
      journal.resources.push(resource);
      return original;
    }
    if (intent.operation === 'remove') {
      if (intent.resource === undefined) reject('removal resource absent');
      intent.resource.status = 'absence-recorded';
    }
    return undefined;
  });
}
/** Uncertainty grants no new identity or cleanup membership and restricts future intentions. */
export async function recordSourceUncertainty(
  token: SourceJournal,
  supplied: SourceDispatch,
  reason: unknown,
): Promise<undefined> {
  const journal = getJournal(token);
  requireAppend(journal);
  const dispatch = getDispatch(journal, supplied);
  const checked = member(reason, [
    'operation-failed',
    'response-unavailable',
    'readback-failed',
    'deadline-exceeded',
    'interrupted',
  ]);
  dispatch.settled = true;
  return run(journal, async () => {
    await publish(journal, {
      kind: 'uncertain',
      intentSequence: dispatch.intent.sequence,
      reason: checked,
    });
    // Proof: observed-only fault inserted a reference on uncertain create; the empty membership oracle failed.
    dispatch.intent.status = 'settled';
    journal.intents.delete(dispatch.intent);
    journal.phase = 'cleanup-only';
    return undefined;
  });
}
export interface SourceJournalSnapshot {
  readonly evidence: 'private-control';
  readonly phase: Phase;
  readonly records: readonly Json[];
  readonly resources: readonly {
    readonly reference: RecordedResource;
    readonly ordinal: number;
    readonly status: 'recorded' | 'absence-recorded';
    readonly identity: Readonly<Record<string, string | number>>;
  }[];
}
function freezeJson(value: Json): Json {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}
/** Fresh exact continuity verification; detached projections retain original in-memory reference tokens only. */
export async function inspectSourceJournal(token: SourceJournal): Promise<SourceJournalSnapshot> {
  const journal = getJournal(token);
  return run(journal, async () => {
    await verifyJournal(journal);
    return Object.freeze({
      evidence: 'private-control',
      phase: journal.phase,
      records: Object.freeze(
        journal.entries.map((entry) => freezeJson(structuredClone(entry.record))),
      ),
      resources: Object.freeze(
        journal.resources.map((resource) =>
          Object.freeze({
            reference: resource.token,
            ordinal: resource.ordinal,
            status: resource.status,
            identity: resource.identity.fields,
          }),
        ),
      ),
    });
  });
}
export interface SourceJournalSeal {
  readonly evidence: 'private-control';
  readonly count: number;
  readonly totalBytes: number;
  readonly sha256: string;
  readonly entries: readonly {
    readonly name: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
}
/** Final control evidence can include uncertainty or remaining resources; it never proves cleanup or measurement. */
export async function sealSourceJournal(token: SourceJournal): Promise<SourceJournalSeal> {
  const journal = getJournal(token);
  requireAppend(journal);
  if (journal.intents.size !== 0) reject('outstanding intentions');
  return run(journal, async () => {
    const count = journal.entries.length;
    const totalBytes = journal.charged;
    const sha256 = digest(
      Buffer.concat(
        journal.entries.map((entry) => entry.bytes),
        totalBytes,
      ),
    );
    await publish(journal, { kind: 'seal', count, totalBytes, sha256 });
    journal.phase = 'sealed';
    return Object.freeze({
      evidence: 'private-control',
      count: journal.entries.length,
      totalBytes: journal.charged,
      sha256,
      entries: Object.freeze(
        journal.entries.map((entry) =>
          Object.freeze({
            name: entry.name,
            bytes: entry.bytes.length,
            sha256: digest(entry.bytes),
          }),
        ),
      ),
    });
  });
}
/**
 * Invalidates synchronously; repeats join the same complete owned-IO/descriptor settlement.
 * The original deadline forbids success; noncancellable IO can leave settlement pending beyond it.
 * Proof: close-settlement omission left the original owned parent descriptor open; the test closed its own leak.
 */
export function closeSourceJournal(token: SourceJournal): Promise<void> {
  const journal = getJournal(token);
  if (journal.closing !== undefined) return journal.closing;
  journal.phase = 'closed';
  return closeLifetime(journal);
}
