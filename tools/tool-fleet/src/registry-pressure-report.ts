import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  type FileHandle,
  lstat,
  open,
  opendir,
  readFile,
  realpath,
  rename,
  statfs,
  unlink,
} from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import { accountFilesystem, type FilesystemCounters } from './registry-capacity';
import {
  executeRegistryCommand,
  type RegistryJournal,
  type RegistryJournalPorts,
} from './registry-managed-journal';
import { completeRegistryOperation } from './registry-operation-completion';
import { admitPublication } from './registry-policy';
import { RegistryReclamationMeasurement } from './registry-reclamation';

export const registryPressureDirectory = '/run/puni-registry-pressure';
const maximumReportBytes = 16 * 1024;
const Identity = type({
  machineId: /^[a-f0-9]{32}$/,
  bootId: /^[a-f0-9]{8}-[a-f0-9-]{27}$/,
  '+': 'reject',
});
const Timestamp = type('string').narrow(
  (stamp) => Number.isFinite(Date.parse(stamp)) && new Date(stamp).toISOString() === stamp,
);
// Proof: bypassing this full schema accepted sequence 0 in the actual status corruption test.
const Report = type({
  schemaVersion: '1',
  machineId: Identity.get('machineId'),
  bootId: Identity.get('bootId'),
  epoch: /^[a-f0-9]{8}-[a-f0-9-]{27}$/,
  sequence: 'number.safe > 0',
  registryId: '0 < string <= 256',
  storageId: '0 < string <= 256',
  registryPath: '0 < string <= 256',
  journalSha256: /^[a-f0-9]{64}$/,
  measurement: RegistryReclamationMeasurement,
  emittedAt: Timestamp,
  pressure: "'normal'|'warn'|'retire'|'fenced'",
  fenced: 'boolean',
  reason: type('0 < string <= 256').or('null'),
  '+': 'reject',
  // Proof: lexical ordering accepted reversed expanded-year capture/emission in the actual-reader RED; supported numeric ordering must remain readable.
}).narrow((report) => Date.parse(report.measurement.at) <= Date.parse(report.emittedAt));
export type RegistryPressureReport = typeof Report.infer;
export type RegistryPressureIdentity = typeof Identity.infer;
export type RegistryPressureReportState =
  { state: 'never-reported' } | { state: 'reported'; report: RegistryPressureReport };

function parseReport(input: unknown): RegistryPressureReport {
  // Proof: schema bypass accepted a zero observation sequence instead of rejecting the installed report.
  const report = Report.assert(input);
  const pressure = admitPublication({
    capacity: report.measurement,
    reservations: [],
    envelope: { bytes: 0, inodes: 0 },
  }).pressure;
  // Proof: removing this relation admitted valid-schema pressure, fence/reason and unfenced-cutoff contradictions.
  if (
    report.pressure !== pressure ||
    report.fenced !== (report.reason !== null) ||
    (pressure === 'fenced' && !report.fenced)
  )
    throw new Error('Inconsistent pressure report');
  return report;
}

/** Trusted internal filesystem/sync seams for the same cache writer; never accepted from command requests. Ordinary tests model headroom and inject sync failure without native provisioning. */
interface RegistryPressureReportIO {
  filesystem?: () => Promise<FilesystemCounters>;
  sync?: (descriptor: FileHandle) => Promise<void>;
}

/** Hash validated semantic state using the authority serialization; disk whitespace is not an identity. */
export function hashRegistryPressureState(journal: RegistryJournal): string {
  return createHash('sha256').update(JSON.stringify(journal)).digest('hex');
}

async function requireReportDirectory(directory: string): Promise<string[]> {
  const status = await lstat(directory);
  // Proof: bypassing metadata refusal admitted the real mode 0755 cache in the directory-mode negative.
  if (
    (await realpath(directory)) !== directory ||
    !status.isDirectory() ||
    status.uid !== process.getuid?.() ||
    status.gid !== process.getgid?.() ||
    (status.mode & 0o777) !== 0o700
  )
    throw new Error('Untrusted pressure report directory');
  const entries: string[] = [];
  for await (const entry of await opendir(directory)) {
    // Proof: removing this refusal returned success beside an actual unknown entry; iteration stops before accumulating unknown names.
    if (entry.name !== 'report.json' && entry.name !== 'report.pending')
      throw new Error('Unknown pressure report entry');
    entries.push(entry.name);
  }
  // Proof: removing this guard returned never-reported for the actual unresolved pending-only directory.
  if (entries.includes('report.pending')) throw new Error('Unresolved pressure report.pending');
  return entries;
}

async function readReportFile(path: string): Promise<RegistryPressureReport> {
  // Proof: removing NOFOLLOW accepted the symlink to a complete valid outside report.
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const status = await descriptor.stat();
    // Proof: bypassing file metadata admitted actual public-mode and hardlinked valid reports; mode 000 separately produced EACCES.
    if (
      !status.isFile() ||
      status.uid !== process.getuid?.() ||
      status.gid !== process.getgid?.() ||
      status.nlink !== 1 ||
      (status.mode & 0o777) !== 0o600
    )
      throw new Error('Untrusted pressure report file');
    const bytes = new Uint8Array(maximumReportBytes + 1);
    let length = 0;
    while (length < bytes.byteLength) {
      const chunk = await descriptor.read(bytes, length, bytes.byteLength - length);
      if (chunk.bytesRead === 0) break;
      length += chunk.bytesRead;
    }
    // Proof: removing this byte guard accepted a valid report padded beyond 16 KiB, rather than merely changing a later JSON diagnostic.
    if (length > maximumReportBytes) throw new Error('Pressure report exceeds read bound');
    return parseReport(JSON.parse(new TextDecoder().decode(bytes.subarray(0, length))));
  } finally {
    await descriptor.close();
  }
}

/** Volatile local observation only. Validated empty runtime directory is never-reported; missing/unreadable/malformed installed state throws. */
export async function readRegistryPressureReport(
  directory: string,
): Promise<RegistryPressureReportState> {
  const entries = await requireReportDirectory(directory);
  if (!entries.includes('report.json')) return { state: 'never-reported' };
  return { state: 'reported', report: await readReportFile(join(directory, 'report.json')) };
}

/** Replace two fixed files at most. The complete v1 field/number/string schema bounds serialized output below 16 KiB, including six-byte JSON escaping; the reader also caps actual bytes. No history, outbox, destination receipt or reboot durability is implied. */
async function writeReport(
  directory: string,
  report: RegistryPressureReport,
  io: RegistryPressureReportIO,
): Promise<void> {
  const serialized = `${JSON.stringify(parseReport(report))}\n`;
  await readRegistryPressureReport(directory);
  const filesystem = accountFilesystem(
    await (io.filesystem ?? (() => statfs(directory, { bigint: true })))(),
  );
  const allocate = (bytes: number) =>
    Math.ceil(bytes / filesystem.allocationUnitBytes) * filesystem.allocationUnitBytes;
  // Proof: removing this check published report.json under separately modeled byte/inode exhaustion; negatives assert no file was created.
  if (
    filesystem.availableBytes < 2 * allocate(maximumReportBytes) + allocate(4096) ||
    filesystem.totalInodes - filesystem.usedInodes < 3
  )
    throw new Error('Pressure report replacement headroom unavailable');
  let descriptor: FileHandle | undefined;
  let ownsPending = false;
  await completeRegistryOperation(
    async () => {
      descriptor = await open(
        join(directory, 'report.pending'),
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      ownsPending = true;
      await descriptor.writeFile(serialized);
      // Proof: bypassing the injected sync dependency published success in the actual writer failure test.
      await (io.sync ?? ((file) => file.sync()))(descriptor);
      await rename(join(directory, 'report.pending'), join(directory, 'report.json'));
      ownsPending = false;
      const parent = await open(
        directory,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
    },
    () =>
      completeRegistryOperation(
        async () => {
          await descriptor?.close();
        },
        async () => {
          // Proof: omitting this unlink left the writer's actual pending file after injected sync failure; real rename/unlink EACCES retain both causes.
          if (ownsPending) await unlink(join(directory, 'report.pending'));
        },
      ),
  );
}

/** Installed reporting requires durable capture; ordinary local-only consumers choose that mode explicitly. */
export type RegistryPressureDelivery =
  | { state: 'local-only' }
  | { state: 'required'; capture: (report: RegistryPressureReport) => Promise<void> };

/** Capture only this real authority check's successful measurement. Reporting follows lock release and cannot change the command wire or grant permission. Every successful ten-second invocation publishes its own fresh observation. */
export function createRegistryPressureReporter(
  input: RegistryPressureIdentity,
  delivery: RegistryPressureDelivery,
  io: RegistryPressureReportIO = {},
) {
  const identity = Identity.assert(input);
  const epoch = randomUUID();
  let sequence = 0;
  return async (directory: string, ports: RegistryJournalPorts, reports: string) => {
    const observation: {
      measurement?: {
        at: string;
        capacity: Awaited<ReturnType<RegistryJournalPorts['measureRegistry']>>;
      };
    } = {};
    // Proof: substituting the valid stale canonical measurement emitted cached success and failed the fresh-report capacity assertion.
    const measure: RegistryJournalPorts['measureRegistry'] = async (enrollment) => {
      const capacity = await ports.measureRegistry(enrollment);
      observation.measurement = { at: (ports.now ?? (() => new Date().toISOString()))(), capacity };
      return capacity;
    };
    const observed = new Proxy(ports, {
      get: (target, key): unknown => {
        if (key === 'measureRegistry') return measure;
        const property: unknown = Reflect.get(target, key, target);
        return property;
      },
    });
    const response = await executeRegistryCommand(
      directory,
      { command: 'check-capacity' },
      observed,
    );
    const measured = observation.measurement;
    if (measured === undefined) throw new Error('Missing actual pressure observation');
    const { state } = response;
    const pressure = admitPublication({
      capacity: measured.capacity,
      reservations: [],
      envelope: { bytes: 0, inodes: 0 },
    }).pressure;
    sequence += 1;
    const report = parseReport({
      schemaVersion: 1,
      ...identity,
      epoch,
      sequence,
      registryId: state.enrollment.registryId,
      storageId: state.enrollment.storageId,
      registryPath: state.enrollment.registryPath,
      journalSha256: hashRegistryPressureState(state),
      measurement: { at: measured.at, journalRevision: state.revision, ...measured.capacity },
      emittedAt: (ports.now ?? (() => new Date().toISOString()))(),
      pressure,
      fenced: state.fenced,
      reason: state.fenceReason,
    });
    await captureRegistryPressureReport(delivery, report);
    await writeReport(reports, report, io);
    return response;
  };
}

/** Fixed local machine/boot identity. A different installed authority machine is an error, never a fresh report from the wrong host. */
export async function readRegistryPressureIdentity(
  expectedMachineId: string,
): Promise<RegistryPressureIdentity> {
  const identity = Identity.assert({
    machineId: (await readFile('/etc/machine-id', 'utf8')).trim(),
    bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
  });
  // Proof: removing this check admitted the actual local machine for a different expected installation identity.
  if (identity.machineId !== expectedMachineId)
    throw new Error('Pressure reporter machine differs from installation');
  return identity;
}

/** Compare measurement age and semantic canonical binding, never cache mtime, a new emission timestamp or journal revision alone. Stale historical values stay visibly stale. */
export function projectRegistryPressure(
  journal: RegistryJournal,
  observation: RegistryPressureReportState,
  input: RegistryPressureIdentity,
  now: string,
) {
  const identity = Identity.assert(input);
  // Proof: bypassing timestamp validation accepted an invalid status clock as fresh instead of refusing it.
  const stamp = Timestamp.assert(now);
  if (observation.state === 'never-reported') return observation;
  const report = observation.report;
  // Proof: removing the future-time guard accepted a future emission as fresh in the actual status consumer.
  // Proof: expanded-year future pairs and emission-only reports first pass the actual reader; lexical future comparison then accepted them instead of rejecting status.
  const currentAt = Date.parse(stamp);
  const measuredAt = Date.parse(report.measurement.at);
  const emittedAt = Date.parse(report.emittedAt);
  if (emittedAt > currentAt || measuredAt > currentAt)
    throw new Error('Pressure observation is from the future');
  const ageSeconds = (currentAt - measuredAt) / 1000;
  // Proof: replacing this binding with true admitted foreign machine/store/registry/path/revision/hash/fence reports as fresh.
  const bound =
    report.machineId === identity.machineId &&
    report.registryId === journal.enrollment.registryId &&
    report.storageId === journal.enrollment.storageId &&
    report.registryPath === journal.enrollment.registryPath &&
    report.measurement.journalRevision === journal.revision &&
    report.journalSha256 === hashRegistryPressureState(journal) &&
    report.fenced === journal.fenced &&
    report.reason === journal.fenceReason;
  if (!bound) return { state: 'binding-mismatch' as const, report, ageSeconds };
  // Proof: bypassing this check accepted old-boot and 301-second measurements; touching cache mtime does not renew age.
  if (report.bootId !== identity.bootId || ageSeconds > 60)
    return { state: 'stale' as const, report, ageSeconds };
  return { state: 'fresh' as const, report, ageSeconds };
}

/** Required delivery captures before the volatile cache; local-only is explicit for non-delivery consumers. */
async function captureRegistryPressureReport(
  delivery: RegistryPressureDelivery,
  report: RegistryPressureReport,
): Promise<void> {
  // Proof: omitting capture resolved the actual reporter call despite its failing durable sink.
  if (delivery.state === 'required') await delivery.capture(report);
}
