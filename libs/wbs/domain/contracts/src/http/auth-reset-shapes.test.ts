import { expect, test } from 'bun:test';

import { documentFromShapes } from './document-from-shapes';
import { httpShapes } from './shapes';

test('documents browser reset as an empty POST without a credential or request body', () => {
  const operation = documentFromShapes(httpShapes).paths['/api/auth/reset']?.['post'];
  expect(operation).toBeDefined();
  expect(operation?.operationId).toBe('postApiAuthReset');
  expect(operation?.requestBody).toBeUndefined();
  expect(operation?.parameters).toEqual([]);
  expect(operation?.responses).toHaveProperty('204');
  expect(operation?.responses['204']?.content).toBeUndefined();
  expect(operation?.responses).toHaveProperty('400');
  expect(operation?.responses).toHaveProperty('403');
});
