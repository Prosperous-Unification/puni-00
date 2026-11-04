import { createHash } from 'node:crypto';
import { isAbsolute, normalize, relative } from 'node:path';

import { type } from 'arktype';

import { RegistryBackupReceipt } from './registry-maintenance-state';

/** Complete snapshot-prefix version observation, including invisible history and current delete markers. */
export type RegistryBackupSnapshotVersion = {
  snapshotId: string;
  versionId: string;
  visible: boolean;
} & ({ kind: 'object'; bytes: number } | { kind: 'delete-marker' });

/**
 * Caller derives rows from a complete held-authority provider census and refuses unfinished
 * snapshot uploads. The observer must honor the shared signal and await its resource cleanup;
 * the deadline initiates cancellation rather than promising an unconditional hard return time.
 */
export type RegistryBackupSnapshotObserver = (
  signal: AbortSignal,
) => Promise<readonly RegistryBackupSnapshotVersion[]>;

export interface RegistryBackupRetentionInput {
  registryId: string;
  journalPath: string;
  sampledAt: string;
  lastVerified: RegistryBackupReceipt | null;
  recoveryPins: readonly string[];
  observeSnapshotVersions: RegistryBackupSnapshotObserver;
}

export type RegistryBackupRetentionReason =
  'daily' | 'weekly' | 'last-verified' | 'recovery-pin' | 'incomplete-coverage';

export interface RegistryBackupRetentionPlan {
  registryId: string;
  repositoryId: string;
  sampledAt: string;
  snapshotVersionsSha256: string;
  catalogue: { snapshotId: string; time: string; registryPath: string; journalPath: string }[];
  retained: { snapshotId: string; reasons: RegistryBackupRetentionReason[] }[];
  eligibleSnapshotIds: string[];
  coverage: {
    complete: boolean;
    daily: { required: 7; observed: number; buckets: string[] };
    weekly: { required: 4; observed: number; buckets: string[] };
  };
}

const Hash = type(/^[a-f0-9]{64}$/);
const Identity = type('0 < string <= 256');
const Version = type({
  snapshotId: Hash,
  versionId: '0 < string <= 1024',
  visible: 'boolean',
  kind: "'object'",
  bytes: 'number.safe >= 0',
  '+': 'reject',
}).or({
  snapshotId: Hash,
  versionId: '0 < string <= 1024',
  visible: 'boolean',
  kind: "'delete-marker'",
  '+': 'reject',
});
const Input = type({
  registryId: Identity,
  journalPath: Identity,
  sampledAt: '0 < string <= 40',
  lastVerified: RegistryBackupReceipt.or('null'),
  recoveryPins: Hash.array().atMostLength(2048),
  observeSnapshotVersions: 'Function',
  '+': 'reject',
});
const Snapshot = type({
  id: Hash,
  time: '0 < string <= 40',
  hostname: Identity,
  paths: Identity.array().exactlyLength(2),
  tags: type('0 < string <= 270').array().atLeastLength(1).atMostLength(32),
  summary: { total_bytes_processed: 'number.safe > 0' },
});

/** Strict RFC3339 instants retain all nine fractional digits; date rollover, absent zones and leap seconds refuse. */
export function parseRegistryBackupTime(stamp: string): {
  nanoseconds: bigint;
  day: string;
  week: string;
} {
  // Proof: a permissive Date.parse dependency admitted rollover and absent offsets in the production catalogue negatives.
  const parts =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(stamp);
  if (parts === null) throw new Error('Malformed backup RFC3339 timestamp');
  const date = parts[1];
  const hour = parts[2];
  const minute = parts[3];
  const second = parts[4];
  const fraction = parts.at(5);
  const zone = parts[6];
  const milliseconds = Date.parse(`${date}T${hour}:${minute}:${second}.000Z`);
  // Proof: removing calendar equality admitted February 29 in the invalid-leap-day production consumer.
  if (
    !Number.isSafeInteger(milliseconds) ||
    new Date(milliseconds).toISOString() !== `${date}T${hour}:${minute}:${second}.000Z` ||
    (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))
  )
    throw new Error('Invalid backup calendar timestamp');
  const offset =
    zone === 'Z'
      ? 0
      : (zone.startsWith('+') ? 1 : -1) *
        (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4))) *
        60000;
  const utc = milliseconds - offset;
  // Proof: the pinned-restic year-zero consumer needs complete signed UTC dates across the year boundary.
  const day = new Date(utc).toISOString().split('T')[0];
  const monday = new Date(utc);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return {
    // Proof: replacing fractional nanoseconds with zero reversed the Sunday newest order in the offset/year-boundary consumer.
    nanoseconds: BigInt(utc) * 1000000n + BigInt((fraction ?? '').padEnd(9, '0')),
    day,
    week: monday.toISOString().split('T')[0],
  };
}

/** Revalidates mandatory protection fields before any subprocess or provider observation. */
export function requireRegistryBackupRetentionInput(
  input: RegistryBackupRetentionInput,
): RegistryBackupRetentionInput {
  // Proof: removing boundary validation invoked external observation for missing lastVerified/pins in mandatory-validation tests.
  Input.assert(input);
  // Proof: the future-sample-time production consumer returned a plan for year 9999 before this check.
  if (parseRegistryBackupTime(input.sampledAt).nanoseconds > BigInt(Date.now()) * 1000000n)
    throw new Error('Retention sample time is in the future');
  if (
    !isAbsolute(input.journalPath) ||
    normalize(input.journalPath) !== input.journalPath ||
    input.journalPath === '/' ||
    // Proof: removing pin uniqueness accepted duplicate durable recovery pins in the mandatory-input consumer.
    new Set(input.recoveryPins).size !== input.recoveryPins.length
  )
    throw new Error('Ambiguous retention journal path or duplicate recovery pin');
  return {
    ...input,
    // Proof: removing this copy let the observation callback drop a recovery-pin reason in the census-bookends consumer.
    recoveryPins: [...input.recoveryPins],
    lastVerified: input.lastVerified === null ? null : { ...input.lastVerified },
  };
}

/** Bounded complete physical metadata bookend; hidden records remain in its canonical hash. */
export function observeRegistryBackupSnapshotVersions(input: unknown): {
  sha256: string;
  visibleSnapshotIds: Set<string>;
} {
  // Proof: coherent full-census malformed-field and 8,193-row hidden-history faults were accepted with these schema/count checks removed.
  const versions = Version.array().atMostLength(8192).assert(input);
  const identities = new Set<string>();
  const visible = new Set<string>();
  const represented = new Set<string>();
  const visibleSnapshotIds = new Set<string>();
  let bytes = 0;
  for (const version of versions) {
    const identity = JSON.stringify([version.snapshotId, version.versionId]);
    // Proof: removing uniqueness accepted two identical hidden versions in the coherent-version consumer.
    if (identities.has(identity)) throw new Error('Duplicate snapshot version identity');
    identities.add(identity);
    represented.add(version.snapshotId);
    if (version.visible) {
      // Proof: removing current uniqueness accepted two visible versions in the version-guard consumer.
      if (visible.has(version.snapshotId)) throw new Error('Duplicate current snapshot version');
      visible.add(version.snapshotId);
      if (version.kind === 'object') visibleSnapshotIds.add(version.snapshotId);
    }
    if (version.kind === 'object') {
      bytes += version.bytes;
      // Proof: removing safe arithmetic accepted MAX_SAFE_INTEGER plus one in the full-history consumer.
      if (!Number.isSafeInteger(bytes))
        throw new Error('Snapshot version bytes exceed safe arithmetic');
    }
  }
  // Proof: removing completeness accepted a history-only snapshot key in the version-guard consumer.
  if (visible.size !== represented.size)
    throw new Error('Incomplete current snapshot version observation');
  const canonical = JSON.stringify(
    versions
      .map((version) =>
        version.kind === 'object'
          ? [version.snapshotId, version.versionId, version.visible, version.kind, version.bytes]
          : [version.snapshotId, version.versionId, version.visible, version.kind],
      )
      // Proof: locale collation equated composed/decomposed opaque IDs and failed reordered-bookend production success; exact code units preserve both identities.
      .sort((left, right) => {
        const leftIdentity = JSON.stringify(left);
        const rightIdentity = JSON.stringify(right);
        return leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0;
      }),
  );
  // Proof: removing this cap accepted 4,096 long opaque hidden-version IDs in the full-history consumer.
  if (Buffer.byteLength(canonical) > 4 * 1024 ** 2)
    throw new Error('Snapshot version observation exceeds byte bound');
  return { sha256: createHash('sha256').update(canonical).digest('hex'), visibleSnapshotIds };
}

/** Plans UTC calendar recovery coverage across storage rebinds; incomplete coverage never yields eligible deletions. */
export function planRegistryBackupRetention(
  input: RegistryBackupRetentionInput,
  repositoryId: string,
  output: string,
  observation: ReturnType<typeof observeRegistryBackupSnapshotVersions>,
): RegistryBackupRetentionPlan {
  const sampled = parseRegistryBackupTime(input.sampledAt);
  // Proof: removing the 2,048-record bound accepted a coherent 2,049-snapshot census; weakening summary bytes admitted unsafe metadata.
  const snapshots = Snapshot.array().atMostLength(2048).assert(JSON.parse(output));
  const identities = new Set<string>();
  const catalogue = snapshots
    .map((snapshot) => {
      const at = parseRegistryBackupTime(snapshot.time);
      const journalPath = input.journalPath;
      const registryPath = snapshot.paths.find((path) => path !== journalPath);
      // Proof: isolated guard removals accepted duplicate/extra IDs, foreign host, future time, missing journal, noncanonical/nested roots and foreign operation tags in production catalogue consumers.
      if (
        identities.has(snapshot.id) ||
        !observation.visibleSnapshotIds.has(snapshot.id) ||
        snapshot.hostname !== input.registryId ||
        at.nanoseconds > sampled.nanoseconds ||
        snapshot.tags.length !== 1 ||
        !snapshot.tags[0].startsWith('puni-registry-') ||
        snapshot.tags[0].length === 'puni-registry-'.length ||
        !snapshot.paths.includes(journalPath) ||
        registryPath === undefined ||
        snapshot.paths.some(
          (path) => !isAbsolute(path) || normalize(path) !== path || path === '/',
        ) ||
        !relative(journalPath, registryPath).startsWith('../') ||
        !relative(registryPath, journalPath).startsWith('../')
      )
        throw new Error('Snapshot catalogue identity, ownership, time or contents paths differ');
      identities.add(snapshot.id);
      return {
        snapshotId: snapshot.id,
        time: snapshot.time,
        registryPath,
        journalPath,
        at,
        bytes: snapshot.summary.total_bytes_processed,
      };
    })
    .sort((left, right) =>
      left.at.nanoseconds > right.at.nanoseconds
        ? -1
        : left.at.nanoseconds < right.at.nanoseconds
          ? 1
          : left.snapshotId.localeCompare(right.snapshotId),
    );
  // Proof: removing equality accepted an empty restic listing over a visible raw snapshot in the partial-catalogue consumer.
  if (identities.size !== observation.visibleSnapshotIds.size)
    throw new Error('Restic catalogue omitted visible snapshots');
  const pins = new Set(input.recoveryPins);
  // Proof: removing presence accepted a recovery pin absent from the exact current catalogue in mandatory-input tests.
  for (const pin of pins)
    if (!identities.has(pin)) throw new Error('Recovery pin absent from exact current catalogue');
  const receipt = input.lastVerified;
  if (receipt !== null) {
    const snapshot = catalogue.find((entry) => entry.snapshotId === receipt.snapshotId);
    // Proof: removing receipt ownership admitted a foreign registry receipt in the last-verified production consumer.
    if (
      snapshot === undefined ||
      receipt.registryId !== input.registryId ||
      receipt.journalPath !== input.journalPath ||
      snapshot.registryPath !== receipt.registryPath ||
      snapshot.bytes !== receipt.bytes ||
      snapshot.at.nanoseconds > parseRegistryBackupTime(receipt.verifiedAt).nanoseconds ||
      parseRegistryBackupTime(receipt.verifiedAt).nanoseconds > sampled.nanoseconds
    )
      throw new Error('Last verified receipt differs from exact snapshot metadata');
  }
  // Catalogue order is already newest-first, including signed UTC dates from RFC3339 year-zero offsets.
  const days = [...new Set(catalogue.map((entry) => entry.at.day))];
  const weeks = [...new Set(catalogue.map((entry) => entry.at.week))];
  // Proof: separate day/week guard removals exposed deletions with only one minimum satisfied in the independent-minimums consumer.
  const complete = days.length >= 7 && weeks.length >= 4;
  const daily = new Map<string, string>();
  const weekly = new Map<string, string>();
  for (const entry of catalogue) {
    if (days.slice(0, 7).includes(entry.at.day) && !daily.has(entry.at.day))
      daily.set(entry.at.day, entry.snapshotId);
    if (weeks.slice(0, 4).includes(entry.at.week) && !weekly.has(entry.at.week))
      weekly.set(entry.at.week, entry.snapshotId);
  }
  const retained: RegistryBackupRetentionPlan['retained'] = [];
  const eligibleSnapshotIds: string[] = [];
  for (const entry of catalogue) {
    const reasons: RegistryBackupRetentionReason[] = [];
    if (daily.get(entry.at.day) === entry.snapshotId) reasons.push('daily');
    if (weekly.get(entry.at.week) === entry.snapshotId) reasons.push('weekly');
    // Proof: removing last-verified/pin retention exposed the old protected IDs in the last-verified production consumer.
    if (receipt?.snapshotId === entry.snapshotId) reasons.push('last-verified');
    if (pins.has(entry.snapshotId)) reasons.push('recovery-pin');
    // Proof: removing preservation exposed bootstrap deletions in the incomplete-coverage production consumer.
    if (!complete) reasons.push('incomplete-coverage');
    if (reasons.length === 0) eligibleSnapshotIds.push(entry.snapshotId);
    else retained.push({ snapshotId: entry.snapshotId, reasons });
  }
  return {
    registryId: input.registryId,
    repositoryId,
    sampledAt: input.sampledAt,
    snapshotVersionsSha256: observation.sha256,
    catalogue: catalogue.map(({ snapshotId, time, registryPath, journalPath }) => ({
      snapshotId,
      time,
      registryPath,
      journalPath,
    })),
    retained,
    eligibleSnapshotIds,
    coverage: {
      complete,
      daily: { required: 7, observed: days.length, buckets: days.slice(0, 7) },
      weekly: { required: 4, observed: weeks.length, buckets: weeks.slice(0, 4) },
    },
  };
}
