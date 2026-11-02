import { isIP } from 'node:net';

/**
 * The one source every request is counted under when its address cannot be read from what the
 * trusted proxies wrote: fewer `X-Forwarded-For` entries than `MCP_TRUSTED_PROXY_HOPS`, an
 * entry that is no IP address, or no socket address with 0 hops. Such a request did not come
 * through the proxies as configured, so it shares one bucket with every other such request:
 * limited more tightly, never trusted more.
 */
export const UNATTRIBUTED_SOURCE = 'unattributed';

/**
 * A request's source address (`wbs-mcp-agent-surface` M10): the `X-Forwarded-For` entry
 * `hops` from the right, which the outermost trusted proxy wrote, or with 0 hops the socket
 * address. Entries left of it are the client's own words, so a spoofed leftmost entry changes
 * nothing. Several `X-Forwarded-For` headers arrive joined by `, `, in order.
 *
 * @param forwardedFor the request's `X-Forwarded-For`, or null.
 * @param peer the socket's remote address, or null where none is known (a test's request).
 * @param hops `MCP_TRUSTED_PROXY_HOPS`, validated at boot.
 */
export function sourceAddressOf(
  forwardedFor: string | null,
  peer: string | null,
  hops: number,
): string {
  if (hops === 0) return peer !== null && isIP(peer) !== 0 ? peer : UNATTRIBUTED_SOURCE;
  const entries = (forwardedFor ?? '').split(',').map((entry) => entry.trim());
  // Proof: reading `entries[0]` here, the leftmost entry as before task 4.2, failed `counts a
  // rotating spoofed first entry against the real address, and refuses after 30`
  // (machine-limits.test.ts) and three source-address.test.ts cases, `takes the entry hops from
  // the right…` among them; watched 2026-10-27.
  const written = forwardedFor === null ? undefined : entries[entries.length - hops];
  return written !== undefined && isIP(written) !== 0 ? written : UNATTRIBUTED_SOURCE;
}
