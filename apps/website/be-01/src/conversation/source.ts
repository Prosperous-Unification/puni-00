import { createHash, randomBytes } from 'node:crypto';
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
 * Hashes client addresses with a random salt per process and UTC day, so a stored source is
 * pseudonymous and cannot be linked to the address once the salt rotates.
 */
export function createSourceHasher(): (address: string, now: number) => string {
  let salt: { utcDay: string; value: Buffer } | null = null;
  return (address, now) => {
    const utcDay = new Date(now).toISOString().slice(0, 10);
    if (salt?.utcDay !== utcDay) salt = { utcDay, value: randomBytes(32) };
    return createHash('sha256').update(salt.value).update(address).digest('hex');
  };
}
