import { DeadlineClock } from '@wbs/runtime-portable/testing';
import { describe, expect, it, spyOn } from 'bun:test';
import * as packet from 'dns-packet';

import { DnsUnavailableError } from './failures';
import { AuthoritativeDnsResolver, type DnsExchange, type DnsReply } from './resolver';
import { DnsCleanupError } from './transport';

const owner = '_wbs-verification.example.com';
const soa: packet.SoaAnswer = {
  name: 'example.com',
  type: 'SOA',
  ttl: 60,
  data: {
    mname: 'ns.example.com',
    rname: 'hostmaster.example.com',
    serial: 1,
    refresh: 2,
    retry: 3,
    expire: 4,
    minimum: 5,
  },
};

function answer(request: DnsExchange, overrides: Partial<packet.Packet> = {}): DnsReply {
  const query = packet.decode(request.packet);
  const question = query.questions![0];
  let answers: packet.Answer[];
  if (question.type === 'NS')
    answers = [{ name: question.name, type: 'NS', ttl: 60, data: 'ns.example.com' }];
  else if (question.type === 'A')
    answers = [{ name: question.name, type: 'A', ttl: 60, data: '8.8.8.8' }];
  else if (question.type === 'AAAA') answers = [];
  else
    answers = [
      {
        name: question.name,
        type: 'TXT',
        ttl: 60,
        data: [Buffer.from('proof-'), Buffer.from('A')],
      },
      { name: question.name, type: 'TXT', ttl: 60, data: [Buffer.from('other')] },
    ];
  const bytes = packet.encode({
    id: query.id,
    type: 'response',
    flags: packet.AUTHORITATIVE_ANSWER,
    questions: [question],
    answers,
    ...overrides,
  });
  return {
    packet:
      request.protocol === 'tcp'
        ? Buffer.concat([Buffer.from([bytes.length >>> 8, bytes.length & 255]), bytes])
        : bytes,
    peer: request.address,
    port: 53,
  };
}

function fixture(change: (request: DnsExchange) => DnsReply | Promise<DnsReply> = answer) {
  const requests: DnsExchange[] = [];
  const resolver = new AuthoritativeDnsResolver(['10.0.0.53'], {
    exchange: async (request) => {
      await Promise.resolve();
      requests.push(request);
      return change(request);
    },
  });
  return { resolver, requests };
}

describe('authoritative DNS resolver production boundary', () => {
  it('rejects invalid owner input before any packet and refuses configured hostnames', async () => {
    const { resolver, requests } = fixture();
    for (const name of [
      'example.com',
      '_wbs-verification.EXAMPLE.com',
      `_wbs-verification.${'a'.repeat(64)}.com`,
    ])
      await expectRejection(resolver.lookupTxt(name, new AbortController().signal));
    expect(requests).toHaveLength(0);
    expect(
      () =>
        new AuthoritativeDnsResolver(['dns.example.com'], {
          exchange: async () => Promise.reject(new Error('unexpected socket')),
        }),
    ).toThrow();
  });

  it('rejects corrupted UTF-8 returned by the trusted codec after wire validation', async () => {
    const original = packet.decode;
    const decode = spyOn(packet, 'decode').mockImplementation(
      Object.assign(
        (bytes: Buffer) => {
          const reply = original(bytes);
          packet.decode.bytes = original.bytes;
          if (reply.type === 'response')
            for (const record of reply.answers ?? [])
              if (record.type === 'TXT') record.data = [Buffer.from([0xc3, 0x28])];
          return reply;
        },
        { bytes: 0 },
      ),
    );
    try {
      const { resolver } = fixture();
      await expectRejection(resolver.lookupTxt(owner, new AbortController().signal));
    } finally {
      decode.mockRestore();
    }
  });

  it('preserves BOM, whitespace, case and duplicate TXT records', async () => {
    const text = '\ufeff MixedCase ';
    const { resolver } = fixture((request) =>
      packet.decode(request.packet).questions![0].type === 'TXT'
        ? answer(request, {
            answers: [
              { name: owner, type: 'TXT', ttl: 60, data: [Buffer.from(text)] },
              { name: owner, type: 'TXT', ttl: 60, data: [Buffer.from(text)] },
            ],
          })
        : answer(request),
    );
    expect(await resolver.lookupTxt(owner, new AbortController().signal)).toEqual([text, text]);
  });
  it('sanitizes pre-abort reasons and sends no packets', async () => {
    const { resolver, requests } = fixture();
    const controller = new AbortController();
    controller.abort('wbs-domain-verification=private-challenge');
    const failure: unknown = await resolver
      .lookupTxt(owner, controller.signal)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain('private-challenge');
    expect(requests).toHaveLength(0);
  });

  it('starts no new exchange after the clock passes a delayed lookup work timer', async () => {
    const timers = new DeadlineClock();
    let instant = 0;
    const requests: DnsExchange[] = [];
    const resolver = new AuthoritativeDnsResolver(
      ['10.0.0.53', '10.0.0.54'],
      {
        exchange: async (request) => {
          await Promise.resolve();
          requests.push(request);
          instant = 4_801;
          return answer(request);
        },
      },
      { nowMs: () => instant, schedule: timers.schedule },
    );
    await expectRejection(resolver.lookupTxt(owner, new AbortController().signal));
    expect(requests).toHaveLength(1);
    expect(timers.active).toBe(0);
  });
  it('discovers a delegated verification owner and joins only fragments of one TXT record', async () => {
    const { resolver, requests } = fixture();
    expect(await resolver.lookupTxt(owner, new AbortController().signal)).toEqual([
      'proof-A',
      'other',
    ]);
    expect(
      requests.map((request) => [
        request.address,
        packet.decode(request.packet).questions![0].type,
        packet.decode(request.packet).flag_rd,
      ]),
    ).toEqual([
      ['10.0.0.53', 'NS', true],
      ['10.0.0.53', 'A', true],
      ['10.0.0.53', 'AAAA', true],
      ['8.8.8.8', 'TXT', false],
    ]);
  });

  it('does not climb after unresolved discovery failure', async () => {
    const { resolver, requests } = fixture(() => {
      throw new Error('fixture unavailable');
    });
    await expectRejection(resolver.lookupTxt(owner, new AbortController().signal));
    expect(requests).toHaveLength(1);
    expect(packet.decode(requests[0].packet).questions![0].name).toBe(owner);
  });
  it.each(['alias', 'owner', 'invalid_ns', 'nxdomain_answer'] as const)(
    'refuses invalid recursive authority evidence: %s',
    async (fault) => {
      const { resolver, requests } = fixture((request) => {
        const question = packet.decode(request.packet).questions![0];
        if (question.type !== 'NS') return answer(request);
        if (fault === 'alias')
          return answer(request, {
            additionals: [{ name: owner, type: 'CNAME', ttl: 60, data: 'other.example.com' }],
          });
        if (fault === 'owner')
          return answer(request, {
            answers: [{ name: 'other.example.com', type: 'NS', ttl: 60, data: 'ns.example.com' }],
          });
        if (fault === 'invalid_ns')
          return answer(request, {
            answers: [{ name: question.name, type: 'NS', ttl: 60, data: '_bad.example.com' }],
          });
        return answer(request, { flags: 3 });
      });
      await expectRejection(resolver.lookupTxt(owner, new AbortController().signal));
      expect(requests).toHaveLength(1);
    },
  );

  it.each([2, 3, 5])('refuses a non-NOERROR authoritative proof with rcode %d', async (rcode) => {
    const { resolver } = fixture((request) =>
      packet.decode(request.packet).questions![0].type === 'TXT'
        ? answer(request, { flags: packet.AUTHORITATIVE_ANSWER | rcode })
        : answer(request),
    );
    await expectRejection(resolver.lookupTxt(owner, new AbortController().signal));
  });

  it('reports validated NS absence and address absence without sending an authoritative packet', async () => {
    for (const absent of ['NS', 'A'] as const) {
      const { resolver, requests } = fixture((request) => {
        const type = packet.decode(request.packet).questions![0].type;
        return absent === 'NS' || type === 'A' || type === 'AAAA'
          ? answer(request, { answers: [] })
          : answer(request);
      });
      const failure: unknown = await resolver
        .lookupTxt(owner, new AbortController().signal)
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(DnsUnavailableError);
      expect(requests.every((request) => request.address === '10.0.0.53')).toBe(true);
    }
  });
  it('does not hide required cleanup failure with another resolver', async () => {
    const resolver = new AuthoritativeDnsResolver(['10.0.0.53', '10.0.0.54'], {
      exchange: async (request) => {
        await Promise.resolve();
        if (request.address === '10.0.0.53') throw new DnsCleanupError('DNS socket cleanup failed');
        return answer(request);
      },
    });
    await expectRejection(
      resolver.lookupTxt(owner, new AbortController().signal),
      'DNS socket cleanup failed',
    );
  });
  it.each(['NS', 'A'] as const)('rejects oversized authority sets: %s', async (type) => {
    const { resolver, requests } = fixture((request) => {
      const question = packet.decode(request.packet).questions![0];
      if (question.type !== type) return answer(request);
      const answers: packet.Answer[] =
        type === 'NS'
          ? Array.from({ length: 9 }, (_, index) => ({
              name: question.name,
              type: 'NS',
              ttl: 60,
              data: `ns${String(index)}.example.com`,
            }))
          : Array.from({ length: 17 }, (_, index) => ({
              name: question.name,
              type: 'A',
              ttl: 60,
              data: `8.8.4.${String(index + 1)}`,
            }));
      return answer(request, { answers });
    });
    await expectRejection(resolver.lookupTxt(owner, new AbortController().signal));
    expect(requests.every((request) => request.address === '10.0.0.53')).toBe(true);
  });

  it('tries the next configured recursive resolver only after modeled failure', async () => {
    const requests: DnsExchange[] = [];
    const resolver = new AuthoritativeDnsResolver(['10.0.0.53', '10.0.0.54'], {
      exchange: async (request) => {
        await Promise.resolve();
        requests.push(request);
        return request.address === '10.0.0.53'
          ? answer(request, { flags: 2, answers: [] })
          : answer(request);
      },
    });
    expect(await resolver.lookupTxt(owner, new AbortController().signal)).toEqual([
      'proof-A',
      'other',
    ]);
    expect(
      requests
        .slice(0, 2)
        .map((request) => [request.address, packet.decode(request.packet).questions![0].name]),
    ).toEqual([
      ['10.0.0.53', owner],
      ['10.0.0.54', owner],
    ]);
  });

  it('does not reinterpret an unexpected transport failure as a retryable outage', async () => {
    let calls = 0;
    const failure = new TypeError('unexpected transport bug');
    const resolver = new AuthoritativeDnsResolver(['10.0.0.53', '10.0.0.54'], {
      exchange: async () => {
        await Promise.resolve();
        calls++;
        throw failure;
      },
    });
    expect(
      await resolver
        .lookupTxt(owner, new AbortController().signal)
        .catch((error: unknown) => error),
    ).toBe(failure);
    expect(calls).toBe(1);
  });

  it.each(['recursive', 'authoritative'] as const)(
    'retries a timed-out %s peer after acknowledged cancellation',
    async (stage) => {
      const timers = new DeadlineClock();
      const requests: DnsExchange[] = [];
      const resolver = new AuthoritativeDnsResolver(
        ['10.0.0.53', '10.0.0.54'],
        {
          exchange: async (request) => {
            await Promise.resolve();
            requests.push(request);
            const question = packet.decode(request.packet).questions![0];
            if (
              (stage === 'recursive' && request.address === '10.0.0.53') ||
              (stage === 'authoritative' && request.address === '8.8.8.8')
            )
              return new Promise((_resolve, reject) => {
                request.signal.addEventListener(
                  'abort',
                  () => {
                    reject(new DnsUnavailableError('fixture timeout'));
                  },
                  { once: true },
                );
              });
            if (stage === 'authoritative' && question.type === 'A')
              return answer(request, {
                answers: [
                  { name: question.name, type: 'A', ttl: 60, data: '8.8.8.8' },
                  { name: question.name, type: 'A', ttl: 60, data: '9.9.9.9' },
                ],
              });
            return answer(request);
          },
        },
        timers,
      );
      let settled = false;
      const pending = resolver.lookupTxt(owner, new AbortController().signal).then(
        (values) => {
          settled = true;
          return values;
        },
        (failure: unknown) => {
          settled = true;
          return failure;
        },
      );
      await timers.flush();
      await timers.advance(stage === 'recursive' ? 2700 : 900);
      expect(settled).toBe(true);
      expect(await pending).toEqual(['proof-A', 'other']);
      expect(
        requests.some(
          (request) => request.address === (stage === 'recursive' ? '10.0.0.54' : '9.9.9.9'),
        ),
      ).toBe(true);
      expect(timers.active).toBe(0);
    },
  );

  it('climbs only after validated absence and never consumes unsolicited glue', async () => {
    const { resolver, requests } = fixture((request) => {
      const question = packet.decode(request.packet).questions![0];
      if (question.type === 'NS' && question.name === owner)
        return answer(request, {
          answers: [],
          additionals: [{ name: 'ns.example.com', type: 'A', ttl: 60, data: '127.0.0.1' }],
        });
      return answer(request);
    });
    expect(await resolver.lookupTxt(owner, new AbortController().signal)).toEqual([
      'proof-A',
      'other',
    ]);
    expect(requests.map((request) => packet.decode(request.packet).questions![0].name)).toEqual([
      owner,
      'example.com',
      'ns.example.com',
      'ns.example.com',
      owner,
    ]);
    expect(requests.every((request) => request.address !== '127.0.0.1')).toBe(true);
  });

  it.each(['127.0.0.1', '10.0.0.1', '::ffff:127.0.0.1', '2001:db8::1'])(
    'refuses special-purpose and mapped endpoints through lookup %s',
    async (address) => {
      const { resolver, requests } = fixture((request) => {
        const question = packet.decode(request.packet).questions![0];
        if (question.type === (address.includes(':') ? 'AAAA' : 'A'))
          return answer(request, {
            answers: [{ name: question.name, type: question.type as 'A', ttl: 60, data: address }],
          });
        return answer(request);
      });
      await expectRejection(resolver.lookupTxt(owner, new AbortController().signal));
      expect(requests.every((request) => request.address === '10.0.0.53')).toBe(true);
    },
  );

  it.each(['peer', 'port', 'id', 'name', 'class', 'type', 'opcode', 'query'] as const)(
    'rejects unrelated DNS replies: %s',
    async (fault) => {
      const { resolver } = fixture((request) => {
        if (packet.decode(request.packet).questions![0].type !== 'TXT') return answer(request);
        const reply = answer(request);
        if (fault === 'peer') return { ...reply, peer: '1.1.1.1' };
        if (fault === 'port') return { ...reply, port: 54 };
        const bytes = reply.packet;
        if (fault === 'id') bytes.writeUInt16BE((bytes.readUInt16BE(0) + 1) & 65535, 0);
        if (fault === 'name') bytes[31] = 120;
        if (fault === 'class') bytes.writeUInt16BE(3, 45);
        if (fault === 'type') bytes.writeUInt16BE(1, 43);
        if (fault === 'opcode') bytes.writeUInt16BE(0x8c00, 2);
        if (fault === 'query') bytes.writeUInt16BE(0x0400, 2);
        return reply;
      });
      await expectRejection(resolver.lookupTxt(owner, new AbortController().signal));
    },
  );

  it.each([
    'aa',
    'owner',
    'alias',
    'ancestor_alias',
    'additional',
    'authority_txt',
    'referral',
  ] as const)('requires authoritative exact-owner answers: %s', async (fault) => {
    const { resolver } = fixture((request) => {
      if (packet.decode(request.packet).questions![0].type !== 'TXT') return answer(request);
      if (fault === 'aa') return answer(request, { flags: 0 });
      if (fault === 'owner')
        return answer(request, {
          answers: [
            { name: 'other.example.com', type: 'TXT', ttl: 60, data: [Buffer.from('proof-A')] },
          ],
        });
      if (fault === 'alias' || fault === 'ancestor_alias')
        return answer(request, {
          additionals: [
            {
              name: fault === 'alias' ? owner : 'example.com',
              type: fault === 'ancestor_alias' ? 'DNAME' : 'CNAME',
              ttl: 60,
              data: 'other.example.com',
            },
          ],
        });
      if (fault === 'additional')
        return answer(request, {
          answers: [],
          authorities: [soa],
          additionals: [{ name: owner, type: 'TXT', ttl: 60, data: [Buffer.from('proof-A')] }],
        });
      if (fault === 'authority_txt')
        return answer(request, {
          answers: [],
          authorities: [soa, { name: owner, type: 'TXT', ttl: 60, data: [Buffer.from('proof-A')] }],
        });
      return answer(request, {
        answers: [],
        authorities: [{ name: 'example.com', type: 'NS', ttl: 60, data: 'ns.example.com' }],
      });
    });
    await expectRejection(resolver.lookupTxt(owner, new AbortController().signal));
  });

  it.each([0, 3])(
    'accepts authoritative negative only with enclosing SOA: rcode %d',
    async (rcode) => {
      const { resolver } = fixture((request) =>
        packet.decode(request.packet).questions![0].type === 'TXT'
          ? answer(request, {
              flags: packet.AUTHORITATIVE_ANSWER | rcode,
              answers: [],
              authorities: [soa],
            })
          : answer(request),
      );
      expect(await resolver.lookupTxt(owner, new AbortController().signal)).toEqual([]);
      const missing = fixture((request) =>
        packet.decode(request.packet).questions![0].type === 'TXT'
          ? answer(request, { flags: packet.AUTHORITATIVE_ANSWER | rcode, answers: [] })
          : answer(request),
      );
      await expectRejection(missing.resolver.lookupTxt(owner, new AbortController().signal));
    },
  );

  it('retries matching truncated UDP using complete TCP within one endpoint attempt', async () => {
    const { resolver, requests } = fixture((request) => {
      if (packet.decode(request.packet).questions![0].type !== 'TXT' || request.protocol === 'tcp')
        return answer(request);
      const reply = answer(request, {
        flags: packet.AUTHORITATIVE_ANSWER | packet.TRUNCATED_RESPONSE,
      });
      return { ...reply, packet: reply.packet.subarray(0, 47) };
    });
    expect(await resolver.lookupTxt(owner, new AbortController().signal)).toEqual([
      'proof-A',
      'other',
    ]);
    expect(requests.slice(-2).map((request) => [request.address, request.protocol])).toEqual([
      ['8.8.8.8', 'udp'],
      ['8.8.8.8', 'tcp'],
    ]);
    expect(requests.at(-1)!.signal).toBe(requests.at(-2)!.signal);
  });
  it('late UDP truncation and joined cleanup cannot restart the TCP attempt deadline', async () => {
    const timers = new DeadlineClock();
    const requests: DnsExchange[] = [];
    const resolver = new AuthoritativeDnsResolver(
      ['10.0.0.53'],
      {
        exchange: async (request) => {
          await Promise.resolve();
          requests.push(request);
          if (packet.decode(request.packet).questions![0].type !== 'TXT') return answer(request);
          if (request.protocol === 'udp')
            return new Promise((resolve) =>
              timers.schedule(850, () => {
                resolve(
                  answer(request, {
                    flags: packet.AUTHORITATIVE_ANSWER | packet.TRUNCATED_RESPONSE,
                  }),
                );
              }),
            );
          return new Promise((_resolve, reject) => {
            request.signal.addEventListener(
              'abort',
              () => {
                timers.schedule(50, () => {
                  reject(new DnsUnavailableError('joined delayed TCP closure'));
                });
              },
              { once: true },
            );
          });
        },
      },
      timers,
    );
    let settled = false;
    const pending = resolver
      .lookupTxt(owner, new AbortController().signal)
      .catch((failure: unknown) => {
        settled = true;
        return failure;
      });
    await timers.flush();
    await timers.advance(850);
    const attempts = requests.filter(
      (request) => packet.decode(request.packet).questions![0].type === 'TXT',
    );
    expect(attempts.map((request) => request.protocol)).toEqual(['udp', 'tcp']);
    expect(attempts[0].signal).toBe(attempts[1].signal);
    expect(attempts.map((request) => request.hardExpiresAt)).toEqual([1000, 1000]);
    await timers.advance(50);
    expect(attempts[1].signal.aborted).toBe(true);
    expect(settled).toBe(false);
    await timers.advance(50);
    expect(settled).toBe(true);
    expect(await pending).toBeInstanceOf(DnsUnavailableError);
    expect(timers.active).toBe(0);
  });
  it('concurrent lookups refuse each others wire replies', async () => {
    const pending: { request: DnsExchange; resolve: (reply: DnsReply) => void }[] = [];
    const resolver = new AuthoritativeDnsResolver(['10.0.0.53'], {
      exchange: async (request) =>
        new Promise((resolve) => {
          pending.push({ request, resolve });
          if (pending.length === 2) {
            pending[0].resolve(answer(pending[1].request));
            pending[1].resolve(answer(pending[0].request));
          }
        }),
    });
    const replies = await Promise.all([
      resolver
        .lookupTxt('_wbs-verification.first.example.com', new AbortController().signal)
        .catch((failure: unknown) => failure),
      resolver
        .lookupTxt('_wbs-verification.second.example.com', new AbortController().signal)
        .catch((failure: unknown) => failure),
    ]);
    for (const reply of replies) expect(reply).toBeInstanceOf(DnsUnavailableError);
    expect(pending).toHaveLength(2);
  });
  it('refuses a truncated UDP question with wrong class before TCP fallback', async () => {
    const { resolver, requests } = fixture((request) => {
      if (packet.decode(request.packet).questions![0].type !== 'TXT' || request.protocol === 'tcp')
        return answer(request);
      const reply = answer(request, {
        flags: packet.AUTHORITATIVE_ANSWER | packet.TRUNCATED_RESPONSE,
      });
      reply.packet.writeUInt16BE(3, 45);
      return reply;
    });
    await expectRejection(resolver.lookupTxt(owner, new AbortController().signal));
    expect(requests.some((request) => request.protocol === 'tcp')).toBe(false);
  });

  it('rejects incorrect TCP length even when its DNS payload matches', async () => {
    const { resolver } = fixture((request) => {
      if (packet.decode(request.packet).questions![0].type !== 'TXT') return answer(request);
      if (request.protocol === 'udp')
        return answer(request, { flags: packet.AUTHORITATIVE_ANSWER | packet.TRUNCATED_RESPONSE });
      const reply = answer(request);
      reply.packet.writeUInt16BE(reply.packet.readUInt16BE(0) + 1, 0);
      return reply;
    });
    await expectRejection(resolver.lookupTxt(owner, new AbortController().signal));
  });

  it('shares five seconds across discovery and retries and releases every timer', async () => {
    const timers = new DeadlineClock();
    const requests: DnsExchange[] = [];
    const resolver = new AuthoritativeDnsResolver(
      ['10.0.0.53', '10.0.0.54', '10.0.0.55'],
      {
        exchange: async (request) => {
          await Promise.resolve();
          requests.push(request);
          return new Promise((resolve, reject) => {
            const clear = timers.schedule(800, () => {
              resolve(answer(request, { answers: [] }));
            });
            request.signal.addEventListener(
              'abort',
              () => {
                clear();
                reject(new Error('cancelled fixture'));
              },
              { once: true },
            );
          });
        },
      },
      timers,
    );
    const lookup = resolver.lookupTxt(
      '_wbs-verification.one.two.three.four.five.com',
      new AbortController().signal,
    );
    let settled = false;
    const observed = lookup.catch((failure: unknown) => {
      settled = true;
      return failure;
    });
    await timers.flush();
    await timers.advance(5_000);
    expect(settled).toBe(true);
    expect(await observed).toBeInstanceOf(Error);
    expect(timers.nowMs()).toBe(5_000);
    expect(requests).toHaveLength(6);
    expect(timers.active).toBe(0);
  });

  it('bounds one endpoint attempt and ignores late replies after abort', async () => {
    const timers = new DeadlineClock();
    let reply: (() => void) | undefined;
    const requests: DnsExchange[] = [];
    const resolver = new AuthoritativeDnsResolver(
      ['10.0.0.53'],
      {
        exchange: async (request) => {
          await Promise.resolve();
          requests.push(request);
          return new Promise((resolve) => {
            reply = () => {
              resolve(answer(request));
            };
          });
        },
      },
      timers,
    );
    const lookup = resolver.lookupTxt(owner, new AbortController().signal);
    let settled = false;
    const observed = lookup.catch((failure: unknown) => {
      settled = true;
      return failure;
    });
    await timers.flush();
    await timers.advance(1_000);
    expect(settled).toBe(true);
    expect(await observed).toBeInstanceOf(Error);
    expect(requests).toHaveLength(1);
    expect(requests[0].signal.aborted).toBe(true);
    reply?.();
    await timers.flush();
    expect(timers.active).toBe(0);
  });

  it('pre-abort sends no packet and in-flight abort propagates to every owned attempt', async () => {
    const timers = new DeadlineClock();
    const controller = new AbortController();
    const requests: DnsExchange[] = [];
    const resolver = new AuthoritativeDnsResolver(
      ['10.0.0.53'],
      {
        exchange: async (request) => {
          await Promise.resolve();
          requests.push(request);
          return new Promise((_resolve, reject) => {
            request.signal.addEventListener(
              'abort',
              () => {
                reject(new Error('aborted'));
              },
              {
                once: true,
              },
            );
          });
        },
      },
      timers,
    );
    const lookup = resolver.lookupTxt(owner, controller.signal);
    const observed = lookup.catch((failure: unknown) => failure);
    await timers.flush();
    controller.abort();
    expect(await observed).toBeInstanceOf(Error);
    expect(requests[0].signal.aborted).toBe(true);
    expect(timers.active).toBe(0);
    await expectRejection(resolver.lookupTxt(owner, controller.signal));
    expect(requests).toHaveLength(1);
  });
});

async function expectRejection(pending: Promise<unknown>, message?: string): Promise<void> {
  const failure: unknown = await pending.catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  if (message !== undefined && failure instanceof Error) expect(failure.message).toContain(message);
}
