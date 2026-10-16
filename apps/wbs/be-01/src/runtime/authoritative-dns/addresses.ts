import { BlockList, isIP } from 'node:net';

const prohibitedV4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.31.196.0', 24],
  ['192.52.193.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['192.175.48.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  prohibitedV4.addSubnet(address, prefix, 'ipv4');

const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const prohibitedV6 = new BlockList();
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['2620:4f:8000::', 48],
  ['3fff::', 20],
] as const)
  prohibitedV6.addSubnet(address, prefix, 'ipv6');

/** Absence disables DNS; a present setting must name one to three distinct bare IPs. */
export function parseResolvers(value: string): readonly string[];
export function parseResolvers(value: string | undefined): readonly string[] | undefined;
export function parseResolvers(value: string | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined;
  const addresses = value.split(',').map(canonicalizeIp);
  // Proof: bypassing config count failed
  // `keeps DNS disabled only for absent resolver configuration` (2026-10-16).
  // Proof: bypassing config distinct failed
  // `keeps DNS disabled only for absent resolver configuration` (2026-10-16).
  if (addresses.length < 1 || addresses.length > 3 || new Set(addresses).size !== addresses.length)
    throw new Error('ORGANIZATION_DNS_RESOLVERS requires one to three distinct IP literals');
  return Object.freeze(addresses);
}

/** Canonicalizes numeric destinations once, including mapped IPv4; never performs a lookup. */
export function canonicalizeIp(value: string): string {
  const family = value.includes('%') ? 0 : isIP(value);
  switch (family) {
    case 4:
      return value;
    case 6:
      return normalizeIpv6(value);
    // Proof: bypassing bare IP failed
    // `rejects invalid owner input before any packet and refuses configured hostnames` (2026-10-16).
    default:
      throw new Error('DNS destination requires a bare IP literal');
  }
}

/** Called only after native IP validation; normalizes IPv6 and unwraps mapped IPv4. */
function normalizeIpv6(value: string): string {
  const canonical = new URL(`http://[${value}]`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (mapped === null) return canonical;
  const high = mapped.at(1);
  const low = mapped.at(2);
  if (high === undefined || low === undefined)
    throw new Error('DNS mapped address invariant failed');
  const first = Number.parseInt(high, 16);
  const second = Number.parseInt(low, 16);
  return `${String(first >>> 8)}.${String(first & 255)}.${String(second >>> 8)}.${String(second & 255)}`;
}

/**
 * Refuses all IANA special-purpose ranges, including globally reachable special services.
 * Policy snapshot: IANA IPv4/IPv6 special-purpose registries, read 2026-10-16,
 * both last updated 2025-10-09. IPv6 additionally requires ordinary 2000::/3 unicast.
 * {@link canonicalizeIp} prevents IPv4-mapped IPv6 from bypassing IPv4 classification.
 */
export function isPublicAuthority(value: string): boolean {
  const address = canonicalizeIp(value);
  // Proof: bypassing ipv4 guard failed
  // `refuses special-purpose and mapped endpoints through lookup 127.0.0.1` (2026-10-16).
  if (isIP(address) === 4) return !prohibitedV4.check(address, 'ipv4');
  // Proof: bypassing ipv6 guard failed
  // `refuses special-purpose and mapped endpoints through lookup 2001:db8::1` (2026-10-16).
  return globalV6.check(address, 'ipv6') && !prohibitedV6.check(address, 'ipv6');
}
