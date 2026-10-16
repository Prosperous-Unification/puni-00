import { expect, test } from 'bun:test';

import { extractNxRelationshipsFromSource } from './nx-core';

test('Nx source retains named unreadable input context', () => {
  expect(() =>
    extractNxRelationshipsFromSource({
      projectPaths: () => [],
      read: () => {
        throw new Error('injected unreadable');
      },
    }),
  ).toThrow('Nx project configuration malformed: nx.json: injected unreadable');
});

test('Nx source refuses malformed UTF-8 before JSON interpretation', () => {
  expect(() =>
    extractNxRelationshipsFromSource({
      projectPaths: () => [],
      read: () => new Uint8Array([123, 34, 120, 34, 58, 34, 255, 34, 125]),
    }),
  ).toThrow('Nx project configuration malformed: nx.json');
});
