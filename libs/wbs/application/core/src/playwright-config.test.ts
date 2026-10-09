import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

import config from '../playwright.config';

test('portable Browser config writes its own JUnit report', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
  // Proof: removing the JUnit tuple made this case fail with only [["line"]] received
  // instead of the portable report path (2026-10-09).
  expect(config.reporter).toContainEqual([
    'junit',
    { outputFile: resolve(root, 'tmp/junit/wbs-core.browser.portable.xml') },
  ]);
});
