import { describe, expect, it } from 'bun:test';

import { DnsLookupRefused, dohDomainResolver, PUBLIC_DOH_RESOLVERS } from './doh-resolver';

const NAME = '_wbs-verification.example.org';
const PROOF = 'wbs-domain-verification=org-a:example.org:aa';
const QUESTION = [{ name: `${NAME}.`, type: 16 }];

interface Seen {
  readonly url: URL;
  readonly accept: string | null;
  readonly signal: AbortSignal | null | undefined;
  readonly redirect: RequestRedirect | undefined;
}

type Reply = Response | Error | (() => Promise<Response>);

/** A fetch double answering by host, recording what each resolver was asked. */
function fakeFetch(replies: Readonly<Record<string, Reply>>, seen: Seen[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    seen.push({
      url,
      accept: new Headers(init?.headers).get('accept'),
      signal: init?.signal,
      redirect: init?.redirect,
    });
    if (!(url.host in replies)) throw new Error(`unexpected host ${url.host}`);
    const reply = replies[url.host];
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'function') return reply();
    return reply.clone();
  }) as typeof fetch;
}

/** A resolver reply of this status whose `Question` names the asked name. */
function reply(Status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ Status, TC: false, Question: QUESTION, ...extra });
}

function answer(...data: string[]): Response {
  return reply(0, {
    Answer: data.map((text) => ({ name: `${NAME}.`, type: 16, TTL: 300, data: text })),
  });
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DnsLookupRefused) return error.reason;
    throw error;
  }
  throw new Error('lookup was not refused');
}

const signal = () => new AbortController().signal;

describe('dohDomainResolver', () => {
  it('asks both public resolvers for TXT records and returns their agreed proof records', async () => {
    const seen: Seen[] = [];
    const resolver = dohDomainResolver(
      fakeFetch(
        {
          '1.1.1.1': answer(`"${PROOF}"`, '"v=spf1 -all"'),
          '8.8.8.8': answer('"google-site-verification=x"', `"${PROOF}"`),
        },
        seen,
      ),
    );
    const controller = new AbortController();

    // Only WBS proof records are compared and returned: foreign TXT records,
    // and their skew between resolvers, must not read as a disagreement.
    expect(await resolver.lookupTxt(NAME, controller.signal)).toEqual([PROOF]);
    expect(PUBLIC_DOH_RESOLVERS.map((endpoint) => new URL(endpoint).host)).toEqual([
      '1.1.1.1',
      '8.8.8.8',
    ]);
    expect(
      seen.map(({ url, accept, redirect }) => ({
        host: url.host,
        name: url.searchParams.get('name'),
        type: url.searchParams.get('type'),
        accept,
        redirect,
      })),
    ).toEqual([
      {
        host: '1.1.1.1',
        name: NAME,
        type: 'TXT',
        accept: 'application/dns-json',
        redirect: 'error',
      },
      {
        host: '8.8.8.8',
        name: NAME,
        type: 'TXT',
        accept: 'application/dns-json',
        redirect: 'error',
      },
    ]);
    expect(seen.every((request) => request.signal === controller.signal)).toBe(true);
  });

  it('refuses when the two resolvers disagree', async () => {
    const resolver = dohDomainResolver(
      fakeFetch({
        '1.1.1.1': answer(`"${PROOF}"`),
        '8.8.8.8': answer('"wbs-domain-verification=org-b:example.org:bb"'),
      }),
    );

    expect(await refusal(resolver.lookupTxt(NAME, signal()))).toBe('disagreement');
  });

  it('refuses a record present at only one resolver, including against NXDOMAIN', async () => {
    const resolver = dohDomainResolver(
      fakeFetch({ '1.1.1.1': answer(`"${PROOF}"`), '8.8.8.8': reply(3) }),
    );

    expect(await refusal(resolver.lookupTxt(NAME, signal()))).toBe('disagreement');
    const duplicate = dohDomainResolver(
      fakeFetch({
        '1.1.1.1': answer(`"${PROOF}"`, `"${PROOF}"`),
        '8.8.8.8': answer(`"${PROOF}"`),
      }),
    );
    expect(await refusal(duplicate.lookupTxt(NAME, signal()))).toBe('disagreement');
  });

  it('answers no records when both resolvers report NXDOMAIN', async () => {
    const resolver = dohDomainResolver(fakeFetch({ '1.1.1.1': reply(3), '8.8.8.8': reply(3) }));

    expect(await resolver.lookupTxt(NAME, signal())).toEqual([]);
  });

  it('refuses when either resolver fails, even if the other answers', async () => {
    const good = answer(`"${PROOF}"`);
    const cases: Readonly<Record<string, Reply>>[] = [
      { '1.1.1.1': new Response('down', { status: 502 }), '8.8.8.8': good },
      { '1.1.1.1': good, '8.8.8.8': new TypeError('fetch failed') },
      { '1.1.1.1': good, '8.8.8.8': reply(2) },
      { '1.1.1.1': reply(0, { TC: true, Answer: [] }), '8.8.8.8': good },
    ];
    const reasons = await Promise.all(
      cases.map((replies) =>
        refusal(dohDomainResolver(fakeFetch(replies)).lookupTxt(NAME, signal())),
      ),
    );

    expect(reasons).toEqual([
      'resolver_failed',
      'resolver_failed',
      'resolver_failed',
      'resolver_failed',
    ]);
  });

  it('refuses malformed answers rather than reading them as empty', async () => {
    const good = answer(`"${PROOF}"`);
    const cases: Readonly<Record<string, Reply>>[] = [
      { '1.1.1.1': new Response('not json', { status: 200 }), '8.8.8.8': good },
      { '1.1.1.1': good, '8.8.8.8': Response.json({ Status: '0', Question: QUESTION }) },
      {
        '1.1.1.1': good,
        '8.8.8.8': reply(0, { Answer: [{ name: `${NAME}.`, type: 16, data: 42 }] }),
      },
      { '1.1.1.1': good, '8.8.8.8': answer('"unterminated') },
    ];
    const reasons = await Promise.all(
      cases.map((replies) =>
        refusal(dohDomainResolver(fakeFetch(replies)).lookupTxt(NAME, signal())),
      ),
    );

    expect(reasons).toEqual([
      'malformed_answer',
      'malformed_answer',
      'malformed_answer',
      'malformed_answer',
    ]);
  });

  it('refuses an answer to a question it did not ask', async () => {
    const good = answer(`"${PROOF}"`);
    const cases: Readonly<Record<string, Reply>>[] = [
      { '1.1.1.1': good, '8.8.8.8': Response.json({ Status: 0, TC: false, Answer: [] }) },
      {
        '1.1.1.1': good,
        '8.8.8.8': Response.json({
          Status: 0,
          TC: false,
          Question: [{ name: 'other.example.org.', type: 16 }],
          Answer: [],
        }),
      },
    ];
    const reasons = await Promise.all(
      cases.map((replies) =>
        refusal(dohDomainResolver(fakeFetch(replies)).lookupTxt(NAME, signal())),
      ),
    );

    expect(reasons).toEqual(['malformed_answer', 'malformed_answer']);
  });

  it('joins multi-string TXT data, decodes escapes and follows only the asked CNAME chain', async () => {
    const chained = () =>
      reply(0, {
        Answer: [
          { name: `${NAME}.`, type: 5, TTL: 60, data: 'alias.example.net.' },
          { name: 'alias.example.net.', type: 16, TTL: 60, data: '"wbs-domain-" "verification=a"' },
          {
            name: 'Alias.Example.NET.',
            type: 16,
            TTL: 60,
            data: String.raw`"wbs-domain-verification=\"q\\\065"`,
          },
          {
            name: 'unrelated.example.net.',
            type: 16,
            TTL: 60,
            data: '"wbs-domain-verification=stray"',
          },
        ],
      });
    const resolver = dohDomainResolver(
      fakeFetch({
        '1.1.1.1': () => Promise.resolve(chained()),
        '8.8.8.8': () => Promise.resolve(chained()),
      }),
    );

    expect(await resolver.lookupTxt(NAME, signal())).toEqual([
      String.raw`wbs-domain-verification="q\A`,
      'wbs-domain-verification=a',
    ]);
  });

  it('refuses when the caller aborts a lookup in flight', async () => {
    const controller = new AbortController();
    const hanging = () =>
      new Promise<Response>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error('aborted', { cause: controller.signal.reason }));
        });
      });
    const lookup = dohDomainResolver(
      fakeFetch({ '1.1.1.1': hanging, '8.8.8.8': answer(`"${PROOF}"`) }),
    ).lookupTxt(NAME, controller.signal);
    controller.abort(new Error('DNS timeout'));

    expect(await refusal(lookup)).toBe('resolver_failed');
  });

  it('refuses to trust fewer than two resolvers', () => {
    expect(() => dohDomainResolver(fakeFetch({}), ['https://1.1.1.1/dns-query'])).toThrow(
      'dohDomainResolver needs two resolvers to agree',
    );
  });
});
