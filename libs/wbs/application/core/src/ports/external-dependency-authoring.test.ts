import { expect, test } from 'bun:test';

import {
  permitsExternalDependencies,
  validateExternalDependencyAuthoring,
} from './external-dependency-authoring';

test('rejects higher-order authoring readers without following their returned callable', () => {
  let followed = false;
  const returned = () => {
    followed = true;
    return { state: 'active' };
  };
  expect(() => permitsExternalDependencies(() => returned)).toThrow(
    'external dependency authoring capability is missing',
  );
  expect(followed).toBe(false);
});

test('rejects a self-returning authoring reader after one invocation', () => {
  let reads = 0;
  const read = (): unknown => {
    reads++;
    if (reads > 2) throw new Error('reader called recursively');
    return read;
  };
  expect(() => permitsExternalDependencies(read)).toThrow(
    'external dependency authoring capability is missing',
  );
  expect(reads).toBe(1);
});

for (const [returned, message] of [
  [undefined, 'external dependency authoring capability is missing'],
  [null, 'external dependency authoring capability is missing'],
  [{}, 'external dependency authoring capability is missing'],
  [{ state: 'enabled' }, 'unknown external dependency authoring state'],
] as const)
  test(`rejects malformed authoring reader return ${JSON.stringify(returned)}`, () => {
    expect(() => permitsExternalDependencies(() => returned)).toThrow(message);
  });

test('validates reader wiring without consuming its writer lifetime at construction', () => {
  let reads = 0;
  const read = () => {
    reads++;
    return { state: 'inactive' } as const;
  };
  validateExternalDependencyAuthoring(read);
  expect(reads).toBe(0);
  expect(permitsExternalDependencies(read)).toBe(false);
  expect(reads).toBe(1);
});
