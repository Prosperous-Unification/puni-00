import { ClientConfigurationError, type ClientTransport, readProjectClaims } from '@wbs/contracts';
import { expect, test } from 'bun:test';

import { createClaimClient } from './claim-client';
test('narrow claim reader forwards only validated project claims with original signal', async () => {
  const signal = new AbortController().signal;
  const sent: unknown[] = [];
  const client = createClaimClient((shape, input) => {
    sent.push({ shape, input });
    return Promise.resolve(Response.json({ readAt: 1000, claims: [] }));
  });
  expect(Object.keys(client)).toEqual(['readClaims']);
  expect(await client.readClaims({ params: { id: 'project' }, signal })).toMatchObject({
    kind: 'success',
    status: 200,
    body: { readAt: 1000, claims: [] },
  });
  expect(sent).toEqual([
    {
      shape: readProjectClaims,
      input: { params: { id: 'project' }, query: undefined, body: undefined, signal },
    },
  ]);
});
test('narrow claim reader rejects noncallable construction', () => {
  for (const transport of [null, undefined, {}])
    expect(() => createClaimClient(transport as ClientTransport)).toThrow(ClientConfigurationError);
});
test('narrow reader preserves shared refusal cancellation malformed and invalid input behavior', async () => {
  for (const [status, body, kind] of [
    [404, { error: 'not_found' }, 'refusal'],
    [200, { claims: [] }, 'failure'],
    [418, {}, 'failure'],
  ] as const)
    expect(
      (
        await createClaimClient(() => Promise.resolve(Response.json(body, { status }))).readClaims({
          params: { id: 'project' },
        })
      ).kind,
    ).toBe(kind);
  let calls = 0;
  const client = createClaimClient(() => {
    calls++;
    throw new Error('transport');
  });
  expect(await client.readClaims({ params: { id: '..' } })).toMatchObject({
    kind: 'failure',
    failure: { code: 'invalid_request' },
  });
  const controller = new AbortController();
  controller.abort();
  expect(await client.readClaims({ params: { id: 'project' }, signal: controller.signal })).toEqual(
    { kind: 'failure', failure: { code: 'cancelled' } },
  );
  expect(calls).toBe(0);
  expect(await client.readClaims({ params: { id: 'project' } })).toMatchObject({
    kind: 'failure',
    failure: { code: 'transport' },
  });
});
