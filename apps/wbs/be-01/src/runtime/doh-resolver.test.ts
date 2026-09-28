import { describe, expect, it } from 'bun:test';

import { DnsLookupRefused, dohDomainResolver, PUBLIC_DOH_RESOLVERS } from './doh-resolver';

const NAME = '_wbs-verification.example.org';

interface Seen {
  readonly url: URL;
  readonly accept: string | null;
  readonly signal: AbortSignal | null | undefined;
}

type Reply = Response | Error | (() => Promise<Response>);

/** A fetch double answering by host, recording what each resolver was asked. */
function fakeFetch(replies: Readonly<Record<string, Reply>>, seen: Seen[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    seen.push({ url, accept: new Headers(init?.headers).get('accept'), signal: init?.signal });
    if (!(url.host in replies)) throw new Error(`unexpected host ${url.host}`);
    const reply = replies[url.host];
    if (reply instanceof Error) throw reply;
    if (typeof reply === 'function') return reply();
    return reply.clone();
  }) as typeof fetch;
}

function answer(...data: string[]): Response {
  return Response.json({
    Status: 0,
    TC: false,
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
  it('asks both public resolvers for TXT records and returns their agreed answer', async () => {
    const seen: Seen[] = [];
    const resolver = dohDomainResolver(
      fakeFetch(
        {
          '1.1.1.1': answer('"wbs-domain-verification=org-a:example.org:aa"', '"other"'),
          '8.8.8.8': answer('"other"', '"wbs-domain-verification=org-a:example.org:aa"'),
        },
        seen,
      ),
    );
    const controller = new AbortController();

    expect(await resolver.lookupTxt(NAME, controller.signal)).toEqual([
      'other',
      'wbs-domain-verification=org-a:example.org:aa',
    ]);
    expect(PUBLIC_DOH_RESOLVERS.map((endpoint) => new URL(endpoint).host)).toEqual([
      '1.1.1.1',
      '8.8.8.8',
    ]);
    expect(
      seen.map(({ url, accept }) => ({
        host: url.host,
        name: url.searchParams.get('name'),
        type: url.searchParams.get('type'),
        accept,
      })),
    ).toEqual([
      { host: '1.1.1.1', name: NAME, type: 'TXT', accept: 'application/dns-json' },
      { host: '8.8.8.8', name: NAME, type: 'TXT', accept: 'application/dns-json' },
    ]);
    expect(seen.every((request) => request.signal === controller.signal)).toBe(true);
  });

  it('refuses when the two resolvers disagree', async () => {
    const resolver = dohDomainResolver(
      fakeFetch({
        '1.1.1.1': answer('"wbs-domain-verification=org-a:example.org:aa"'),
        '8.8.8.8': answer('"wbs-domain-verification=org-b:example.org:bb"'),
      }),
    );

    expect(await refusal(resolver.lookupTxt(NAME, signal()))).toBe('disagreement');
  });

  it('refuses a record present at only one resolver, including against NXDOMAIN', async () => {
    const nxdomain = Response.json({ Status: 3, TC: false });
    const resolver = dohDomainResolver(
      fakeFetch({ '1.1.1.1': answer('"proof"', '"proof"'), '8.8.8.8': nxdomain }),
    );

    expect(await refusal(resolver.lookupTxt(NAME, signal()))).toBe('disagreement');
    const duplicate = dohDomainResolver(
      fakeFetch({ '1.1.1.1': answer('"proof"', '"proof"'), '8.8.8.8': answer('"proof"') }),
    );
    expect(await refusal(duplicate.lookupTxt(NAME, signal()))).toBe('disagreement');
  });

  it('answers no records when both resolvers report NXDOMAIN', async () => {
    const nxdomain = Response.json({ Status: 3, TC: false });
    const resolver = dohDomainResolver(fakeFetch({ '1.1.1.1': nxdomain, '8.8.8.8': nxdomain }));

    expect(await resolver.lookupTxt(NAME, signal())).toEqual([]);
  });

  it('refuses when either resolver fails, even if the other answers', async () => {
    const good = answer('"proof"');
    const cases: Readonly<Record<string, Reply>>[] = [
      { '1.1.1.1': new Response('down', { status: 502 }), '8.8.8.8': good },
      { '1.1.1.1': good, '8.8.8.8': new TypeError('fetch failed') },
      { '1.1.1.1': good, '8.8.8.8': Response.json({ Status: 2, TC: false }) },
      { '1.1.1.1': Response.json({ Status: 0, TC: true, Answer: [] }), '8.8.8.8': good },
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
    const good = answer('"proof"');
    const cases: Readonly<Record<string, Reply>>[] = [
      { '1.1.1.1': new Response('not json', { status: 200 }), '8.8.8.8': good },
      { '1.1.1.1': good, '8.8.8.8': Response.json({ Status: '0', Answer: [] }) },
      {
        '1.1.1.1': good,
        '8.8.8.8': Response.json({ Status: 0, TC: false, Answer: [{ type: 16, data: 42 }] }),
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

  it('joins multi-string TXT data, decodes escapes and skips non-TXT answers', async () => {
    const reply = () =>
      Response.json({
        Status: 0,
        TC: false,
        Answer: [
          { name: `${NAME}.`, type: 5, TTL: 60, data: 'alias.example.net.' },
          { name: 'alias.example.net.', type: 16, TTL: 60, data: '"wbs-" "proof"' },
          { name: 'alias.example.net.', type: 16, TTL: 60, data: '"q\\"uote\\\\ \\065"' },
        ],
      });
    const resolver = dohDomainResolver(
      fakeFetch({
        '1.1.1.1': () => Promise.resolve(reply()),
        '8.8.8.8': () => Promise.resolve(reply()),
      }),
    );

    expect(await resolver.lookupTxt(NAME, signal())).toEqual(['q"uote\\ A', 'wbs-proof']);
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
      fakeFetch({ '1.1.1.1': hanging, '8.8.8.8': answer('"proof"') }),
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
