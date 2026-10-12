import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

// W11: "a person reads every request and replies by email" is the only response promise; no page
// states a response time until Dany sets one. A response time is `in` or `within`, a count (digits
// or a number word) and hour(s), day(s) or business or working day(s); a digit count joined to
// `hour`; "same day"; or "next business day". The private site's `response-promise.ts` (puni-pr-00)
// reads the same forms.
const COUNT =
  '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty[- ]four|forty[- ]eight|seventy[- ]two)';
const UNIT = '(?:(?:business|working)\\s+)?(?:hours?|days?)';
const responseTime = new RegExp(
  [
    `\\b(?:in|within)\\s+${COUNT}\\s+${UNIT}\\b`,
    '\\b\\d+-hours?\\b',
    '\\bsame[- ]day\\b',
    '\\bnext\\s+(?:business|working)\\s+day\\b',
  ].join('|'),
  'i',
);

const copyFiles = readdirSync(import.meta.dir)
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
  .map((name) => ({ name, text: readFileSync(join(import.meta.dir, name), 'utf8') }));

test('no app copy promises a response time', () => {
  expect(copyFiles.length).toBeGreaterThan(5);
  // Proof: adding "We reply within 2 days." to the manual receipt lead failed this list with main.tsx.
  // Proof (2026-10-12): adding "We reply the same day." after that lead failed it with main.tsx.
  expect(copyFiles.filter((file) => responseTime.test(file.text)).map((file) => file.name)).toEqual(
    [],
  );
});

describe('response time forms', () => {
  // Proof (2026-10-12), each part of `responseTime` removed in turn: without the `in|within` form
  // this failed on its seven sentences; with `COUNT` cut to digits, on the one, two and
  // forty-eight sentences; without the business/working prefix, on the business and working
  // sentences; without `\d+-hours?`, on "24-hour"; without `same[- ]day`, on both same-day
  // sentences; without `next … day`, on both next-day sentences.
  test.each([
    'We reply within 2 days.',
    'Expect an answer in 24 hours.',
    'We reply within one business day.',
    'Replies within two working days.',
    'A person replies within forty-eight hours.',
    'We answer in 1 hour.',
    'A reply within\n3 days.',
    'A 24-hour reply.',
    'Same-day replies.',
    'We reply the same day.',
    'A reply by the next business day.',
    'Answers on the next working day.',
  ])('finds %j', (text) => {
    expect(responseTime.test(text)).toBe(true);
  });

  test.each([
    'Build did not respond within 10 seconds. Try again.',
    'Describe it within 2,000 characters.',
    'Please try again in 2 minutes.',
    'A person will review your brief and reply by email.',
  ])('finds nothing in %j', (text) => {
    expect(responseTime.test(text)).toBe(false);
  });
});

test('the manual receipt says a person replies by email', () => {
  const main = copyFiles.find((file) => file.name === 'main.tsx');
  expect(main?.text).toContain('A person will review your brief and reply by email.');
});
