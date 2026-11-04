import { constants } from 'node:fs';
import {
  type FileHandle,
  lstat,
  open,
  opendir,
  realpath,
  rename,
  statfs,
  unlink,
} from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { type } from 'arktype';
import { dlopen } from 'bun:ffi';

import { accountFilesystem, type FilesystemCounters } from './registry-capacity';
import { readTrustedEnrollment } from './registry-enrollment';
import { readRegistryJournalSnapshot } from './registry-journal';
import {
  draftRegistryPressureAlert,
  hashRegistryAlert,
  type RegistryAlertDraft,
  RegistryAlertEvent,
  RegistryAlertTime,
  renderRegistryAlert,
} from './registry-monitoring-events';
import { completeRegistryOperation } from './registry-operation-completion';
import type { RegistryPressureReport } from './registry-pressure-report';

const Path = type('0 < string <= 256').narrow(isAbsolute);
const Count = type('number.safe >= 0');
const Enrollment = type({
  schemaVersion: '1',
  enrollmentId: /^[a-f0-9-]{36}$/,
  registryId: '0 < string <= 256',
  storageId: '0 < string <= 256',
  directory: Path,
  device: Count,
  inode: Count,
  stateLockInode: Count,
  sendLockInode: Count,
  uid: Count,
  gid: Count,
  registryPath: Path,
  journalPath: Path,
  destinationId: '0 < string <= 128',
  protocol: "'slack-incoming-webhook'",
  credentialPath: "'/run/credentials/puni-registry-alert-send.service/webhook'",
  credentialSha256: /^[a-f0-9]{64}$/,
  '+': 'reject',
});
export type RegistryAlertEnrollment = typeof Enrollment.infer;
const Snapshot = type({
  schemaVersion: '1',
  enrollmentId: Enrollment.get('enrollmentId'),
  configSha256: /^[a-f0-9]{64}$/,
  counter: Count,
  pressure: {
    at: RegistryAlertTime.or('null'),
    condition: "'normal'|'warn'|'retire'|'fenced'",
    alerted: 'number.integer >= 0 & number.integer <= 7',
    '+': 'reject',
  },
  failureRevision: Count,
  failureIdentity: type(/^[a-f0-9]{64}$/).or('null'),
  destinationNotBefore: RegistryAlertTime.or('null'),
  launcherAt: RegistryAlertTime.or('null'),
  lastAttemptAt: RegistryAlertTime.or('null'),
  events: RegistryAlertEvent.array().atMostLength(32),
  '+': 'reject',
});
export type RegistryAlertSnapshot = typeof Snapshot.infer;
/** Internal ordinary-test seams model physical counters/exclusion and sync only; installed callers never load these from input. */
export interface RegistryAlertIO {
  filesystem?: () => Promise<FilesystemCounters & { type: bigint }>;
  excludedDevices?: () => Promise<number[]>;
  sync?: (file: FileHandle) => Promise<void>;
  close?: (file: FileHandle) => Promise<void>;
}
export interface RegistryAlertContext {
  enrollment: RegistryAlertEnrollment;
  io?: RegistryAlertIO;
}
export const registryAlertEnrollmentPath = '/etc/puni/registry-monitoring-source.json';
export const registryAlertSnapshotBytes = 256 * 1024;
const names = [
  'current.json',
  'pending.json',
  'fault.json',
  'fault.pending',
  'state.lock',
  'send.lock',
];

/** Explicit root-owned marker binds permanent lock and directory identities; runtime never initializes state. */
export async function readRegistryAlertContext(
  read: (path: string) => Promise<unknown> = readTrustedEnrollment,
): Promise<RegistryAlertContext> {
  // Proof: R5[root-enrollment-schema] the declared isolated fault defeated this boundary; observed by "fixed root enrollment boundary".
  const enrollment = Enrollment.assert(await read(registryAlertEnrollmentPath));
  // Proof: removing marker separation accepted the modeled root enrollment inside service-writable state.
  if (registryAlertEnrollmentPath.startsWith(`${enrollment.directory}/`))
    throw new Error('Alert enrollment aliases writable state');
  return { enrollment };
}
export function parseRegistryAlertEnrollment(input: unknown): RegistryAlertEnrollment {
  return Enrollment.assert(input);
}
/** Only explicit pre-enrollment may publish this initial snapshot; runtime loss never calls this constructor. */
export function initialRegistryAlertSnapshot(
  enrollment: RegistryAlertEnrollment,
): RegistryAlertSnapshot {
  return {
    schemaVersion: 1,
    enrollmentId: enrollment.enrollmentId,
    configSha256: hashRegistryAlert(JSON.stringify(enrollment)),
    counter: 0,
    pressure: { at: null, condition: 'normal', alerted: 0 },
    failureRevision: 0,
    failureIdentity: null,
    destinationNotBefore: null,
    launcherAt: null,
    lastAttemptAt: null,
    events: [],
  };
}
async function readFile(
  context: RegistryAlertContext,
  name: string,
  maximum: number,
): Promise<string> {
  const descriptor = await open(
    join(context.enrollment.directory, name),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  return completeRegistryOperation(
    async () => {
      const status = await descriptor.stat();
      // Proof: removing mode/link checks admitted the actual public and hardlinked current files; removing NOFOLLOW admitted a real symlink.
      if (
        !status.isFile() ||
        status.nlink !== 1 ||
        status.uid !== context.enrollment.uid ||
        status.gid !== context.enrollment.gid ||
        (status.mode & 0o777) !== 0o600
      )
        throw new Error('Untrusted alert file metadata');
      const bytes = new Uint8Array(maximum + 1);
      let length = 0;
      while (length < bytes.length) {
        const read = await descriptor.read(bytes, length, bytes.length - length, length);
        if (read.bytesRead === 0) break;
        length += read.bytesRead;
      }
      // Proof: removing this cap accepted a valid snapshot padded to256KiB+1 through the actual file reader.
      if (length > maximum) throw new Error('Alert file exceeds read bound');
      return new TextDecoder('utf8', { fatal: true }).decode(bytes.subarray(0, length));
    },
    () => closeRegistryAlertFile(context, descriptor),
  );
}
async function requireDirectory(context: RegistryAlertContext): Promise<void> {
  // Proof: R5[context-enrollment-schema] the declared isolated fault defeated this boundary; observed by "outbox context schema refuses".
  const enrolled = Enrollment.assert(context.enrollment);
  const status = await lstat(enrolled.directory);
  // Proof: removing the inode binding admitted the actual replacement directory with retained original files/locks.
  if (
    (await realpath(enrolled.directory)) !== enrolled.directory ||
    !status.isDirectory() ||
    status.dev !== enrolled.device ||
    status.ino !== enrolled.inode ||
    status.uid !== enrolled.uid ||
    status.gid !== enrolled.gid ||
    process.getuid?.() !== enrolled.uid ||
    process.getgid?.() !== enrolled.gid ||
    (status.mode & 0o777) !== 0o700
  )
    throw new Error('Untrusted alert directory identity');
  const counters = await (
    context.io?.filesystem ?? (() => statfs(enrolled.directory, { bigint: true }))
  )();
  const measured = accountFilesystem(counters);
  // Proof: independent modeled type, total-byte, inode and allocation-unit faults were accepted with their corresponding checks removed.
  if (
    counters.type !== 0xef53n ||
    counters.blocks * counters.bsize > 16n * 1024n * 1024n ||
    counters.files > 4096n ||
    counters.bsize > 65536n
  )
    throw new Error('Alert filesystem is not dedicated bounded ext4');
  const devices = await (
    context.io?.excludedDevices ??
    (async () =>
      Promise.all(
        ['/', enrolled.registryPath, enrolled.journalPath].map(
          async (path) => (await lstat(path)).dev,
        ),
      ))
  )();
  // Proof: removing exclusion admitted a modeled captured/root-device alias while reading real store files.
  if (devices.includes(status.dev))
    throw new Error('Alert filesystem aliases captured or root storage');
  const allocate = (length: number) =>
    Math.ceil(length / measured.allocationUnitBytes) * measured.allocationUnitBytes;
  // Proof: independent modeled free-byte and free-inode exhaustion admitted real store IO with each headroom check removed.
  if (
    measured.availableBytes <
      2 * allocate(registryAlertSnapshotBytes) + 2 * allocate(4096) + 65536 ||
    counters.ffree < 8n
  )
    throw new Error('Alert replacement and failure reserve unavailable');
}
async function requireEntries(context: RegistryAlertContext): Promise<void> {
  const present = new Set<string>();
  for await (const entry of await opendir(context.enrollment.directory)) {
    present.add(entry.name);
    // Proof: removing the inventory check accepted the actual surprise file beside a valid current snapshot.
    if (!names.includes(entry.name)) throw new Error('Unknown alert directory entry');
    // Proof: removing unresolved-replacement refusal admitted an actual pending file; post-rename sync failure leaves recovery evidence here.
    if (entry.name === 'pending.json' || entry.name === 'fault.pending')
      throw new Error('Unresolved alert replacement');
    if (entry.name === 'fault.json') {
      // Proof: R5[fault-schema] the declared isolated fault defeated this boundary; observed by "stored fault-schema contradiction".
      const fault = type({
        schemaVersion: '1',
        enrollmentId: Enrollment.get('enrollmentId'),
        state: "'full'",
        at: RegistryAlertTime,
        '+': 'reject',
      }).assert(JSON.parse(await readFile(context, 'fault.json', 4096)));
      // Proof: R5[fault-enrollment-binding] the declared isolated fault defeated this boundary; observed by "stored fault-binding contradiction".
      if (fault.enrollmentId !== context.enrollment.enrollmentId)
        throw new Error('Alert fault enrollment mismatch');
    }
  }
  // Proof: R5[permanent-lock-presence] the declared isolated fault defeated this boundary; observed by "durable integrity rejects missing-send-lock".
  if (!present.has('state.lock') || !present.has('send.lock'))
    throw new Error('Missing alert permanent lock');
}
async function withLock<T>(
  context: RegistryAlertContext,
  name: 'state.lock' | 'send.lock',
  run: () => Promise<T>,
): Promise<T> {
  await requireDirectory(context);
  const library = dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } });
  return completeRegistryOperation(
    async () => {
      const descriptor = await open(
        join(context.enrollment.directory, name),
        constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      return completeRegistryOperation(
        async () => {
          const status = await descriptor.stat();
          const inode =
            name === 'state.lock'
              ? context.enrollment.stateLockInode
              : context.enrollment.sendLockInode;
          // Proof: removing inode binding accepted a real replacement lock while the original inode stayed allocated during replacement.
          if (
            !status.isFile() ||
            status.ino !== inode ||
            status.nlink !== 1 ||
            status.size !== 0 ||
            status.uid !== context.enrollment.uid ||
            status.gid !== context.enrollment.gid ||
            (status.mode & 0o777) !== 0o600
          )
            throw new Error('Alert permanent lock identity mismatch');
          const deadline = Date.now() + 1000;
          // Proof: bypassing flock lost immediate busy refusal while the first owned HTTP request remained open.
          while (library.symbols.flock(descriptor.fd, 2 | 4) !== 0) {
            // Proof: R5[state-lock-wait-bound] omission missed the busy outcome while another real state lock remained held; observed by "state-lock contention has a bounded busy".
            if (name === 'send.lock' || Date.now() >= deadline)
              throw new Error('Alert store is busy');
            await Bun.sleep(5);
          }
          if (name === 'state.lock') await requireEntries(context);
          return await run();
        },
        () => closeRegistryAlertFile(context, descriptor),
      );
    },
    () => {
      library.close();
      return Promise.resolve();
    },
  );
}
/** Keep close failures alongside the original operation failure; internal tests model failed close acknowledgement after closing a real descriptor. */
export async function closeRegistryAlertFile(
  context: RegistryAlertContext,
  file: FileHandle,
): Promise<void> {
  // Proof: bypassing the modeled close-failure dependency lost the secondary cause after an actual malformed-state read; real descriptors were closed in the fault model.
  await (context.io?.close ?? ((descriptor: FileHandle) => descriptor.close()))(file);
}
async function sync(context: RegistryAlertContext, file: FileHandle) {
  // Proof: bypassing the injected sync dependency made the actual post-rename failure test succeed instead of retaining uncertainty.
  // Proof: R5-round2[sync-dependency] bypassing the modeled sync dependency lost the actual post-rename failure rejection; observed by "directory sync failure after rename".
  await (context.io?.sync ?? ((descriptor: FileHandle) => descriptor.sync()))(file);
}
/** Publish under fault.pending, then durably hand recovery evidence to the reused pending slot. All commit-critical syncs and publication closes precede the last marker unlink. Its removal needs no later sync: a crash may resurrect only a conservative refusal marker, never an uncommitted snapshot. */
async function replace(
  context: RegistryAlertContext,
  current: 'current.json' | 'fault.json',
  pending: 'pending.json' | 'fault.pending',
  serialized: string,
  maximum: number,
) {
  // Proof: R5[replacement-byte-bound] the declared isolated fault defeated this boundary; observed by "snapshot replacement byte cap".
  // Proof: R5-round2[replacement-byte-bound] removing the cap admitted an oversized published snapshot at the file-size assertion; observed by "snapshot replacement byte cap".
  if (Buffer.byteLength(serialized) > maximum) throw new Error('Alert replacement exceeds bound');
  const descriptor = await open(
    join(context.enrollment.directory, pending),
    // Proof: R5[pending-exclusive-publication] the declared isolated fault defeated this boundary; observed by "exclusive replacement cannot overwrite".
    // Proof: R5-round2[pending-exclusive-publication] removing exclusive creation changed the prior current snapshot after a colliding pending entry; observed by "exclusive replacement cannot overwrite".
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  let ownsPending = true,
    published = false,
    ownsMarker = false,
    hasAttemptedPublicationClose = false;
  const syncDirectory = async () => {
    const parent = await open(
      context.enrollment.directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    await completeRegistryOperation(
      () => sync(context, parent),
      () => closeRegistryAlertFile(context, parent),
    );
  };
  await completeRegistryOperation(
    async () => {
      // Proof: R5[initial-transaction-marker] omission left a readable snapshot after the modeled post-rename sync failure; observed by "directory sync failure after rename".
      // Proof: R5-round2[initial-transaction-marker] omitting the first marker let a fresh reader accept the uncertain post-rename snapshot; observed by "directory sync failure after rename".
      if (current === 'current.json') {
        const marker = await open(
          join(context.enrollment.directory, 'fault.pending'),
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
        ownsMarker = true;
        await completeRegistryOperation(
          async () => {
            await marker.writeFile('snapshot-replacement\n');
            // Proof: R5[initial-marker-sync] the declared isolated fault defeated this boundary; observed by "modeled marker sync failure preserves".
            // Proof: R5-round2[initial-marker-sync] omitting initial-marker sync lost the required phase rejection; observed by "modeled marker sync failure preserves".
            await sync(context, marker);
          },
          () => closeRegistryAlertFile(context, marker),
        );
        // Proof: R5[prepublication-directory-sync] the declared isolated fault defeated this boundary; observed by "modeled before-publish sync failure preserves".
        // Proof: R5-round2[prepublication-directory-sync] omitting the prepublication directory sync lost the required phase rejection; observed by "modeled before-publish sync failure preserves".
        await syncDirectory();
      }
      await descriptor.writeFile(serialized);
      // Proof: R5[snapshot-contents-sync] the declared isolated fault defeated this boundary; observed by "modeled contents sync failure preserves".
      // Proof: R5-round2[snapshot-contents-sync] omitting contents sync changed the snapshot instead of preserving its prior durable bytes; observed by "modeled contents sync failure preserves".
      await sync(context, descriptor);
      // Proof: R5-round2[atomic-snapshot-rename] skipping only counter2 rename rejected the required successful-publication promise before inventory inspection; observed by "successful finalization removes".
      await rename(
        join(context.enrollment.directory, pending),
        join(context.enrollment.directory, current),
      );
      ownsPending = false;
      published = true;
      await syncDirectory();
      if (ownsMarker) {
        // Proof: R5-round2[pre-existing-finalization-evidence] omitting only the counter2 second marker let a fresh reader accept state after final-sync failure plus actual marker-open EACCES; observed by "final sync plus marker creation refusal".
        const finalization = await open(
          join(context.enrollment.directory, pending),
          // Proof: R5-round2[final-marker-exclusive] removing exclusive creation overwrote an existing entry and let the required refusal fulfill; observed by "final marker creation existing-entry".
          // Proof: R5-round2[final-marker-write-dependency] a counter2 read-only marker descriptor made the successful-publication promise reject at the real write; observed by "successful finalization removes".
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
        await completeRegistryOperation(
          async () => {
            await finalization.writeFile('snapshot-finalization\n');
            // Proof: R5-round2[final-marker-sync] bypassing this sync lost the modeled final-marker-sync rejection; observed by "modeled final-marker-sync failure".
            await sync(context, finalization);
          },
          // Proof: R5-round2[final-marker-close] bypassing the modeled close acknowledgement while actually closing the descriptor lost the required phase rejection; observed by "modeled final-marker-close failure".
          () => closeRegistryAlertFile(context, finalization),
        );
        // Proof: R5-round2[final-marker-directory-sync] omitting this directory sync lost its phase-specific modeled rejection; observed by "modeled final-marker-directory-sync failure".
        await syncDirectory();
        // Proof: R5-round2[marker-removal] skipping only counter2 first-marker unlink retained fault.pending in the successful inventory assertion; observed by "successful finalization removes".
        await unlink(join(context.enrollment.directory, 'fault.pending'));
        ownsMarker = false;
        // Proof: R5-round2[final-directory-sync] omitting the final commit directory sync lost its required phase rejection while pending.json still blocked reuse; observed by "final directory sync after marker removal".
        await syncDirectory();
        // Proof: R5-round2[publication-close-before-last-marker] moving publication close after last-marker removal skipped the required phase failure; observed by "modeled publication-close failure".
        hasAttemptedPublicationClose = true;
        // Proof: R5-round2[publication-close] bypassing the modeled publication-close acknowledgement while actually closing the descriptor lost its phase rejection; observed by "modeled publication-close failure".
        await closeRegistryAlertFile(context, descriptor);
        // The snapshot and marker handoff are durable before this final cleanup. A marker resurrected by a crash causes conservative refusal.
        // Proof: R5-round2[last-marker-unlink] skipping only counter2 cleanup retained pending.json in the successful directory-inventory assertion; observed by "successful finalization removes".
        // Proof: R5-round2[no-critical-io-after-last-marker] adding a sync after counter2 last-marker removal rejected the required successful-publication promise; observed by "successful finalization removes".
        await unlink(join(context.enrollment.directory, pending));
      }
    },
    () =>
      completeRegistryOperation(
        async () => {
          // Proof: R5-round2[publication-close-once] retrying a modeled failed close acknowledgement added EBADF instead of preserving the sole original failure; observed by "modeled publication-close failure".
          if (!hasAttemptedPublicationClose) await closeRegistryAlertFile(context, descriptor);
        },
        async () => {
          if (ownsPending) await unlink(join(context.enrollment.directory, pending));
          if (ownsMarker && !published) {
            await unlink(join(context.enrollment.directory, 'fault.pending'));
            await syncDirectory();
          }
        },
      ),
  );
}

async function readSnapshot(context: RegistryAlertContext): Promise<RegistryAlertSnapshot> {
  // Proof: removing full parsing admitted schemaVersion2 in the actual current-file consumer.
  const snapshot = Snapshot.assert(
    JSON.parse(await readFile(context, 'current.json', registryAlertSnapshotBytes)),
  );
  // Proof: removing this binding accepted the same durable snapshot for a changed configured destination.
  if (
    snapshot.enrollmentId !== context.enrollment.enrollmentId ||
    snapshot.configSha256 !== hashRegistryAlert(JSON.stringify(context.enrollment))
  )
    throw new Error('Alert snapshot enrollment binding mismatch');
  // Proof: R5[failure-cursor-pair] the declared isolated fault defeated this boundary; observed by "stored failure-cursor-pair contradiction".
  if ((snapshot.failureRevision === 0) !== (snapshot.failureIdentity === null))
    throw new Error('Alert failure cursor identity mismatch');
  const identifiers = new Set<string>();
  for (const event of snapshot.events) {
    const counter = Number(event.id.slice(snapshot.enrollmentId.length + 1));
    // Proof: separate actual-file mutations admitted counter, payload-hash, pending-attempt, fence-reason and unavailable-owner contradictions when their relations were removed.
    if (
      !Number.isSafeInteger(counter) ||
      counter <= 0 ||
      counter > snapshot.counter ||
      identifiers.has(event.id) ||
      !event.id.startsWith(`${snapshot.enrollmentId}:`) ||
      Buffer.byteLength(JSON.stringify(event)) > 4096 ||
      event.payloadSha256 !== hashRegistryAlert(renderRegistryAlert(event)) ||
      event.owners.count !== event.owners.names.length + event.owners.omitted ||
      (event.attempts === 0 && event.firstAt !== null) ||
      (event.attempts > 0 && event.firstAt === null) ||
      (event.state !== 'pending' && event.attempts === 0) ||
      (event.state === 'pending' && event.attempts !== 0) ||
      (event.firstAt !== null &&
        (snapshot.lastAttemptAt === null ||
          Date.parse(event.firstAt) > Date.parse(snapshot.lastAttemptAt) ||
          Date.parse(event.firstAt) < Date.parse(event.at))) ||
      (event.nextAt !== null &&
        (event.firstAt === null || Date.parse(event.nextAt) < Date.parse(event.firstAt))) ||
      (event.fence.state === 'open' && event.fence.reason !== null) ||
      (event.fence.state === 'fenced' && event.fence.reason === null) ||
      (event.owners.scope === 'unavailable' && event.owners.count !== 0)
    )
      throw new Error('Alert event integrity mismatch');
    identifiers.add(event.id);
  }
  return snapshot;
}
async function persist(context: RegistryAlertContext, snapshot: RegistryAlertSnapshot) {
  // Proof: R5[output-snapshot-schema] omission published a negative counter from a broken internal projection; observed by "output schema rejects".
  Snapshot.assert(snapshot);
  await replace(
    context,
    'current.json',
    'pending.json',
    JSON.stringify(snapshot) + '\n',
    registryAlertSnapshotBytes,
  );
}
export async function readRegistryAlertSnapshot(context: RegistryAlertContext) {
  return withLock(context, 'state.lock', () => readSnapshot(context));
}
export async function changeRegistryAlerts<T>(
  context: RegistryAlertContext,
  change: (snapshot: RegistryAlertSnapshot) => Promise<T> | T,
): Promise<T> {
  return withLock(context, 'state.lock', async () => {
    const snapshot = await readSnapshot(context);
    const changed = await change(snapshot);
    await persist(context, snapshot);
    return changed;
  });
}
/** Admit one bounded event while the caller holds the state lock; the caller persists the validated transition before any delivery. */
export async function enqueueRegistryAlert(
  context: RegistryAlertContext,
  snapshot: RegistryAlertSnapshot,
  draft: RegistryAlertDraft,
) {
  snapshot.events = snapshot.events.filter((event) => event.state !== 'acknowledged');
  const critical = draft.kind !== 'warning';
  // Proof: allowing a32nd normal warning consumed the reserved critical slot and defeated the actual full-spool refusal assertion.
  if (snapshot.events.length >= (critical ? 32 : 31)) {
    await replace(
      context,
      'fault.json',
      'fault.pending',
      JSON.stringify({
        schemaVersion: 1,
        enrollmentId: snapshot.enrollmentId,
        state: 'full',
        at: draft.at,
      }) + '\n',
      4096,
    );
    throw new Error('Alert outbox is full; existing incidents preserved');
  }
  // Proof: R5[enqueue-counter-exhaustion] omission admitted an unsafe increment inside the held transaction before later schema validation; observed by "locked event counter admission".
  if (snapshot.counter >= Number.MAX_SAFE_INTEGER)
    throw new Error('Alert incident counter exhausted');
  snapshot.counter += 1;
  const event = {
    ...draft,
    id: `${snapshot.enrollmentId}:${String(snapshot.counter)}`,
    attempts: 0,
    firstAt: null,
    nextAt: null,
    state: 'pending' as const,
    payloadSha256: '',
  };
  event.payloadSha256 = hashRegistryAlert(renderRegistryAlert(event));
  // Proof: R5[enqueue-event-schema] omission admitted an unsupported kind inside the held transaction before later schema validation; observed by "locked event schema admission".
  // Proof: R5[enqueue-event-byte-bound] omission admitted an oversized slot inside the held transaction before later schema validation; observed by "locked event slot admission".
  if (Buffer.byteLength(JSON.stringify(RegistryAlertEvent.assert(event))) > 4096)
    throw new Error('Alert event exceeds slot bound');
  snapshot.events.push(event);
}
/** Durable pressure cursor survives acknowledged-slot reuse and process epoch changes. Only actual normal and unfenced recovery rearms an incident. */
export async function captureRegistryPressureAlert(
  context: RegistryAlertContext,
  report: RegistryPressureReport,
): Promise<void> {
  await changeRegistryAlerts(context, async (snapshot) => {
    if (
      report.registryId !== context.enrollment.registryId ||
      // Proof: R5[pressure-observation-identity] the declared isolated fault defeated this boundary; observed by "foreign pressure identity cannot advance".
      report.storageId !== context.enrollment.storageId ||
      report.registryPath !== context.enrollment.registryPath
    )
      throw new Error('Alert pressure identity mismatch');
    const at = RegistryAlertTime.assert(report.measurement.at);
    // Proof: removing the watermark replayed old warning bytes after recovery as a new unacknowledged event with another ID.
    if (snapshot.pressure.at !== null && Date.parse(at) <= Date.parse(snapshot.pressure.at)) return;
    const bit = { normal: 0, warn: 1, retire: 2, fenced: 4 }[report.pressure];
    // Proof: R5[normal-unfenced-recovery] retaining episode bits after actual explicit reopening prevented the new warning; observed by "cursor survives fresh epochs".
    // Proof: R5[fenced-normal-does-not-rearm] dropping the unfenced condition rearmed warning while the canonical fence remained; observed by "normal capacity while canonically fenced".
    const alerted = report.pressure === 'normal' && !report.fenced ? 0 : snapshot.pressure.alerted;
    if (bit !== 0 && (alerted & bit) === 0)
      await enqueueRegistryAlert(context, snapshot, draftRegistryPressureAlert(report));
    snapshot.pressure = { at, condition: report.pressure, alerted: alerted | bit };
  });
}
/** Canonical revision is a bounded replay cursor; capture runs before retries may clear the durable failure. */
export async function captureRegistryMaintenanceAlert(
  context: RegistryAlertContext,
  input: {
    revision: number;
    operationId: string;
    at: string;
    owners: string[];
  } & ({ kind: 'launcher' } | { kind: 'backup' | 'retirement'; identity: string }),
): Promise<void> {
  await changeRegistryAlerts(context, async (snapshot) => {
    // Proof: R5[failure-revision-range] the declared isolated fault defeated this boundary; observed by "invalid failure revision".
    if (!Number.isSafeInteger(input.revision) || input.revision < 0)
      throw new Error('Invalid alert failure revision');
    const at = RegistryAlertTime.assert(input.at);
    if (input.kind === 'launcher') {
      // Proof: R5[launcher-replay-time] the declared isolated fault defeated this boundary; observed by "launcher replay time".
      if (snapshot.launcherAt !== null && Date.parse(at) <= Date.parse(snapshot.launcherAt)) return;
    } else {
      // Proof: R5[stable-failure-attempt-identity] dropping stable identity caused another receiver post after an unrelated canonical revision; observed by "periodic sender recovers a killed producer".
      // Proof: R5[failure-revision-replay] dropping the revision bound replayed an older failure and replaced the cursor; observed by "below captured revision".
      if (input.identity === snapshot.failureIdentity || input.revision <= snapshot.failureRevision)
        return;
    }
    await enqueueRegistryAlert(context, snapshot, {
      registryId: context.enrollment.registryId,
      origin: hashRegistryAlert(input.operationId),
      kind:
        input.kind === 'backup'
          ? 'backup-failure'
          : input.kind === 'retirement'
            ? 'cleanup-failure'
            : 'launcher-failure',
      at: RegistryAlertTime.assert(input.at),
      fence: { state: 'unavailable', reason: 'canonical-fence-unavailable' },
      capacity: { state: 'unavailable', reason: 'fresh-measurement-unavailable' },
      owners:
        input.kind === 'launcher'
          ? { scope: 'unavailable', count: 0, names: [], omitted: 0 }
          : projectRegistryAlertOwners(input.owners),
      remedy:
        'Inspect the failed canonical operation; preserve protected owners and repair inventory or capacity before retry.',
    });
    if (input.kind === 'launcher') snapshot.launcherAt = at;
    else {
      snapshot.failureRevision = input.revision;
      snapshot.failureIdentity = input.identity;
    }
  });
}
/** Project explicit canonical obligations into bounded names and exact omission counts; this is not a physical owner census. */
export function projectRegistryAlertOwners(owners: string[]): RegistryAlertDraft['owners'] {
  const unique = [...new Set(owners)].sort(),
    selected: string[] = [];
  for (const owner of unique) {
    // Proof: R5[owner-name-count] omission projected nine or more names before any event-schema validation; observed by "owner count projection".
    if (selected.length === 8) break;
    // Proof: R5[owner-name-length] omission projected a129-character name before any event-schema validation; observed by "owner length projection".
    // Proof: R5[owner-name-byte-bound] omission projected names exceeding1024JSONbytes before event-schema validation; observed by "owner bytes projection".
    if (owner.length <= 128 && Buffer.byteLength(JSON.stringify([...selected, owner])) <= 1024)
      selected.push(owner);
  }
  return {
    scope: 'explicit-canonical-obligations',
    count: unique.length,
    names: selected,
    omitted: unique.length - selected.length,
  };
}
/** Read only the enrolled canonical snapshot. Stable operation-attempt identity deduplicates unrelated revisions; no maintenance effect is invoked. */
export async function reconcileRegistryMaintenanceAlert(
  context: RegistryAlertContext,
  directory = context.enrollment.journalPath,
): Promise<boolean> {
  // Proof: R5[canonical-directory-binding] the declared isolated fault defeated this boundary; observed by "canonical path binding".
  if (directory !== context.enrollment.journalPath)
    throw new Error('Alert canonical directory differs from enrollment');
  const current = await readRegistryJournalSnapshot(directory),
    enrolled = context.enrollment;
  if (
    current.enrollment.registryId !== enrolled.registryId ||
    // Proof: R5[canonical-store-binding] the declared isolated fault defeated this boundary; observed by "canonical source identity mismatch".
    current.enrollment.storageId !== enrolled.storageId ||
    current.enrollment.registryPath !== enrolled.registryPath
  )
    throw new Error('Alert canonical identity differs from enrollment');
  const operation = current.maintenance;
  // Proof: R5[canonical-failed-phase-selection] the declared isolated fault defeated this boundary; observed by "does not invent a failure for active".
  // Proof: R5[canonical-kind-selection] the declared isolated fault defeated this boundary; observed by "does not relabel a durable restore failure".
  if (operation?.phase !== 'failed' || operation.kind === 'restore') return false;
  const identity = hashRegistryAlert(
    JSON.stringify([
      current.enrollment.registryId,
      current.enrollment.storageId,
      current.enrollment.registryPath,
      operation.operationId,
      operation.kind,
      operation.token,
      operation.resumePhase,
    ]),
  );
  await captureRegistryMaintenanceAlert(context, {
    revision: current.revision,
    identity,
    kind: operation.kind,
    operationId: operation.operationId,
    at: current.updatedAt,
    owners: current.protections.map((protection) => protection.owner),
  });
  return true;
}
/** The send lock spans the request while the state lock is released for source capture. */
export function withRegistryAlertSender<T>(context: RegistryAlertContext, send: () => Promise<T>) {
  return withLock(context, 'send.lock', send);
}
