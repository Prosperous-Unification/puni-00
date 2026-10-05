import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * Picks the client address of one request. With `trustedProxyHops` greater than zero it is the
 * `X-Forwarded-For` entry that many hops from the end, which the trusted gateway appended; with
 * zero it is the socket address. Returns null, never the socket address, when the expected hop
 * is absent or not an IP address.
 */
export function selectClientAddress(
  forwardedFor: string | null,
  socketAddress: string | undefined,
  trustedProxyHops: number,
): string | null {
  if (trustedProxyHops === 0)
    return socketAddress !== undefined && isIP(socketAddress) !== 0 ? socketAddress : null;
  // Proof: falling back to the socket address here made the missing-hop source test answer 200.
  if (forwardedFor === null) return null;
  const hops = forwardedFor.split(',').map((hop) => hop.trim());
  if (hops.length < trustedProxyHops) return null;
  const candidate = hops[hops.length - trustedProxyHops];
  return isIP(candidate) !== 0 ? candidate : null;
}

/**
 * The part of an address that identifies one source: the whole IPv4 address, or the /64
 * prefix of an IPv6 address, because one subscriber is usually handed a whole /64. An
 * IPv4-mapped IPv6 address is its IPv4 address.
 *
 * @throws when `address` is not an IP address; callers pass {@link selectClientAddress} output.
 */
export function selectSourcePrefix(address: string): string {
  const bare = address.split('%')[0] ?? address;
  const family = isIP(bare);
  if (family === 4) return bare;
  if (family !== 6) throw new Error('Source address is not an IP address');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare);
  if (mapped?.[1] !== undefined) return mapped[1];
  const halves = bare.toLowerCase().split('::');
  const isCompressed = halves.length === 2;
  const headGroups = halves[0] === '' ? [] : halves[0].split(':');
  const tailText = isCompressed ? halves[1] : '';
  const tailGroups = tailText === '' ? [] : tailText.split(':');
  const groups = !isCompressed
    ? headGroups
    : [
        ...headGroups,
        ...Array<string>(8 - headGroups.length - tailGroups.length).fill('0'),
        ...tailGroups,
      ];
  // Proof: hashing the full IPv6 address made the same-/64 source test see two sources.
  return `${groups
    .slice(0, 4)
    .map((group) => group.padStart(4, '0'))
    .join(':')}::/64`;
}

/**
 * Hashes the source prefix of a client address with the salt of its UTC day. `readSalt` returns
 * the day's salt shared by every process on the database (the store's `readSourceSalt`),
 * so restarts and blue/green pairs agree, and old salts are deleted, so a stored source is
 * pseudonymous and cannot be linked to the address once its day's salt is gone.
 */
export function createSourceHasher(
  readSalt: (utcDay: string) => Uint8Array,
): (address: string, now: number) => string {
  let salt: { utcDay: string; value: Uint8Array } | null = null;
  return (address, now) => {
    const utcDay = new Date(now).toISOString().slice(0, 10);
    if (salt?.utcDay !== utcDay) salt = { utcDay, value: readSalt(utcDay) };
    return createHash('sha256')
      .update(salt.value)
      .update(selectSourcePrefix(address))
      .digest('hex');
  };
}
