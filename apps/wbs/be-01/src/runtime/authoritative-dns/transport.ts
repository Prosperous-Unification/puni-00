import { createSocket } from 'node:dgram';
import { connect, isIP } from 'node:net';

import type { Timers } from '@wbs/core';
import { systemTimers } from '@wbs/runtime-portable';

import { canonicalizeIp } from './addresses';
import { DnsUnavailableError } from './failures';
import type { DnsExchange, DnsReply, DnsTransport } from './resolver';

export interface SocketFactories {
  readonly createDatagram: typeof createSocket;
  readonly connectStream: typeof connect;
}

/** Required cleanup failed; another endpoint must not hide this resource failure. */
export class DnsCleanupError extends Error {
  override name = 'DnsCleanupError';
}

/** One numeric peer per socket; settlement waits for cleanup on every exit path. */
export class SocketDnsTransport implements DnsTransport {
  constructor(
    private readonly sockets: SocketFactories = {
      createDatagram: createSocket,
      connectStream: connect,
    },
    private readonly timers: Timers = systemTimers,
  ) {}

  /** Exchanges opaque DNS bytes; framing and packet acceptance remain in the adapter. */
  async exchange(request: DnsExchange): Promise<DnsReply> {
    request.signal.throwIfAborted();
    // Proof: bypassing native numeric peer failed
    // `refuses a hostname and invalid outgoing spans before socket allocation` (2026-10-16).
    canonicalizeIp(request.address);
    // Proof: bypassing native outgoing span failed
    // `refuses a hostname and invalid outgoing spans before socket allocation` (2026-10-16).
    if (request.packet.length < 12 || request.packet.length > 65_535)
      throw new DnsUnavailableError('DNS outgoing packet size refused');
    return request.protocol === 'udp'
      ? this.exchangeDatagram(request)
      : this.exchangeStream(request);
  }

  private exchangeDatagram(request: DnsExchange): Promise<DnsReply> {
    return new Promise((resolve, reject) => {
      const socket = this.sockets.createDatagram(isIP(request.address) === 4 ? 'udp4' : 'udp6');
      let finished = false;
      let closingFailure: Error | undefined;
      const finish = (reply: DnsReply | Error): void => {
        if (finished) return;
        finished = true;
        request.signal.removeEventListener('abort', abort);
        socket.removeAllListeners('message');
        joinClose(
          this.timers,
          request.hardExpiresAt,
          // Proof: bypassing close acknowledgment failed
          // `lookup cancellation joins deferred UDP closure before it settles` (2026-10-16).
          (acknowledge) => socket.close(acknowledge),
          () => socket.removeAllListeners(),
          () => closingFailure,
          reply,
          resolve,
          reject,
        );
      };
      const abort = (): void => {
        finish(new DnsUnavailableError('DNS UDP exchange cancelled'));
      };
      socket.on('error', (failure: Error) => {
        if (finished) closingFailure = failure;
        else finish(new DnsUnavailableError('DNS UDP exchange failed'));
      });
      socket.on('message', (bytes, peer) => {
        finish({ packet: bytes, peer: peer.address, port: peer.port });
      });
      request.signal.addEventListener('abort', abort, { once: true });
      try {
        socket.connect(53, request.address, () => {
          if (finished) return;
          socket.send(request.packet, (failure) => {
            if (failure !== null) finish(new DnsUnavailableError('DNS UDP send failed'));
          });
        });
      } catch {
        finish(new DnsUnavailableError('DNS UDP connection failed'));
      }
    });
  }

  private exchangeStream(request: DnsExchange): Promise<DnsReply> {
    return new Promise((resolve, reject) => {
      const socket = this.sockets.connectStream({
        host: request.address,
        port: 53,
        family: isIP(request.address) === 4 ? 4 : 6,
      });
      const frame = Buffer.alloc(65_537);
      let received = 0;
      let expected: number | undefined;
      let finished = false;
      let closingFailure: Error | undefined;
      const finish = (reply: DnsReply | Error, closed = false): void => {
        if (finished) return;
        finished = true;
        request.signal.removeEventListener('abort', abort);
        socket.removeAllListeners('data');
        joinClose(
          this.timers,
          request.hardExpiresAt,
          (acknowledge) => {
            if (closed) {
              acknowledge();
              return;
            }
            socket.once('close', acknowledge);
            socket.destroy();
          },
          () => socket.removeAllListeners(),
          () => closingFailure,
          reply,
          resolve,
          reject,
        );
      };
      const abort = (): void => {
        finish(new DnsUnavailableError('DNS TCP exchange cancelled'));
      };
      request.signal.addEventListener('abort', abort, { once: true });
      socket.on('error', (failure: Error) => {
        if (finished) closingFailure = failure;
        else finish(new DnsUnavailableError('DNS TCP exchange failed'));
      });
      socket.on('end', () => {
        finish(new DnsUnavailableError('DNS TCP frame incomplete'));
      });
      socket.on('close', () => {
        if (!finished) finish(new DnsUnavailableError('DNS TCP peer closed'), true);
      });
      socket.once('connect', () => {
        if (finished) return;
        const prefix = Buffer.alloc(2);
        prefix.writeUInt16BE(request.packet.length);
        socket.write(Buffer.concat([prefix, request.packet]));
      });
      socket.on('data', (chunk: Buffer) => {
        // Proof: bypassing native TCP buffer failed
        // `refuses incomplete, trailing and oversized TCP frames` (2026-10-16).
        if (chunk.length > frame.length - received) {
          finish(new DnsUnavailableError('DNS TCP frame oversized'));
          return;
        }
        chunk.copy(frame, received);
        received += chunk.length;
        if (received >= 2 && expected === undefined) expected = frame.readUInt16BE(0) + 2;
        if (expected === undefined) return;
        // Proof: bypassing native TCP span failed
        // `refuses incomplete, trailing and oversized TCP frames` (2026-10-16).
        if (received > expected || expected < 14) {
          finish(new DnsUnavailableError('DNS TCP frame span refused'));
          return;
        }
        if (received !== expected) return;
        const peer = socket.remoteAddress;
        const port = socket.remotePort;
        // Proof: bypassing native TCP metadata failed
        // `refuses a TCP reply without numeric peer metadata: remoteAddress` (2026-10-16).
        if (peer === undefined || port === undefined) {
          finish(new DnsUnavailableError('DNS TCP peer unavailable'));
          return;
        }
        finish({ packet: Buffer.from(frame.subarray(0, received)), peer, port });
      });
    });
  }
}

/** Closure failure is terminal and distinct from an ordinary unavailable DNS exchange. */
function joinClose(
  timers: Timers,
  hardExpiresAt: number,
  close: (acknowledge: () => void) => void,
  releaseListeners: () => void,
  readClosingFailure: () => Error | undefined,
  reply: DnsReply | Error,
  resolve: (reply: DnsReply) => void,
  reject: (failure: Error) => void,
): void {
  // Proof: bypassing cleanup absolute deadline failed
  // `cleanup cannot extend the absolute attempt hard deadline` (2026-10-16).
  // Proof: bypassing bounded join failed
  // `bounds unacknowledged close and names closure as unconfirmed` (2026-10-16).
  const expiresAt = Math.min(timers.nowMs() + 100, hardExpiresAt);
  let settled = false;
  const clear = timers.schedule(Math.max(0, expiresAt - timers.nowMs()), () => {
    settled = true;
    reject(new DnsCleanupError('DNS socket cleanup unconfirmed'));
  });
  // Proof: bypassing TCP close ack failed
  // `TCP publishes no proof until deferred close acknowledgment` (2026-10-16).
  try {
    close(() => {
      // The late acknowledgment still releases listeners after a reported cleanup failure.
      releaseListeners();
      if (settled) return;
      settled = true;
      clear();
      // Proof: bypassing closing error failed
      // `refuses a socket error arriving while successful reply closure is pending` (2026-10-16).
      const closingFailure = readClosingFailure();
      if (closingFailure !== undefined)
        reject(new DnsCleanupError('DNS socket cleanup failed', { cause: closingFailure }));
      else if (timers.nowMs() >= expiresAt)
        reject(new DnsCleanupError('DNS socket cleanup unconfirmed'));
      else if (reply instanceof Error) reject(reply);
      else resolve(reply);
    });
  } catch (cause) {
    settled = true;
    clear();
    reject(new DnsCleanupError('DNS socket cleanup failed', { cause }));
  }
}
