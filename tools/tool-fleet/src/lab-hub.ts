import { createSocket } from 'node:dgram';
import { writeFileSync } from 'node:fs';

/**
 * Rootless Ethernet hub for one QEMU lab's private node network.
 *
 * Each VM's private NIC is a QEMU `dgram` netdev that sends one Ethernet frame per UDP datagram
 * to this hub. The hub repeats every frame to every other declared VM port and drops datagrams
 * from undeclared ports, so only the lab's own machines share the segment. Loopback has no
 * multicast on the lab host, and `socket` netdevs are point-to-point, hence this hub.
 *
 * Usage: `bun lab-hub.ts --port <hub> --peers <p1,p2,...> --pid-file <path>`.
 * @throws Error when arguments are missing or malformed; the process exits nonzero.
 */
function readHubArguments(arguments_: readonly string[]): {
  readonly port: number;
  readonly peers: readonly number[];
  readonly pidFile: string;
} {
  const flags = new Map<string, string>();
  for (let position = 0; position < arguments_.length; position += 2) {
    const flag = arguments_.at(position);
    const value = arguments_.at(position + 1);
    if (flag === undefined || value === undefined || !flag.startsWith('--')) {
      throw new Error(`Lab hub argument at ${String(position)} is malformed`);
    }
    flags.set(flag, value);
  }
  const port = Number(flags.get('--port'));
  const peers = (flags.get('--peers') ?? '').split(',').map(Number);
  const pidFile = flags.get('--pid-file');
  const isPort = (candidate: number): boolean =>
    Number.isSafeInteger(candidate) && candidate > 1024 && candidate < 65536;
  if (!isPort(port) || peers.length < 2 || !peers.every(isPort) || pidFile === undefined) {
    // Without an exact peer list any local UDP sender could join the segment; not fault-injected.
    throw new Error('Lab hub requires --port, at least two --peers, and --pid-file');
  }
  return { port, peers, pidFile };
}

const hub = readHubArguments(process.argv.slice(2));
const peers = new Set(hub.peers);
// A declared peer that is not running (never created, fenced) has a closed port, which the kernel
// reports back as ECONNREFUSED on the next receive. Forwarding only to peers that had spoken since
// a hub restart left a silent VM unreachable by ARP, so every declared peer receives every frame.
const socket = createSocket('udp4');
socket.on('message', (frame, sender) => {
  if (sender.address !== '127.0.0.1' || !peers.has(sender.port)) return;
  for (const peer of peers) {
    if (peer !== sender.port) socket.send(frame, peer, '127.0.0.1');
  }
});
socket.on('error', (cause) => {
  // Proof: rethrowing ECONNREFUSED killed the live lab hub on the absent spare's port, and every
  // private-network MTU probe between the three VMs then failed.
  if ('code' in cause && cause.code === 'ECONNREFUSED') return;
  throw cause;
});
socket.bind(hub.port, '127.0.0.1', () => {
  writeFileSync(hub.pidFile, `${String(process.pid)}\n`, { mode: 0o600 });
});
