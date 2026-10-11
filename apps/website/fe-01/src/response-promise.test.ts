import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

// W11: "a person reads every request and replies by email" is the only response promise; no page
// states a response time until Dany sets one.
const responseTime = /within \d+ (hours|days)/i;

const copyFiles = readdirSync(import.meta.dir)
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
  .map((name) => ({ name, text: readFileSync(join(import.meta.dir, name), 'utf8') }));

test('no app copy promises a response time', () => {
  expect(copyFiles.length).toBeGreaterThan(5);
  // Proof: adding "We reply within 2 days." to the manual receipt lead failed this list with main.tsx.
  expect(copyFiles.filter((file) => responseTime.test(file.text)).map((file) => file.name)).toEqual(
    [],
  );
});

test('the manual receipt says a person replies by email', () => {
  const main = copyFiles.find((file) => file.name === 'main.tsx');
  expect(main?.text).toContain('A person will review your brief and reply by email.');
});
