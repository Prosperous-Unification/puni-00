import { afterEach, expect, it, spyOn } from 'bun:test';
import * as packet from 'dns-packet';

import { DnsUnavailableError } from './runtime/authoritative-dns/failures';
import type { DnsExchange, DnsTransport } from './runtime/authoritative-dns/resolver';
import { BOOTED_ORIGIN, BootedBrowserProcess } from './testing/booted-browser-process';

let be: BootedBrowserProcess | undefined;
let values: readonly string[] = [];
let mode: 'proof' | 'absence' | 'outage' | 'authority_txt' | 'additional_txt' = 'proof';
let beforeTxt: (() => void) | undefined;
const requests: DnsExchange[] = [];
const cookies = new Map<string, string>();

afterEach(async () => {
  await be?.close();
  be = undefined;
  values = [];
  mode = 'proof';
  beforeTxt = undefined;
  requests.length = 0;
  cookies.clear();
});

const transport: DnsTransport = {
  exchange: async (request) => {
    await Promise.resolve();
    requests.push(request);
    const query = packet.decode(request.packet);
    const question = query.questions![0];
    let answers: packet.Answer[] = [];
    let authorities: packet.Answer[] = [];
    const additionals: packet.Answer[] = [];
    if (question.type === 'NS')
      answers = [{ name: question.name, type: 'NS', ttl: 60, data: 'ns.example.com' }];
    else if (question.type === 'A')
      answers = [{ name: question.name, type: 'A', ttl: 60, data: '8.8.8.8' }];
    else if (question.type === 'AAAA')
      authorities = [
        {
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
        },
      ];
    else if (question.type === 'TXT') {
      beforeTxt?.();
      if (mode === 'outage') throw new DnsUnavailableError('controlled DNS outage');
      if (mode === 'proof')
        answers = values.map((value) => ({
          name: question.name,
          type: 'TXT',
          ttl: 60,
          data: [Buffer.from(value.slice(0, 10)), Buffer.from(value.slice(10))],
        }));
      else {
        authorities = [
          {
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
          },
        ];
        const misplaced: packet.TxtAnswer = {
          name: question.name,
          type: 'TXT',
          ttl: 60,
          data: values.map((value) => Buffer.from(value)),
        };
        if (mode === 'authority_txt') authorities.push(misplaced);
        if (mode === 'additional_txt') additionals.push(misplaced);
      }
    }
    const bytes = packet.encode({
      id: query.id,
      type: 'response',
      flags: packet.AUTHORITATIVE_ANSWER,
      questions: [question],
      answers,
      authorities,
      additionals,
    });
    return { packet: bytes, peer: request.address, port: 53 };
  },
};

async function open(
  enabled = true,
  dnsTransport: DnsTransport = transport,
): Promise<BootedBrowserProcess> {
  be = await BootedBrowserProcess.open('enabled', undefined, BOOTED_ORIGIN, {
    resolvers: enabled ? ['10.0.0.53'] : undefined,
    transport: dnsTransport,
  });
  await be.register('owner');
  be.organization('org-a');
  be.member('org-a', 'owner', 'super_admin');
  be.activate();
  await select('org-a');
  return be;
}

async function select(organizationId: string): Promise<void> {
  if (be === undefined) throw new Error('boot is absent');
  const response = await be.app.handle(
    new Request(`${BOOTED_ORIGIN}/api/organization/active`, {
      method: 'POST',
      headers: {
        origin: BOOTED_ORIGIN,
        'content-type': 'application/json',
        authorization: `Bearer ${be.token('owner')}`,
      },
      body: JSON.stringify({ organizationId }),
    }),
  );
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (cookie === undefined) throw new Error('selection cookie absent');
  cookies.set(organizationId, cookie);
}

async function call(
  path: string,
  body?: unknown,
  organizationId = 'org-a',
): Promise<{ status: number; body: unknown }> {
  if (be === undefined) throw new Error('boot is absent');
  const selectedCookie = cookies.get(organizationId);
  if (selectedCookie === undefined) throw new Error('organization cookie absent');
  const response = await be.app.handle(
    new Request(`${BOOTED_ORIGIN}${path}`, {
      method: 'POST',
      headers: {
        origin: BOOTED_ORIGIN,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        cookie: `__Host-wbs_access=${be.token('owner')}; ${selectedCookie}`,
        'X-WBS-Expected-Organization': organizationId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

async function issue(organizationId = 'org-a'): Promise<{ id: string; dnsValue: string }> {
  const issued = await call(
    '/api/organization/domains/challenges',
    { domain: 'example.com' },
    organizationId,
  );
  expect(issued.status).toBe(201);
  return issued.body as { id: string; dnsValue: string };
}

function snapshot(): unknown {
  if (be === undefined) throw new Error('boot is absent');
  return ['organization_domain_claim', 'organization_audit', 'event_log', 'event_sequencer'].map(
    (table) => be!.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
  );
}

it('configured boot verifies through real DNS adapter and preserves separate TXT records', async () => {
  const process = await open();
  const claim = await issue();
  values = [claim.dnsValue, 'unrelated'];
  expect(await call(`/api/organization/domains/${claim.id}/verify`)).toEqual({
    status: 200,
    body: { id: claim.id, status: 'verified' },
  });
  expect(
    requests.map((request) => [request.address, packet.decode(request.packet).questions![0].type]),
  ).toEqual([
    ['10.0.0.53', 'NS'],
    ['10.0.0.53', 'A'],
    ['10.0.0.53', 'AAAA'],
    ['8.8.8.8', 'TXT'],
  ]);
  expect(
    process.sqlite.query('SELECT status FROM organization_domain_claim WHERE id=?').get(claim.id),
  ).toEqual({ status: 'verified' });
});

it('disabled DNS remains explicit and sends no packet', async () => {
  await open(false);
  const claim = await issue();
  values = [claim.dnsValue];
  const before = snapshot();
  expect(await call(`/api/organization/domains/${claim.id}/verify`)).toEqual({
    status: 503,
    body: { error: 'dns_unavailable' },
  });
  expect(requests).toHaveLength(0);
  expect(snapshot()).toEqual(before);
});

it('separate TXT records cannot be joined into the current proof', async () => {
  await open();
  const claim = await issue();
  values = [claim.dnsValue.slice(0, 20), claim.dnsValue.slice(20)];
  const before = snapshot();
  expect(await call(`/api/organization/domains/${claim.id}/verify`)).toEqual({
    status: 409,
    body: { error: 'proof_mismatch' },
  });
  expect(snapshot()).toEqual(before);
});

it.each([
  ['absence', 409, 'proof_mismatch'],
  ['outage', 503, 'dns_unavailable'],
  ['authority_txt', 503, 'dns_unavailable'],
  ['additional_txt', 503, 'dns_unavailable'],
] as const)(
  'distinguishes authoritative absence from unusable DNS evidence: %s',
  async (kind, status, error) => {
    await open();
    const claim = await issue();
    values = [claim.dnsValue];
    mode = kind;
    const before = snapshot();
    expect(await call(`/api/organization/domains/${claim.id}/verify`)).toEqual({
      status,
      body: { error },
    });
    expect(snapshot()).toEqual(before);
  },
);

it('inactive or unauthorized route sends no packets', async () => {
  const process = await open();
  const claim = await issue();
  values = [claim.dnsValue];
  process.sqlite.run(
    "UPDATE organization_membership SET role='member' WHERE organization_id='org-a'",
  );
  expect((await call(`/api/organization/domains/${claim.id}/verify`)).status).toBe(403);
  process.sqlite.run(
    "UPDATE organization_membership SET role='super_admin' WHERE organization_id='org-a'",
  );
  // Disposable fault injection bypasses the permanent-marker trigger only.
  process.sqlite.run('DROP TRIGGER organization_activation_no_revert');
  process.sqlite.run("UPDATE organization_activation SET state='pre_activation',activated_at=NULL");
  expect((await call(`/api/organization/domains/${claim.id}/verify`)).status).toBe(403);
  expect(requests).toHaveLength(0);
});

it.each(['membership', 'challenge', 'expiry', 'activation'] as const)(
  'retains commit-time checks after lookup: %s',
  async (fault) => {
    const process = await open();
    const claim = await issue();
    values = [claim.dnsValue];
    let changed: unknown;
    beforeTxt = () => {
      beforeTxt = undefined;
      if (fault === 'membership')
        process.sqlite.run(
          "UPDATE organization_membership SET role='member' WHERE organization_id='org-a'",
        );
      if (fault === 'challenge')
        process.sqlite.run(
          "UPDATE organization_domain_claim SET challenge_digest='rotated' WHERE id=?",
          [claim.id],
        );
      if (fault === 'expiry')
        process.sqlite.run(
          'UPDATE organization_domain_claim SET challenge_expires_at=1 WHERE id=?',
          [claim.id],
        );
      if (fault === 'activation') {
        // Disposable corruption fixture: production activation is permanent.
        process.sqlite.run('DROP TRIGGER organization_activation_no_revert');
        process.sqlite.run(
          "UPDATE organization_activation SET state='pre_activation',activated_at=NULL",
        );
      }
      changed = snapshot();
    };
    expect((await call(`/api/organization/domains/${claim.id}/verify`)).status).toBe(
      fault === 'challenge' || fault === 'expiry' ? 409 : 403,
    );
    expect(requests.some((request) => request.address === '8.8.8.8')).toBe(true);
    expect(snapshot()).toEqual(changed);
  },
);

it('refuses a changed expiry snapshot even when the new expiry is in the future', async () => {
  const process = await open();
  const claim = await issue();
  values = [claim.dnsValue];
  let changed: unknown;
  beforeTxt = () => {
    beforeTxt = undefined;
    process.sqlite.run(
      'UPDATE organization_domain_claim SET challenge_expires_at=challenge_expires_at+60000 WHERE id=?',
      [claim.id],
    );
    changed = snapshot();
  };
  expect((await call(`/api/organization/domains/${claim.id}/verify`)).status).toBe(409);
  expect(snapshot()).toEqual(changed);
});

it('refuses a challenge that expires during DNS without changing its snapshot', async () => {
  const process = await open();
  const claim = await issue();
  values = [claim.dnsValue];
  const row = process.sqlite
    .query<{ challenge_expires_at: number }, [string]>(
      'SELECT challenge_expires_at FROM organization_domain_claim WHERE id=?',
    )
    .get(claim.id);
  if (row === null) throw new Error('issued claim absent');
  const before = snapshot();
  const clock = spyOn(Date, 'now');
  try {
    beforeTxt = () => {
      beforeTxt = undefined;
      clock.mockReturnValue(row.challenge_expires_at + 1);
    };
    expect((await call(`/api/organization/domains/${claim.id}/verify`)).status).toBe(409);
    expect(snapshot()).toEqual(before);
  } finally {
    clock.mockRestore();
  }
});

it('concurrent organizations cannot acquire one domain through production composition', async () => {
  const process = await open();
  process.organization('org-b');
  process.member('org-b', 'owner', 'super_admin');
  const first = await issue();
  await select('org-b');
  const second = await issue('org-b');
  values = [first.dnsValue, second.dnsValue];
  const responses = await Promise.all([
    call(`/api/organization/domains/${first.id}/verify`, undefined, 'org-a'),
    call(`/api/organization/domains/${second.id}/verify`, undefined, 'org-b'),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(
    process.sqlite
      .query("SELECT COUNT(*) AS count FROM organization_domain_claim WHERE status='verified'")
      .get(),
  ).toEqual({ count: 1 });
});

it('mounted lookup joins cancellation before 503 inside the existing five second guard', async () => {
  let closed = false;
  await open(true, {
    exchange: async (request) => {
      const question = packet.decode(request.packet).questions![0];
      if (question.type === 'TXT')
        return new Promise((_resolve, reject) => {
          request.signal.addEventListener(
            'abort',
            () => {
              setTimeout(() => {
                closed = true;
                reject(new DnsUnavailableError('controlled joined timeout'));
              }, 50);
            },
            { once: true },
          );
        });
      await Bun.sleep(800);
      const incoming = await transport.exchange(request);
      if (question.type === 'NS' && question.name !== 'com') {
        const reply = packet.decode(incoming.packet);
        reply.answers = [];
        reply.authorities = [
          {
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
          },
        ];
        return { ...incoming, packet: packet.encode(reply) };
      }
      return incoming;
    },
  });
  const claim = await issue();
  const before = snapshot();
  const started = performance.now();
  expect(await call(`/api/organization/domains/${claim.id}/verify`)).toEqual({
    status: 503,
    body: { error: 'dns_unavailable' },
  });
  expect(performance.now() - started).toBeLessThan(5000);
  expect(closed).toBe(true);
  expect(snapshot()).toEqual(before);
}, 8000);
