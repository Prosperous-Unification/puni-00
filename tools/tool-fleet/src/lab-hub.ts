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

/** An absent peer (never created, fenced) is a modeled state; any other failure stops the hub. */
function ignoreAbsentPeer(cause: unknown): void {
  if (cause instanceof Error && 'code' in cause && cause.code === 'ECONNREFUSED') return;
  throw cause;
}

// Every declared peer receives every frame: forwarding only to peers that had spoken left a silent
// VM unreachable by ARP after a hub restart. A closed peer port makes the kernel report
// ECONNREFUSED, synchronously or on the socket.
// Proof: the live three-server lab (absent agent ports between live servers) lost all private
// traffic: a send after an absent peer threw that peer's ECONNREFUSED and the frame for the live
// server-3 was never sent (hub debug log `sync-err 44746`). Retrying once delivers it.
await Bun.udpSocket({
  hostname: '127.0.0.1',
  port: hub.port,
  socket: {
    data(socket, frame, senderPort, senderAddress) {
      if (senderAddress !== '127.0.0.1' || !peers.has(senderPort)) return;
      for (const peer of peers) {
        if (peer === senderPort) continue;
        // A refusal thrown here belongs to the previous datagram (an absent peer), and this
        // datagram was not sent; one retry sends it.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            socket.send(frame, peer, '127.0.0.1');
            break;
          } catch (cause) {
            ignoreAbsentPeer(cause);
          }
        }
      }
    },
    // Bun passes the error as the handler's only argument, with the socket as `this`.
    error(cause: unknown) {
      ignoreAbsentPeer(cause);
    },
  },
});
writeFileSync(hub.pidFile, `${String(process.pid)}\n`, { mode: 0o600 });
