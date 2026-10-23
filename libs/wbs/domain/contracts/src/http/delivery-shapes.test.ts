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
      body: { kind: 'unsupported', reason: 'host' },
    });
  });
  expect(typeof client[operation]).toBe('function');
  expect(
    await client[operation]({ params: { id: 'p', workItemId: 'w', refId: 'r' } }),
  ).toMatchObject({
    kind: 'success',
    body: { kind: 'unsupported', reason: 'host' },
  });
  const document = documentFromShapes(httpShapes);
  expect(
    document.paths['/api/projects/{id}/work-items/{workItemId}/refs/{refId}/delivery']?.['get'],
  ).toMatchObject({ operationId: operation });
});
