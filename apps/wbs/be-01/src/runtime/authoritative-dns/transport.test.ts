import { EventEmitter } from 'node:events';

import { systemTimers } from '@wbs/runtime-portable';
import { DeadlineClock } from '@wbs/runtime-portable/testing';
import { describe, expect, it } from 'bun:test';
import * as packet from 'dns-packet';

import type { DnsExchange } from './resolver';
import { AuthoritativeDnsResolver } from './resolver';
import { DnsCleanupError, SocketDnsTransport, type SocketFactories } from './transport';

const query = Buffer.from('12340100000100000000000001610000100001', 'hex');
const reply = Buffer.from('12348400000100000000000001610000100001', 'hex');

class Datagram extends EventEmitter {
  closed = false;
  readonly sent: Buffer[] = [];
  private acknowledge: (() => void) | undefined;
  constructor(
    private readonly respond = true,
    private readonly closeFailure = false,
    private readonly deferClose = false,
  ) {
    super();
  }
  connect(port: number, address: string, ready: () => void) {
    expect([address, port]).toEqual(['8.8.8.8', 53]);
    queueMicrotask(ready);
  }
  send(bytes: Buffer, sent: (failure: Error | null) => void) {
    this.sent.push(bytes);
    sent(null);
    if (this.respond)
      queueMicrotask(() => this.emit('message', reply, { address: '8.8.8.8', port: 53 }));
  }
  close(done: () => void) {
    if (this.closeFailure) throw new Error('injected close failure');
    this.acknowledge = () => {
      this.closed = true;
      done();
    };
    if (!this.deferClose) queueMicrotask(() => this.acknowledge?.());
  }
  releaseClose() {
    this.acknowledge?.();
  }
}

class Stream extends EventEmitter {
  closed = false;
  remoteAddress: string | undefined = '8.8.8.8';
  remotePort: number | undefined = 53;
  readonly sent: Buffer[] = [];
  constructor(
    private readonly chunks: readonly Buffer[],
    private readonly abrupt = false,
    private readonly deferClose = false,
  ) {
    super();
    queueMicrotask(() => this.emit('connect'));
  }
  write(bytes: Buffer) {
    this.sent.push(bytes);
    for (const chunk of this.chunks) queueMicrotask(() => this.emit('data', chunk));
    queueMicrotask(() => {
      if (this.abrupt) {
        this.closed = true;
        this.emit('close');
      } else this.emit('end');
    });
  }
  destroy() {
    if (this.closed) return this;
    if (this.deferClose) return this;
    this.closed = true;
    queueMicrotask(() => this.emit('close'));
    return this;
  }
  releaseClose() {
    this.closed = true;
    this.emit('close');
  }
}

function sockets(datagram = new Datagram(), stream = new Stream([])): SocketFactories {
  return {
    createDatagram: (() => datagram) as unknown as SocketFactories['createDatagram'],
    connectStream: (() => stream) as unknown as SocketFactories['connectStream'],
  };
}

function request(protocol: 'udp' | 'tcp', signal = new AbortController().signal): DnsExchange {
  return {
    address: '8.8.8.8',
    protocol,
    packet: query,
    signal,
    hardExpiresAt: systemTimers.nowMs() + 1_000,
  };
}

describe('owned DNS socket transport', () => {
  it('refuses a hostname and invalid outgoing spans before socket allocation', async () => {
    const datagram = new Datagram();
    let allocated = 0;
    const factories = sockets(datagram);
    const transport = new SocketDnsTransport({
      ...factories,
      createDatagram: ((...args: Parameters<SocketFactories['createDatagram']>) => {
        allocated++;
        return factories.createDatagram(...args);
      }) as SocketFactories['createDatagram'],
    });
    for (const outgoing of [
      { ...request('udp'), address: 'dns.example.com' },
      { ...request('udp'), packet: Buffer.alloc(11) },
      { ...request('udp'), packet: Buffer.alloc(65_536) },
    ])
      await expectRejection(transport.exchange(outgoing));
    expect(datagram.sent).toHaveLength(0);
    expect(allocated).toBe(0);
  });
  it.each(['remoteAddress', 'remotePort'] as const)(
    'refuses a TCP reply without numeric peer metadata: %s',
    async (field) => {
      const framed = Buffer.concat([Buffer.from([0, reply.length]), reply]);
      const stream = new Stream([framed]);
      stream[field] = undefined;
      await expectRejection(
        new SocketDnsTransport(sockets(undefined, stream)).exchange(request('tcp')),
        'DNS TCP peer unavailable',
      );
      expect(stream.closed).toBe(true);
    },
  );
  it('TCP publishes no proof until deferred close acknowledgment', async () => {
    const timers = new DeadlineClock();
    const framed = Buffer.concat([Buffer.from([0, reply.length]), reply]);
    const stream = new Stream([framed], false, true);
    let settled = false;
    const pending = new SocketDnsTransport(sockets(undefined, stream), timers)
      .exchange({ ...request('tcp'), hardExpiresAt: 1_000 })
      .then((reply) => {
        settled = true;
        return reply;
      });
    await timers.flush();
    expect(settled).toBe(false);
    expect(stream.closed).toBe(false);
    await timers.advance(50);
    expect(settled).toBe(false);
    stream.releaseClose();
    expect((await pending).packet).toEqual(framed);
    expect(timers.active).toBe(0);
  });
  it('closes UDP before publishing the raw reply and pins the numeric peer', async () => {
    const datagram = new Datagram();
    const transport = new SocketDnsTransport(sockets(datagram));
    expect(await transport.exchange(request('udp'))).toEqual({
      packet: reply,
      peer: '8.8.8.8',
      port: 53,
    });
    expect(datagram.closed).toBe(true);
    expect(datagram.sent).toEqual([query]);
    expect(datagram.listenerCount('message')).toBe(0);
  });

  it('collects a segmented bounded TCP frame and destroys its socket before publishing', async () => {
    const framed = Buffer.concat([Buffer.from([0, reply.length]), reply]);
    const stream = new Stream([framed.subarray(0, 1), framed.subarray(1, 4), framed.subarray(4)]);
    const transport = new SocketDnsTransport(sockets(undefined, stream));
    expect(await transport.exchange(request('tcp'))).toEqual({
      packet: framed,
      peer: '8.8.8.8',
      port: 53,
    });
    expect(stream.closed).toBe(true);
    expect(stream.sent).toEqual([Buffer.concat([Buffer.from([0, query.length]), query])]);
    expect(stream.listenerCount('data')).toBe(0);
  });

  it('abort closes every owned socket and refuses late reply publication', async () => {
    const datagram = new Datagram(false);
    const controller = new AbortController();
    const transport = new SocketDnsTransport(sockets(datagram));
    const pending = transport
      .exchange(request('udp', controller.signal))
      .catch((failure: unknown) => failure);
    controller.abort();
    expect(await pending).toBeInstanceOf(Error);
    expect(datagram.closed).toBe(true);
    datagram.emit('message', reply, { address: '8.8.8.8', port: 53 });
    const fresh = new Datagram();
    await expectRejection(
      new SocketDnsTransport(sockets(fresh)).exchange(request('udp', controller.signal)),
    );
    expect(fresh.sent).toHaveLength(0);
  });

  it.each([
    [Buffer.from([0]), 'DNS TCP frame incomplete'],
    [Buffer.from([0, 0]), 'DNS TCP frame span refused'],
    [
      Buffer.concat([Buffer.from([0, reply.length]), reply.subarray(0, -1)]),
      'DNS TCP frame incomplete',
    ],
    [
      Buffer.concat([Buffer.from([0, reply.length]), reply, Buffer.from([0])]),
      'DNS TCP frame span refused',
    ],
    [Buffer.alloc(65_538), 'DNS TCP frame oversized'],
  ] as const)('refuses incomplete, trailing and oversized TCP frames', async (chunk, message) => {
    const stream = new Stream([chunk]);
    await expectRejection(
      new SocketDnsTransport(sockets(undefined, stream)).exchange(request('tcp')),
      message,
    );
    expect(stream.closed).toBe(true);
  });

  it('reports required UDP cleanup failure loudly', async () => {
    await expectRejection(
      new SocketDnsTransport(sockets(new Datagram(true, true))).exchange(request('udp')),
      'DNS socket cleanup failed',
    );
  });
  it('refuses a socket error arriving while successful reply closure is pending', async () => {
    class FailingClose extends Datagram {
      override close(done: () => void) {
        queueMicrotask(() => this.emit('error', new Error('injected closing error')));
        super.close(done);
      }
    }
    await expectRejection(
      new SocketDnsTransport(sockets(new FailingClose())).exchange(request('udp')),
      'DNS socket cleanup failed',
    );
  });
  it('settles a TCP peer that closes without another close event', async () => {
    const stream = new Stream([], true);
    let settled = false;
    const pending = new SocketDnsTransport(sockets(undefined, stream))
      .exchange(request('tcp'))
      .catch((failure: unknown) => {
        settled = true;
        return failure;
      });
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    expect(settled).toBe(true);
    expect(await pending).toBeInstanceOf(Error);
  });

  it('bounds unacknowledged close and names closure as unconfirmed', async () => {
    const timers = new DeadlineClock();
    const datagram = new Datagram(true, false, true);
    let failure: unknown;
    let settled = false;
    const pending = new SocketDnsTransport(sockets(datagram), timers)
      .exchange({ ...request('udp'), hardExpiresAt: 1_000 })
      .catch((error: unknown) => {
        failure = error;
        settled = true;
      });
    await timers.flush();
    await timers.advance(99);
    expect(settled).toBe(false);
    await timers.advance(1);
    expect(settled).toBe(true);
    await pending;
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('cleanup unconfirmed');
    expect(datagram.closed).toBe(false);
    expect(timers.active).toBe(0);
    datagram.emit('error', new Error('late socket failure'));
    datagram.releaseClose();
    expect(datagram.closed).toBe(true);
  });

  it('cleanup cannot extend the absolute attempt hard deadline', async () => {
    const timers = new DeadlineClock();
    const datagram = new Datagram(true, false, true);
    let settled = false;
    const pending = new SocketDnsTransport(sockets(datagram), timers)
      .exchange({ ...request('udp'), hardExpiresAt: 50 })
      .catch((failure: unknown) => {
        settled = true;
        return failure;
      });
    await timers.flush();
    await timers.advance(49);
    expect(settled).toBe(false);
    await timers.advance(1);
    expect(settled).toBe(true);
    expect(await pending).toBeInstanceOf(DnsCleanupError);
    expect(timers.active).toBe(0);
    datagram.releaseClose();
  });

  it('network stops by 4800ms and unconfirmed closure settles by 4900ms before the HTTP guard', async () => {
    const timers = new DeadlineClock();
    const datagram = new Datagram(false, false, true);
    let calls = 0;
    let settled = false;
    const native = new SocketDnsTransport(sockets(datagram), timers);
    const resolver = new AuthoritativeDnsResolver(
      ['8.8.8.8'],
      {
        exchange: async (request) => {
          calls++;
          if (calls > 5) return native.exchange(request);
          return new Promise((resolve) =>
            timers.schedule(800, () => {
              const query = packet.decode(request.packet);
              resolve({
                packet: packet.encode({
                  id: query.id,
                  type: 'response',
                  questions: query.questions,
                  answers: [],
                }),
                peer: request.address,
                port: 53,
              });
            }),
          );
        },
      },
      timers,
    );
    const pending = resolver
      .lookupTxt('_wbs-verification.one.two.three.four.five.com', new AbortController().signal)
      .catch((failure: unknown) => {
        settled = true;
        return failure;
      });
    await timers.flush();
    await timers.advance(4_799);
    expect(settled).toBe(false);
    expect(datagram.closed).toBe(false);
    await timers.advance(1);
    expect(settled).toBe(false);
    await timers.advance(99);
    expect(settled).toBe(false);
    await timers.advance(1);
    expect(settled).toBe(true);
    expect(await pending).toBeInstanceOf(DnsCleanupError);
    expect(calls).toBe(6);
    expect(timers.active).toBe(0);
    datagram.releaseClose();
  });

  it('lookup cancellation joins deferred UDP closure before it settles', async () => {
    const timers = new DeadlineClock();
    const datagram = new Datagram(false, false, true);
    const controller = new AbortController();
    const resolver = new AuthoritativeDnsResolver(
      ['8.8.8.8'],
      new SocketDnsTransport(sockets(datagram), timers),
      timers,
    );
    let settled = false;
    const pending = resolver
      .lookupTxt('_wbs-verification.example.com', controller.signal)
      .catch((failure: unknown) => {
        settled = true;
        return failure;
      });
    await timers.flush();
    controller.abort();
    await timers.flush();
    expect(settled).toBe(false);
    expect(datagram.closed).toBe(false);
    await timers.advance(50);
    expect(settled).toBe(false);
    datagram.releaseClose();
    expect(await pending).toBeInstanceOf(Error);
    expect(datagram.closed).toBe(true);
    expect(timers.active).toBe(0);
  });

  it('cleanup failure after abort wins over the deadline and refuses fallback', async () => {
    const timers = new DeadlineClock();
    const datagram = new Datagram(false, true);
    const controller = new AbortController();
    const resolver = new AuthoritativeDnsResolver(
      ['8.8.8.8', '1.1.1.1'],
      new SocketDnsTransport(sockets(datagram), timers),
      timers,
    );
    const pending = resolver
      .lookupTxt('_wbs-verification.example.com', controller.signal)
      .catch((failure: unknown) => failure);
    await timers.flush();
    controller.abort();
    expect(await pending).toBeInstanceOf(DnsCleanupError);
    expect(datagram.sent).toHaveLength(1);
    expect(timers.active).toBe(0);
  });
});

async function expectRejection(pending: Promise<unknown>, message?: string): Promise<void> {
  const failure: unknown = await pending.catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  if (message !== undefined && failure instanceof Error) expect(failure.message).toContain(message);
}
