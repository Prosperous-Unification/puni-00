import { expect, it } from 'bun:test';
import * as packet from 'dns-packet';

import { DnsUnavailableError } from './failures';
import { AuthoritativeDnsResolver, type DnsExchange, type DnsReply } from './resolver';

const owner = '_wbs-verification.example.com';
const resolvers = ['10.0.0.53', '10.0.0.54'];
const soa: packet.SoaAnswer = {
  name: 'com',
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
type RoutingType = 'NS' | 'A' | 'AAAA';

function positive(name: string, type: RoutingType): packet.StringAnswer {
  return {
    name,
    type,
    ttl: 60,
    data: type === 'NS' ? 'ns.example.com' : type === 'A' ? '8.8.8.8' : '2606:4700:4700::1111',
  };
}

function reply(request: DnsExchange, overrides: Partial<packet.Packet> = {}): DnsReply {
  const query = packet.decode(request.packet);
  const question = query.questions![0];
  const answers: packet.Answer[] =
    question.type === 'TXT'
      ? [{ name: question.name, type: 'TXT', ttl: 60, data: [Buffer.from('proof')] }]
      : [positive(question.name, question.type as RoutingType)];
  return {
    packet: packet.encode({
      id: query.id,
      type: 'response',
      flags: 0,
      questions: [question],
      answers,
      ...overrides,
    }),
    peer: request.address,
    port: 53,
  };
}

const faults = [
  'referral',
  'incomplete',
  'empty',
  'nxdomain_without_soa',
  'authority_positive',
  'additional_positive',
  'wrong_class_soa',
  'non_enclosing_soa',
  'additional_soa',
  'alias',
  'ancestor_alias',
  'contradictory_negative',
  'wrong_owner',
  'wrong_class_positive',
] as const;

for (const type of ['NS', 'A', 'AAAA'] as const) {
  it.each([...faults])(
    `requires terminal negatives for recursive discovery ${type}: %s`,
    async (fault) => {
      const requests: DnsExchange[] = [];
      const resolver = new AuthoritativeDnsResolver(resolvers, {
        exchange: async (request) => {
          await Promise.resolve();
          requests.push(request);
          const question = packet.decode(request.packet).questions![0];
          if (question.type !== type) return reply(request);
          if (fault === 'incomplete') {
            const incoming = reply(request);
            return { ...incoming, packet: incoming.packet.subarray(0, incoming.packet.length - 1) };
          }
          const record = positive(question.name, type);
          const negative: Partial<packet.Packet> = { answers: [], authorities: [soa] };
          if (fault === 'referral')
            negative.authorities = [
              { name: 'example.com', type: 'NS', ttl: 60, data: 'ns.example.com' },
            ];
          if (fault === 'empty' || fault === 'nxdomain_without_soa') negative.authorities = [];
          if (fault === 'nxdomain_without_soa') negative.flags = 3;
          if (fault === 'authority_positive') negative.authorities = [record];
          if (fault === 'additional_positive') {
            negative.authorities = [];
            negative.additionals = [record];
          }
          if (fault === 'wrong_class_soa') negative.authorities = [{ ...soa, class: 'CH' }];
          if (fault === 'non_enclosing_soa') negative.authorities = [{ ...soa, name: 'other.net' }];
          if (fault === 'additional_soa') {
            negative.authorities = [];
            negative.additionals = [soa];
          }
          if (fault === 'alias' || fault === 'ancestor_alias')
            negative.additionals = [
              {
                name: fault === 'alias' ? question.name : 'example.com',
                type: fault === 'alias' ? 'CNAME' : 'DNAME',
                ttl: 60,
                data: 'other.example.com',
              },
            ];
          if (fault === 'contradictory_negative') {
            negative.flags = 3;
            negative.answers = [record];
          }
          if (fault === 'wrong_owner')
            negative.answers = [{ ...record, name: 'other.example.com' }];
          if (fault === 'wrong_class_positive') negative.answers = [{ ...record, class: 'CH' }];
          return reply(request, negative);
        },
      });
      const failure: unknown = await resolver
        .lookupTxt(owner, new AbortController().signal)
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(DnsUnavailableError);
      const unresolved = requests.filter(
        (request) => packet.decode(request.packet).questions![0].type === type,
      );
      expect(
        unresolved.map((request) => [
          request.address,
          packet.decode(request.packet).questions![0].name,
        ]),
      ).toEqual(resolvers.map((address) => [address, type === 'NS' ? owner : 'ns.example.com']));
      expect(requests.at(-1)).toBe(unresolved.at(-1));
      expect(
        requests.every((request) => packet.decode(request.packet).questions![0].type !== 'TXT'),
      ).toBe(true);
      expect(
        requests
          .filter((request) => packet.decode(request.packet).questions![0].type === 'NS')
          .every((request) => packet.decode(request.packet).questions![0].name === owner),
      ).toBe(true);
    },
  );

  it(`does not treat recursive referrals as absence ${type} when a later resolver answers`, async () => {
    const requests: DnsExchange[] = [];
    const resolver = new AuthoritativeDnsResolver(resolvers, {
      exchange: async (request) => {
        await Promise.resolve();
        requests.push(request);
        const question = packet.decode(request.packet).questions![0];
        if (question.type === type && request.address === resolvers[0])
          return reply(request, {
            answers: [],
            authorities: [{ name: 'example.com', type: 'NS', ttl: 60, data: 'ns.example.com' }],
          });
        return reply(
          request,
          question.type === 'TXT' ? { flags: packet.AUTHORITATIVE_ANSWER } : {},
        );
      },
    });
    expect(await resolver.lookupTxt(owner, new AbortController().signal)).toEqual(['proof']);
    const attempts = requests.filter(
      (request) => packet.decode(request.packet).questions![0].type === type,
    );
    expect(attempts.map((request) => request.address)).toEqual(resolvers);
    expect(attempts.map((request) => packet.decode(request.packet).questions![0].name)).toEqual([
      type === 'NS' ? owner : 'ns.example.com',
      type === 'NS' ? owner : 'ns.example.com',
    ]);
  });

  it.each([0, 3])(
    `accepts a later resolver terminal negative after referral ${type}: rcode %d`,
    async (rcode) => {
      const requests: DnsExchange[] = [];
      const resolver = new AuthoritativeDnsResolver(resolvers, {
        exchange: async (request) => {
          await Promise.resolve();
          requests.push(request);
          const question = packet.decode(request.packet).questions![0];
          if (question.type === type && (type !== 'NS' || question.name === owner))
            return request.address === resolvers[0]
              ? reply(request, {
                  answers: [],
                  authorities: [
                    { name: 'example.com', type: 'NS', ttl: 60, data: 'ns.example.com' },
                  ],
                })
              : reply(request, { flags: rcode, answers: [], authorities: [soa] });
          return reply(
            request,
            question.type === 'TXT' ? { flags: packet.AUTHORITATIVE_ANSWER } : {},
          );
        },
      });
      expect(await resolver.lookupTxt(owner, new AbortController().signal)).toEqual(['proof']);
      const attempts = requests.filter((request) => {
        const question = packet.decode(request.packet).questions![0];
        return question.type === type && (type !== 'NS' || question.name === owner);
      });
      expect(attempts.map((request) => request.address)).toEqual(resolvers);
    },
  );

  it.each([0, 3])(
    `accepts SOA-bearing recursive terminal negative ${type}: rcode %d`,
    async (rcode) => {
      const requests: DnsExchange[] = [];
      const resolver = new AuthoritativeDnsResolver(resolvers, {
        exchange: async (request) => {
          await Promise.resolve();
          requests.push(request);
          const question = packet.decode(request.packet).questions![0];
          if (question.type === type && (type !== 'NS' || question.name === owner))
            return reply(request, { flags: rcode, answers: [], authorities: [soa] });
          return reply(
            request,
            question.type === 'TXT' ? { flags: packet.AUTHORITATIVE_ANSWER } : {},
          );
        },
      });
      expect(await resolver.lookupTxt(owner, new AbortController().signal)).toEqual(['proof']);
      expect(requests.every((request) => request.address !== resolvers[1])).toBe(true);
      if (type === 'NS')
        expect(packet.decode(requests[1].packet).questions![0].name).toBe('example.com');
    },
  );
}

it('skips a nameserver only after both address families have terminal absence', async () => {
  const requests: DnsExchange[] = [];
  const resolver = new AuthoritativeDnsResolver(resolvers, {
    exchange: async (request) => {
      await Promise.resolve();
      requests.push(request);
      const question = packet.decode(request.packet).questions![0];
      return question.type === 'NS'
        ? reply(request)
        : reply(request, { answers: [], authorities: [soa] });
    },
  });
  const failure: unknown = await resolver
    .lookupTxt(owner, new AbortController().signal)
    .catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(DnsUnavailableError);
  expect(requests.map((request) => packet.decode(request.packet).questions![0].type)).toEqual([
    'NS',
    'A',
    'AAAA',
  ]);
});
