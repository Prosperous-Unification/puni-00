import { expect, test } from 'bun:test';

import { clientFromShapes } from './client';
import { documentFromShapes } from './document-from-shapes';
import { httpShapes } from './shapes';

const operation = 'getApiProjectsByIdWork-itemsByWorkItemIdRefsByRefIdDelivery';
test('exposes a typed saved-reference read through the shared client and OpenAPI', async () => {
  const client = clientFromShapes(httpShapes, (shape, input) => {
    expect(shape.path).toBe('/api/projects/:id/work-items/:workItemId/refs/:refId/delivery');
    expect(input.params).toEqual({ id: 'p', workItemId: 'w', refId: 'r' });
    return Promise.resolve({
      kind: 'json',
      status: 200,
      body: {
        reading: { kind: 'unsupported', reason: 'host' },
        servedAt: '2026-10-24T00:00:00.000Z',
      },
    });
  });
  expect(typeof client[operation]).toBe('function');
  expect(
    await client[operation]({ params: { id: 'p', workItemId: 'w', refId: 'r' } }),
  ).toMatchObject({
    kind: 'success',
    body: { reading: { kind: 'unsupported', reason: 'host' } },
  });
  const document = documentFromShapes(httpShapes);
  expect(
    document.paths['/api/projects/{id}/work-items/{workItemId}/refs/{refId}/delivery']?.['get'],
  ).toMatchObject({ operationId: operation });
});

test('validates the 429 and 503 delivery refusals at the client boundary', async () => {
  const replies = [
    { status: 429, body: { error: 'delivery_rate_limited', retryAfterSeconds: 20 } },
    { status: 503, body: { error: 'delivery_busy' } },
    { status: 429, body: { error: 'delivery_rate_limited' } },
  ];
  const client = clientFromShapes(httpShapes, () => {
    const reply = replies.shift();
    if (reply === undefined) throw new Error('no reply left');
    return Promise.resolve({ kind: 'json', ...reply });
  });
  const read = () => client[operation]({ params: { id: 'p', workItemId: 'w', refId: 'r' } });
  expect(await read()).toMatchObject({
    kind: 'refusal',
    status: 429,
    body: { error: 'delivery_rate_limited', retryAfterSeconds: 20 },
  });
  expect(await read()).toMatchObject({
    kind: 'refusal',
    status: 503,
    body: { error: 'delivery_busy' },
  });
  expect(await read()).toMatchObject({ kind: 'failure' });
});

test('refuses a bare reading without servedAt at the client boundary', async () => {
  const client = clientFromShapes(httpShapes, () =>
    Promise.resolve({ kind: 'json', status: 200, body: { kind: 'unsupported', reason: 'host' } }),
  );
  expect(
    await client[operation]({ params: { id: 'p', workItemId: 'w', refId: 'r' } }),
  ).toMatchObject({ kind: 'failure' });
});
