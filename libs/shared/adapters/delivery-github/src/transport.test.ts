import { expect, test } from 'bun:test';

import { ProviderFailure } from './records';
import { createTransport, REQUEST_BUDGET } from './transport';

test('refuses the 33rd GET of one read', async () => {
  let requests = 0;
  const transport = createTransport(
    () => {
      requests++;
      return Promise.resolve(Response.json({}));
    },
    () => 0,
    new AbortController().signal,
  );
  for (let request = 0; request < REQUEST_BUDGET; request++) await transport.get('/repos/a/b');
  expect(transport.remaining()).toBe(0);
  const refusal = await transport.get('/repos/a/b').catch((failure: unknown) => failure);
  expect(refusal).toBeInstanceOf(ProviderFailure);
  expect(refusal).toMatchObject({ reason: 'budget-exceeded' });
  expect(requests).toBe(32);
});
