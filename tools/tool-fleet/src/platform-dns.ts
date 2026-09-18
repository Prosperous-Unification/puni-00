import { readFile } from 'node:fs/promises';

import { type } from 'arktype';

const DnsRecord = type({
  name: /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/,
  type: "'A' | 'AAAA' | 'CNAME' | 'TXT'",
  ttl: 'number.integer >= 60',
  values: type('string>0').array().atLeastLength(1),
  '+': 'reject',
});
const DnsRecords = DnsRecord.array();

export type DnsRecordSet = typeof DnsRecord.infer;

export interface DnsChange {
  readonly action: 'create' | 'update' | 'delete';
  readonly previous: DnsRecordSet | null;
  readonly next: DnsRecordSet | null;
}

/**
 * A reviewed DNS operation. It is data only: nothing in this repository applies it,
 * because the provider (GoDaddy today) has no API access for these domains.
 */
export interface DnsChangePlan {
  readonly schemaVersion: 1;
  readonly zone: string;
  readonly changes: readonly DnsChange[];
  /** The exact inverse, restoring every previous record set and TTL. */
  readonly rollback: readonly DnsChange[];
  /** Seconds to wait after lowering TTLs before `changes`: the largest previous TTL. */
  readonly propagationWaitSeconds: number;
}

function key(record: DnsRecordSet): string {
  return `${record.name} ${record.type}`;
}

function indexRecords(zone: string, label: string, records: readonly DnsRecordSet[]) {
  const byKey = new Map<string, DnsRecordSet>();
  for (const record of records) {
    if (record.name !== zone && !record.name.endsWith(`.${zone}`)) {
      throw new Error(`${label} record ${record.name} is outside zone ${zone}`);
    }
    if (byKey.has(key(record))) throw new Error(`${label} lists ${key(record)} twice`);
    byKey.set(key(record), { ...record, values: [...record.values].sort() });
  }
  return byKey;
}

function sameRecord(left: DnsRecordSet, right: DnsRecordSet): boolean {
  return left.ttl === right.ttl && left.values.join('\n') === right.values.join('\n');
}

/**
 * Plan the record-set changes from `current` to `desired` for one zone, with rollback.
 *
 * Names must be explicit hostnames inside the zone (the schema admits no
 * wildcard), each name/type pair appears once per side, and record sets absent
 * from `desired` are deleted. Throws on any violation instead of dropping it.
 */
export function planDnsChange(
  zone: string,
  current: readonly DnsRecordSet[],
  desired: readonly DnsRecordSet[],
): DnsChangePlan {
  const before = indexRecords(zone, 'current', current);
  const after = indexRecords(zone, 'desired', desired);
  const changes: DnsChange[] = [];
  for (const [recordKey, next] of [...after].sort(([left], [right]) => left.localeCompare(right))) {
    const previous = before.get(recordKey) ?? null;
    if (previous === null) changes.push({ action: 'create', previous, next });
    else if (!sameRecord(previous, next)) changes.push({ action: 'update', previous, next });
  }
  for (const [recordKey, previous] of [...before].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!after.has(recordKey)) changes.push({ action: 'delete', previous, next: null });
  }
  const rollback = [...changes].reverse().map(({ action, previous, next }): DnsChange => ({
    action: action === 'create' ? 'delete' : action === 'delete' ? 'create' : 'update',
    previous: next,
    next: previous,
  }));
  const propagationWaitSeconds = Math.max(
    0,
    ...changes.flatMap(({ previous }) => (previous === null ? [] : [previous.ttl])),
  );
  return { schemaVersion: 1, zone, changes, rollback, propagationWaitSeconds };
}

async function readRecords(path: string): Promise<DnsRecordSet[]> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(path, 'utf8'));
  } catch (cause) {
    throw new Error(`Cannot read DNS records from ${path}`, { cause });
  }
  const records = DnsRecords(input);
  if (records instanceof type.errors) {
    throw new Error(`${path} is not a DNS record list: ${records.summary}`);
  }
  return records;
}

if (import.meta.main) {
  const [command, zone, currentPath, desiredPath] = process.argv.slice(2);
  if (process.argv.length !== 6 || command !== 'plan') {
    throw new Error('Usage: platform-dns.ts plan <zone> <current.json> <desired.json>');
  }
  const plan = planDnsChange(zone, await readRecords(currentPath), await readRecords(desiredPath));
  console.log(JSON.stringify(plan, null, 2));
}
