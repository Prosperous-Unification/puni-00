import { BlockList, isIP } from 'node:net';

/**
 * Compiles explicitly trusted socket addresses/CIDRs. Hostnames and unrestricted networks are
 * refused; forwarded headers carry no authority until the socket peer matches this boundary.
 * Node's address matcher treats IPv4-mapped IPv6 peers as their IPv4 address.
 *
 * @throws when a configured peer is malformed or trusts every address.
 */
export function createProxyVerifier(
  peers: readonly string[],
): (peer: string | undefined) => boolean {
  const trusted = new BlockList();
  if (peers.length === 0)
    throw new Error('TRUSTED_PROXY_PEERS must contain a gateway address or CIDR');
  for (const peer of peers) {
    const parts = peer.split('/');
    const address = parts[0];
    const family = isIP(address);
    const maximum = family === 4 ? 32 : 128;
    const prefix = parts.length === 1 ? maximum : Number(parts[1]);
    // Proof: accepting prefix zero admitted 0.0.0.0/0 and failed the unrestricted-peer startup test.
    if (
      family === 0 ||
      parts.length > 2 ||
      (parts.length === 2 && !/^\d+$/.test(parts[1])) ||
      !Number.isInteger(prefix) ||
      prefix < 1 ||
      prefix > maximum
    )
      throw new Error('TRUSTED_PROXY_PEERS must contain bounded IP addresses or CIDRs');
    trusted.addSubnet(address, prefix, family === 4 ? 'ipv4' : 'ipv6');
  }
  return (peer) => {
    if (peer === undefined) return false;
    const family = isIP(peer);
    return family !== 0 && trusted.check(peer, family === 4 ? 'ipv4' : 'ipv6');
  };
}

/**
 * Parses the runtime gateway boundary. A forwarded deployment must name its peers explicitly;
 * direct loopback development needs none. Whitespace around comma-separated peers is permitted.
 */
export function readProxyPeers(
  value: string | undefined,
  hops: number | undefined,
): readonly string[] | undefined {
  if (value === undefined && (hops === undefined || hops === 0)) return undefined;
  // Proof: returning undefined here failed the runtime forwarded-deployment refusal in proxy-trust.test.ts.
  if (value === undefined)
    throw new Error('TRUSTED_PROXY_PEERS is required with TRUSTED_PROXY_HOPS');
  const peers = value.split(',').map((peer) => peer.trim());
  createProxyVerifier(peers);
  return peers;
}
