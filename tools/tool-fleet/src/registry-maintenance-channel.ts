import { randomBytes } from 'node:crypto';
import { closeSync } from 'node:fs';

import { type } from 'arktype';

import type { RegistryMaintenanceHostRequest } from './registry-maintenance-control';
import { assertRegistryMaintenanceLock } from './registry-maintenance-process';
import { type MaintenancePacket, MaintenanceSocket } from './registry-maintenance-socket';

const Nonce = type(/^[a-f0-9]{64}$/);
const Bootstrap = type({ kind: "'bootstrap'", nonce: Nonce, '+': 'reject' });
const Acknowledgement = type({
  kind: "'authenticated'",
  nonce: Nonce,
  challenge: Nonce,
  '+': 'reject',
});
const Request = type({ kind: "'request'", challenge: Nonce, request: 'unknown', '+': 'reject' });
const Frame = type({
  kind: "'ready'|'complete'|'cancelled'|'failed'",
  receipt: 'string <= 16384',
  '+': 'reject',
});
export type RegistryMaintenanceFrame = typeof Frame.infer;

function decode(packet: MaintenancePacket): unknown {
  try {
    return JSON.parse(packet.bytes.toString('utf8'));
  } catch {
    throw new Error('Malformed private maintenance packet');
  }
}
function closeRights(packet: MaintenancePacket): void {
  for (const descriptor of packet.descriptors) closeSync(descriptor);
}
function samePeer(packet: MaintenancePacket, peer: MaintenancePacket['credentials']) {
  return (
    packet.credentials.pid === peer.pid &&
    packet.credentials.uid === peer.uid &&
    packet.credentials.gid === peer.gid
  );
}
function requireNoRights(packet: MaintenancePacket): void {
  if (packet.descriptors.length !== 0) {
    closeRights(packet);
    throw new Error('Unexpected private maintenance descriptor');
  }
}

/**
 * Send only a nonsecret nonce and the existing authority description until a CURRENT root sender
 * acknowledges that exact nonce over the direct socket. Sudo PTY/input relays cannot pass this
 * handshake and therefore cannot observe the later operation token. See docs/adr/0076-registry-maintenance-transfers-the-held-authority-descriptor.md.
 */
export async function authenticateMaintenanceChannel(
  channel: MaintenanceSocket,
  descriptor: number,
) {
  const signal = AbortSignal.timeout(10000);
  const nonce = randomBytes(32).toString('hex');
  await channel.send(
    Buffer.from(JSON.stringify({ kind: 'bootstrap', nonce })),
    [descriptor],
    signal,
  );
  const packet = await channel.receive(signal);
  if (packet === null) throw new Error('Maintenance root bootstrap ended without authentication');
  requireNoRights(packet);
  const acknowledged = Acknowledgement(decode(packet));
  if (
    acknowledged instanceof type.errors ||
    acknowledged.nonce !== nonce ||
    packet.credentials.uid !== 0 ||
    packet.credentials.gid !== 0
  )
    throw new Error('Maintenance bootstrap lacks current root authentication');
  const root = packet.credentials;
  let sent = false;
  let receivedBytes = 0;
  return {
    guardianPid: root.pid,
    async request(request: RegistryMaintenanceHostRequest) {
      if (sent) throw new Error('Maintenance request already sent');
      sent = true;
      await channel.send(
        Buffer.from(
          JSON.stringify({ kind: 'request', challenge: acknowledged.challenge, request }),
        ),
        [],
        signal,
      );
    },
    async frame(deadline: AbortSignal): Promise<RegistryMaintenanceFrame> {
      const next = await channel.receive(deadline);
      if (next === null) throw new Error('Maintenance helper omitted terminal acknowledgement');
      requireNoRights(next);
      receivedBytes += next.bytes.length;
      if (receivedBytes > 32768) throw new Error('Maintenance responses exceed bound');
      const decoded = Frame(decode(next));
      if (!samePeer(next, root) || decoded instanceof type.errors)
        throw new Error('Untrusted private maintenance response');
      return decoded;
    },
    async cancel() {
      await channel.send(Buffer.from('cancel\n'));
    },
    async end() {
      const trailing = await channel.receive(AbortSignal.timeout(1000));
      if (trailing !== null) {
        closeRights(trailing);
        throw new Error('Maintenance helper emitted trailing output');
      }
    },
    close() {
      channel.close();
    },
  };
}

/**
 * Effect-free root bootstrap. The fixed root entrypoint supplies the installed canonical path/UID.
 * Receive exactly one same-description lock, validate it before canonical journal reads, and then
 * authenticate every request/control packet against its current kernel sender. Returned authority
 * descriptor belongs to this channel and remains open until terminal cleanup; close never unlocks.
 */
export async function acceptMaintenanceChannel(
  directory: string,
  uid: number,
): Promise<{
  descriptor: number;
  input: ReadableStream<Uint8Array>;
  frame: (kind: RegistryMaintenanceFrame['kind'], receipt: string) => Promise<void>;
  close: () => void;
}> {
  const channel = new MaintenanceSocket(0);
  let authority: number | undefined;
  const readCancellation = new AbortController();
  try {
    const bootstrap = await channel.receive(AbortSignal.timeout(10000));
    if (bootstrap === null) throw new Error('Missing maintenance descriptor bootstrap');
    if (bootstrap.descriptors.length !== 1) {
      closeRights(bootstrap);
      throw new Error('Invalid maintenance descriptor count');
    }
    authority = bootstrap.descriptors[0];
    const decoded = Bootstrap(decode(bootstrap));
    if (
      decoded instanceof type.errors ||
      bootstrap.bytes.length > 256 ||
      bootstrap.credentials.uid !== uid ||
      bootstrap.credentials.gid !== uid
    )
      throw new Error('Invalid maintenance descriptor bootstrap');
    // Boundary: an external descriptor slot remains required despite unchecked index typing at assignment.
    if ((authority as number | undefined) === undefined)
      throw new Error('Missing maintenance authority descriptor');
    await assertRegistryMaintenanceLock(directory, authority, uid);
    const peer = bootstrap.credentials;
    const challenge = randomBytes(32).toString('hex');
    await channel.send(
      Buffer.from(JSON.stringify({ kind: 'authenticated', nonce: decoded.nonce, challenge })),
    );
    let requested = false;
    const input = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const packet = await channel.receive(
          requested
            ? readCancellation.signal
            : AbortSignal.any([readCancellation.signal, AbortSignal.timeout(10000)]),
        );
        if (packet === null) {
          controller.close();
          return;
        }
        requireNoRights(packet);
        if (!samePeer(packet, peer) || packet.bytes.length > 4096)
          throw new Error('Foreign or oversized maintenance request');
        if (!requested) {
          const request = Request(decode(packet));
          if (request instanceof type.errors || request.challenge !== challenge)
            throw new Error('Invalid maintenance authenticated request');
          requested = true;
          controller.enqueue(Buffer.from(JSON.stringify(request.request) + '\n'));
        } else {
          if (packet.bytes.toString('utf8') !== 'cancel\n')
            throw new Error('Unexpected maintenance control packet');
          controller.enqueue(packet.bytes);
        }
      },
      cancel() {
        readCancellation.abort(new Error('Maintenance control reader closed'));
      },
    });
    return {
      descriptor: authority,
      input,
      async frame(kind: RegistryMaintenanceFrame['kind'], receipt: string) {
        const decoded = Frame({ kind, receipt });
        if (decoded instanceof type.errors) throw new Error('Invalid maintenance response');
        await channel.send(Buffer.from(JSON.stringify(decoded)));
      },
      close() {
        readCancellation.abort(new Error('Maintenance channel closed'));
        try {
          channel.close();
        } finally {
          if (authority !== undefined) {
            closeSync(authority);
            authority = undefined;
          }
        }
      },
    };
  } catch (cause) {
    try {
      channel.close();
    } finally {
      if (authority !== undefined) closeSync(authority);
    }
    throw cause;
  }
}
