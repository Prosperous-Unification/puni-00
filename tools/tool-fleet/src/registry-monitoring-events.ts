import { createHash } from 'node:crypto';

import { type } from 'arktype';

import type { RegistryPressureReport } from './registry-pressure-report';

// Proof: R5[canonical-timestamp-schema] the declared isolated fault defeated this boundary; observed by "canonical timestamp schema rejects malformed stored".
export const RegistryAlertTime = type('string').narrow(
  (stamp) => Number.isFinite(Date.parse(stamp)) && new Date(stamp).toISOString() === stamp,
);
const Count = type('number.safe >= 0');
export const RegistryAlertEvent = type({
  id: '0 < string <= 128',
  origin: '0 < string <= 256',
  kind: "'warning'|'cleanup-request'|'cutoff'|'backup-failure'|'cleanup-failure'|'launcher-failure'",
  registryId: '0 < string <= 256',
  at: RegistryAlertTime,
  fence: type({
    state: "'open'|'fenced'",
    reason: type('0 < string <= 256').or('null'),
    '+': 'reject',
  }).or({ state: "'unavailable'", reason: "'canonical-fence-unavailable'", '+': 'reject' }),
  capacity: type({
    state: "'measured'",
    usedBytes: Count,
    maximumBytes: Count,
    rootFreeBytes: Count,
    usableBytes: Count,
    totalInodes: Count,
    usedInodes: Count,
    '+': 'reject',
  }).or({ state: "'unavailable'", reason: "'fresh-measurement-unavailable'", '+': 'reject' }),
  owners: {
    scope: "'explicit-canonical-obligations'|'unavailable'",
    count: Count,
    names: type('string <= 128').array().atMostLength(8),
    omitted: Count,
    '+': 'reject',
  },
  remedy: '0 < string <= 256',
  attempts: 'number.safe >= 0 & number.safe <= 3',
  firstAt: RegistryAlertTime.or('null'),
  nextAt: RegistryAlertTime.or('null'),
  state: "'pending'|'sending'|'uncertain'|'acknowledged'|'rejected'|'exhausted'",
  payloadSha256: /^[a-f0-9]{64}$/,
  '+': 'reject',
});
export type RegistryAlertEvent = typeof RegistryAlertEvent.infer;
export type RegistryAlertDraft = Pick<
  RegistryAlertEvent,
  'kind' | 'registryId' | 'origin' | 'at' | 'capacity' | 'owners' | 'remedy' | 'fence'
>;
export const hashRegistryAlert = (text: string) => createHash('sha256').update(text).digest('hex');

/** Render fixed mandatory fields before bounded owner evidence; exact bytes are hashed before sending. */
export function renderRegistryAlert(event: RegistryAlertDraft & { id: string }): string {
  const capacity =
    event.capacity.state === 'measured'
      ? `bytes=${String(event.capacity.usedBytes)}/${String(event.capacity.usableBytes)} (maximum=${String(event.capacity.maximumBytes)}); root-free=${String(event.capacity.rootFreeBytes)}; inodes=${String(event.capacity.usedInodes)}/${String(event.capacity.totalInodes)}`
      : `unavailable:${event.capacity.reason}`;
  const text = `Registry ${event.registryId}\nEvent ${event.id} ${event.kind} at ${event.at}\nCapacity ${capacity}\nFence ${event.fence.state}:${String(event.fence.reason)}\nOwners ${event.owners.scope}: count=${String(event.owners.count)}; names=${event.owners.names.join(',')}; omitted=${String(event.owners.omitted)}\nRemedy ${event.remedy}`;
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  // Proof: R5[rendered-text-bound] the declared isolated fault defeated this boundary; observed by "bounded rendered text rejects".
  if (Buffer.byteLength(escaped) > 6144) throw new Error('Registry alert text exceeds bound');
  return JSON.stringify({ text: escaped, mrkdwn: false });
}

/** Current physical measurement only; callers never substitute canonical cached capacity. */
export function draftRegistryPressureAlert(report: RegistryPressureReport): RegistryAlertDraft {
  return {
    kind:
      report.pressure === 'fenced'
        ? 'cutoff'
        : report.pressure === 'retire'
          ? 'cleanup-request'
          : 'warning',
    registryId: report.registryId,
    origin: hashRegistryAlert(
      JSON.stringify([report.machineId, report.bootId, report.epoch, report.sequence]),
    ),
    at: report.measurement.at,
    fence: { state: report.fenced ? 'fenced' : 'open', reason: report.reason },
    capacity: {
      state: 'measured',
      usedBytes: report.measurement.usedBytes,
      maximumBytes: report.measurement.maximumBytes,
      rootFreeBytes: report.measurement.rootFreeBytes,
      usableBytes: report.measurement.usableBytes,
      totalInodes: report.measurement.totalInodes,
      usedInodes: report.measurement.usedInodes,
    },
    owners: { scope: 'unavailable', count: 0, names: [], omitted: 0 },
    remedy:
      'Retire eligible owners, repair inventory, or increase capacity; preserve protected images.',
  };
}
