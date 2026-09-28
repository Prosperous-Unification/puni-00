import { expect, it } from 'bun:test';

import { DelegationClient } from './delegation-client';

it('presents service and bearer credentials without cookies', async () => {
  let sent: RequestInit | undefined;
  let destination: string | undefined;
  const client = new DelegationClient({
    beUrl: 'http://be.test',
    secret: 'service-secret',
    fetchImpl: (url, init) => {
      destination = url;
      sent = init;
      return Promise.resolve(new Response(null, { status: 204 }));
    },
  });
  await client.checkProject('project-1', 'signed-token');
  expect(destination).toBe('http://be.test/internal/gateway/projects/project-1/access');
  expect(sent?.headers).toEqual({
    'x-internal-auth': 'service-secret',
    authorization: 'Bearer signed-token',
  });
});

it('refuses a success-shaped body on any status other than 204', async () => {
  const client = new DelegationClient({
    beUrl: 'http://be.test',
    secret: 'service-secret',
    fetchImpl: () => Promise.resolve(Response.json({ allowed: true })),
  });
  let failure: unknown;
  try {
    await client.checkProject('project-1', 'signed-token');
  } catch (caught) {
    failure = caught;
  }
  expect(failure).toBeInstanceOf(Error);
});
