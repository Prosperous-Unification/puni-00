import {
  DEPENDENCY_SEMANTICS,
  DEPENDENCY_SEMANTICS_HEADER,
  DEPENDENCY_WEBSOCKET_PROTOCOL,
} from '@wbs/contracts';
import { systemTimers } from '@wbs/runtime-portable';
import { expect, test } from 'bun:test';

import { admitDependencyUpgrade, claimsDependencySemantics } from './dependency-admission';

const capable = {
  protocol: 'wbs-dependency-runtime',
  version: 1,
  role: 'gateway',
  semantics: [DEPENDENCY_SEMANTICS],
} as const;
test('requires independent binary support and exact offered WebSocket token', () => {
  for (const offered of [
    null,
    '',
    DEPENDENCY_SEMANTICS,
    `${DEPENDENCY_WEBSOCKET_PROTOCOL}.other`,
    DEPENDENCY_WEBSOCKET_PROTOCOL.toUpperCase(),
  ])
    expect(claimsDependencySemantics(capable, offered)).toBe(false);
  expect(claimsDependencySemantics(capable, `other, ${DEPENDENCY_WEBSOCKET_PROTOCOL}`)).toBe(true);
  expect(
    claimsDependencySemantics({ ...capable, semantics: [] }, DEPENDENCY_WEBSOCKET_PROTOCOL),
  ).toBe(false);
});

test('capable binaries forward only an exact offered WS claim and strictly decode the decision', async () => {
  const opts = {
    beUrl: 'http://be.test',
    secret: 'gateway-secret',
    timers: systemTimers,
    attemptMs: 50,
    overallMs: 100,
    fetchImpl: (_url: string, init?: RequestInit) =>
      Promise.resolve(
        new Headers(init?.headers).get(DEPENDENCY_SEMANTICS_HEADER) === DEPENDENCY_SEMANTICS
          ? new Response(null, { status: 204 })
          : Response.json(
              { error: 'client_dependency_incompatible', required: DEPENDENCY_SEMANTICS },
              { status: 409 },
            ),
      ),
  };
  expect(await admitDependencyUpgrade(opts, DEPENDENCY_WEBSOCKET_PROTOCOL, capable)).toBeNull();
  for (const offered of [null, DEPENDENCY_SEMANTICS, `${DEPENDENCY_WEBSOCKET_PROTOCOL}.other`])
    expect(await admitDependencyUpgrade(opts, offered, capable)).toEqual({
      error: 'client_dependency_incompatible',
      required: DEPENDENCY_SEMANTICS,
    });
  expect(
    await admitDependencyUpgrade(opts, DEPENDENCY_WEBSOCKET_PROTOCOL, {
      ...capable,
      semantics: [],
    }),
  ).toEqual({ error: 'client_dependency_incompatible', required: DEPENDENCY_SEMANTICS });
  expect(admitDependencyUpgrade({ ...opts, attemptMs: 0 }, null, capable)).rejects.toThrow(
    'deadline budgets',
  );
});

test('unexpected status, extra refusal fields and invalid budgets remain infrastructure failures', () => {
  const opts = {
    beUrl: 'http://be.test',
    secret: 'gateway-secret',
    timers: systemTimers,
    attemptMs: 50,
    overallMs: 100,
  };
  const refusal = { error: 'client_dependency_incompatible', required: DEPENDENCY_SEMANTICS };
  for (const status of [200, 401, 500])
    expect(
      admitDependencyUpgrade(
        { ...opts, fetchImpl: () => Promise.resolve(Response.json(refusal, { status })) },
        null,
        capable,
      ),
    ).rejects.toThrow('dependency admission failed');
  expect(
    admitDependencyUpgrade(
      {
        ...opts,
        fetchImpl: () =>
          Promise.resolve(Response.json({ ...refusal, extra: true }, { status: 409 })),
      },
      null,
      capable,
    ),
  ).rejects.toThrow('malformed dependency admission refusal');
});
