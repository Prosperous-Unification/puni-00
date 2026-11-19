import { expect, test } from 'bun:test';

import * as domain from '../index';
import { resolveSteps } from './resolve-steps';

test('the domain package exposes the proven step resolver', () => {
  expect(Reflect.get(domain, 'resolveSteps')).toBe(resolveSteps);
});
