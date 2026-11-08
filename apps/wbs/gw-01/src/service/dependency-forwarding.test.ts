import { DEPENDENCY_SEMANTICS, DEPENDENCY_SEMANTICS_HEADER } from '@wbs/contracts';
import { systemTimers } from '@wbs/runtime-portable';
import { expect, test } from 'bun:test';

import { projectAccessFor } from '../composition';
import { requestBackend } from './backend-request';

test('forward, resume and browser access forward only their connection selected semantics', async () => {
  for (const dependencySemantics of [undefined, DEPENDENCY_SEMANTICS] as const) {
    const claims: (string | null)[] = [];
    const fetchImpl = (_url: string, init?: RequestInit) => {
      claims.push(new Headers(init?.headers).get(DEPENDENCY_SEMANTICS_HEADER));
      return Promise.resolve(
        _url.endsWith('browser-access')
          ? new Response(null, { status: 204 })
          : Response.json({ accepted: true }),
      );
    };
    const options = {
      beUrl: 'http://be.test',
      secret: 'secret',
      fetchImpl,
      timers: systemTimers,
      attemptMs: 100,
      overallMs: 200,
    };
    for (const route of ['forward', 'resume'] as const)
      await requestBackend(
        options,
        route,
        {},
        { clientId: 'ada', connectionId: 'socket', traceId: 'trace', dependencySemantics },
        (body) => body,
      );
    const check = projectAccessFor(options)({
      kind: 'cookie',
      forwarded: { accessCookie: 'credential', organizationCookie: null },
      dependencySemantics,
    });
    expect(await check('p', new AbortController().signal)).toBe('granted');
    expect(claims).toEqual([
      dependencySemantics ?? null,
      dependencySemantics ?? null,
      dependencySemantics ?? null,
    ]);
  }
});
