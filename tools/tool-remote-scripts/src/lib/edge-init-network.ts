import { isIP } from 'node:net';

import { InitRefusal } from './edge-init';
import { readIdentity } from './managed-cohort';

interface Counters {
  IPsInUse: number;
  DynamicIPsAvailable: number;
}

export interface NetworkObservation {
  readonly native: Record<string, unknown>;
  readonly configuration: Record<string, unknown>;
  readonly members: Record<string, unknown>;
  readonly status: { IPAM: { Subnets: Record<string, Counters> } };
}

function invalid(): never {
  throw new InitRefusal('unsupported-native-shape');
}

function fields(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid();
  // This boundary admits only object-shaped native JSON; fields remain unknown until checked.
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const record = fields(value);
  // Proof: omitting exact-key admission accepted an extra runtime Status field
  // in the actual factory entry (exit 0 instead of the expected refusal).
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key)))
    invalid();
  return record;
}

function cidr(value: string): void {
  if (value.length > 64 || value.includes('%')) invalid();
  const parts = value.split('/');
  if (parts.length !== 2) invalid();
  const address = parts[0],
    prefix = parts[1];
  if (!/^(?:0|[1-9][0-9]*)$/.test(prefix)) invalid();
  const family = isIP(address);
  if (family === 0 || (family === 6 && address.includes('.'))) invalid();
  if (family === 6) {
    const halves = address.toLowerCase().split('::');
    const left = halves[0]?.split(':').filter(Boolean) ?? [];
    const right = halves[1]?.split(':').filter(Boolean) ?? [];
    const expanded = [
      ...left,
      ...Array<string>(8 - left.length - right.length).fill('0'),
      ...right,
    ];
    // Proof: removing mapped-address admission accepted both compressed and expanded
    // IPv4-mapped subnet spellings in the pure status/roster negative.
    if (
      expanded.slice(0, 5).every((part) => Number.parseInt(part, 16) === 0) &&
      Number.parseInt(expanded[5] ?? '', 16) === 0xffff
    )
      invalid();
  }
  if (Number(prefix) > (family === 4 ? 32 : 128)) invalid();
}

function counter(value: unknown, source?: string): number {
  // Proof: omitting safe-integer admission accepted a fractional synthetic
  // counter; the retained native-shape negative failed before restoration.
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    Object.is(value, -0)
  )
    invalid();
  if (source !== undefined) {
    // Proof: rounded-fraction and exponent raw-token negatives reject values that JSON.parse
    // otherwise rounds into apparently valid safe integers on Bun 1.4.4.
    if (!/^(?:0|[1-9][0-9]*)$/.test(source) || BigInt(source) > BigInt(Number.MAX_SAFE_INTEGER))
      invalid();
  }
  return value;
}

/** Retains all configuration keys, while membership and validated allocation status stay separate. */
export function projectNetworkInspect(
  value: unknown,
  sources?: WeakMap<object, Map<string, string>>,
): NetworkObservation {
  const native = fields(value);
  readIdentity(native['Id']);
  if (
    typeof native['Name'] !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/.test(native['Name']) ||
    native['Scope'] !== 'local' ||
    native['Driver'] !== 'bridge' ||
    native['ConfigOnly'] !== false
  )
    invalid();
  const ipam = fields(native['IPAM']);
  if (ipam['Driver'] !== 'default' || !Array.isArray(ipam['Config'])) invalid();
  const roster: unknown[] = ipam['Config'];
  if (roster.length === 0 || roster.length > 64) invalid();
  const subnets = new Set<string>();
  for (const entry of roster) {
    const subnet = fields(entry)['Subnet'];
    if (typeof subnet !== 'string') invalid();
    cidr(subnet);
    if (subnets.has(subnet)) invalid();
    subnets.add(subnet);
  }
  const members = fields(native['Containers']);
  const status = exact(native['Status'], ['IPAM']);
  const statusIpam = exact(status['IPAM'], ['Subnets']);
  const runtime = fields(statusIpam['Subnets']);
  const entries = Object.entries(runtime);
  if (entries.length === 0 || entries.length > 64 || entries.length !== subnets.size) invalid();
  const checked: Record<string, Counters> = {};
  for (const [subnet, value] of entries) {
    cidr(subnet);
    if (!subnets.has(subnet)) invalid();
    const allocation = exact(value, ['IPsInUse', 'DynamicIPsAvailable']);
    checked[subnet] = {
      IPsInUse: counter(
        allocation['IPsInUse'],
        sources === undefined ? undefined : sources.get(allocation)?.get('IPsInUse'),
      ),
      DynamicIPsAvailable: counter(
        allocation['DynamicIPsAvailable'],
        sources === undefined ? undefined : sources.get(allocation)?.get('DynamicIPsAvailable'),
      ),
    };
    if (
      sources !== undefined &&
      (sources.get(allocation)?.get('IPsInUse') === undefined ||
        sources.get(allocation)?.get('DynamicIPsAvailable') === undefined)
    )
      invalid();
  }
  // Proof: omitting only top-level IPAM made its independent configuration
  // drift preserve the pin hash in edge-init-network.test.ts.
  const { Containers: _members, Status: _status, ...configuration } = native;
  return { native, configuration, members, status: { IPAM: { Subnets: checked } } };
}

/** Parses one bounded network reply without losing the exact numeric source tokens. */
export function parseNetworkInspect(
  input: Uint8Array | string,
  framing: 'object' | 'single-array',
): NetworkObservation {
  if (input.length > 4 * 1048576) throw new InitRefusal('engine-response-too-large');
  let raw: string;
  try {
    raw =
      typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    throw new InitRefusal('engine-json-invalid');
  }
  const sources = new WeakMap<object, Map<string, string>>();
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      raw,
      function (this: unknown, key: string, value: unknown, context?: { source?: string }) {
        if (
          typeof value === 'number' &&
          typeof this === 'object' &&
          this !== null &&
          context?.source !== undefined
        ) {
          const known = sources.get(this) ?? new Map<string, string>();
          known.set(key, context.source);
          sources.set(this, known);
        }
        return value;
      },
    );
  } catch {
    throw new InitRefusal('engine-json-invalid');
  }
  if (framing === 'single-array') {
    if (!Array.isArray(decoded) || decoded.length !== 1) invalid();
    return projectNetworkInspect(decoded[0], sources);
  }
  if (Array.isArray(decoded)) invalid();
  return projectNetworkInspect(decoded, sources);
}
