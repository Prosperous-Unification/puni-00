import { describe, expect, it } from 'bun:test';

import { browserProjectAccess } from './browser-access-client';

function clientAnswering(status: number, body: unknown) {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const check = browserProjectAccess({
    beUrl: 'http://be.test',
    secret: 'service-secret',
    fetchImpl: (url, init) => {
      sent.push({ url, init });
      return Promise.resolve(
        body === null ? new Response(null, { status }) : Response.json(body, { status }),
      );
    },
  })({ accessCookie: 'tok%2Ben', organizationCookie: 'org%3Dbinding' });
  return { sent, check: () => check('project-1', new AbortController().signal) };
}

describe('browserProjectAccess', () => {
  it('forwards the gateway secret and the browser cookies as sent, and nothing else', async () => {
    const { sent, check } = clientAnswering(204, null);

    expect(await check()).toBe('granted');
    expect(sent.map(({ url, init }) => ({ url, headers: init?.headers }))).toEqual([
      {
        url: 'http://be.test/internal/gateway/projects/project-1/browser-access',
        headers: {
          'x-internal-auth': 'service-secret',
          cookie: '__Host-wbs_access=tok%2Ben; __Host-wbs_organization=org%3Dbinding',
        },
      },
    ]);
  });

  it('maps be-01’s typed refusals to verdicts', async () => {
    const cases = [
      [404, { error: 'not_found' }, 'denied'],
      [403, { error: 'not_a_member' }, 'denied'],
      [403, { error: 'no_active_organization' }, 'denied'],
      [403, { error: 'insufficient_scope' }, 'denied'],
      [401, { error: 'unauthenticated' }, 'unauthenticated'],
    ] as const;
    for (const [status, body, verdict] of cases) {
      expect({ status, body, verdict: await clientAnswering(status, body).check() }).toEqual({
        status,
        body,
        verdict,
      });
    }
  });

  it('throws on a refused gateway secret', async () => {
    const failure = await clientAnswering(401, { error: 'unauthorized' })
      .check()
      .catch((caught: unknown) => caught);
    expect(failure).toEqual(new Error('project browser access failed 401'));
  });

  it('throws on a success-shaped body under any other status', async () => {
    for (const [status, body] of [
      [200, { allowed: true }],
      [500, { error: 'not_found' }],
      [404, { error: 'route_missing' }],
    ] as const) {
      const failure = await clientAnswering(status, body)
        .check()
        .catch((caught: unknown) => caught);
      expect(failure).toEqual(new Error(`project browser access failed ${String(status)}`));
    }
  });

  it('retries one transport failure inside the same budget', async () => {
    let attempts = 0;
    const check = browserProjectAccess({
      beUrl: 'http://be.test',
      secret: 'service-secret',
      fetchImpl: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new TypeError('connect ECONNREFUSED'))
          : Promise.resolve(new Response(null, { status: 204 }));
      },
    })({ accessCookie: 'tok', organizationCookie: null });

    expect(await check('project-1', new AbortController().signal)).toBe('granted');
    expect(attempts).toBe(2);
  });

  it('fails closed after a second transport failure, and never retries an aborted check', async () => {
    let attempts = 0;
    const failing = browserProjectAccess({
      beUrl: 'http://be.test',
      secret: 'service-secret',
      fetchImpl: () => {
        attempts += 1;
        return Promise.reject(new TypeError('connect ECONNREFUSED'));
      },
    })({ accessCookie: 'tok', organizationCookie: null });

    expect(
      await failing('project-1', new AbortController().signal).catch((caught: unknown) => caught),
    ).toBeInstanceOf(TypeError);
    expect(attempts).toBe(2);

    attempts = 0;
    const deadline = new AbortController();
    deadline.abort(new Error('request deadline exceeded'));
    expect(
      await failing('project-1', deadline.signal).catch((caught: unknown) => caught),
    ).toBeInstanceOf(TypeError);
    expect(attempts).toBe(1);
  });
});
