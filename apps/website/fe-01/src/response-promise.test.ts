import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

// W11: "a person reads every request and replies by email" is the only response promise; no page
// states a response time until Dany sets one. A response time is `in` or `within`, a count (digits,
// a, an, the or a number word) and hour(s), day(s), business or working day(s) or week(s); `in` or
// `within` and digits joined to `h`; digits joined to `hour`; "same day"; or "next business day". The block from `COUNT` to `responseTimePattern` is
// byte-identical to the private site's `src/content/response-promise.ts` (puni-pr-00).
const COUNT =
  '(?:\\d+|an?|the|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty[- ]four|forty[- ]eight|seventy[- ]two)';
const UNIT = '(?:(?:business|working)\\s+)?(?:hours?|days?|weeks?)';
const responseTimePattern = new RegExp(
  [
    `\\b(?:in|within)\\s+${COUNT}\\s+${UNIT}\\b`,
    '\\b(?:in|within)\\s+\\d+h\\b',
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
  expect(
    copyFiles.filter((file) => responseTimePattern.test(file.text)).map((file) => file.name),
  ).toEqual([]);
});

describe('response time forms', () => {
  // Proof (2026-10-12), each part of `responseTime` removed in turn: without the `in|within` form
  // this failed on its seven sentences; with `COUNT` cut to digits, on the one, two and
  // forty-eight sentences; without the business/working prefix, on the business and working
  // sentences; without `\d+-hours?`, on "24-hour"; without `same[- ]day`, on both same-day
  // sentences; without `next … day`, on both next-day sentences. Review follow-up: without `an?` in
  // `COUNT` this failed on the an-hour, a-day and a-business-day sentences; without `the`, on
  // "within the hour"; without `weeks?`, on "within two weeks"; without the `\d+h` form, on
  // "in 48h".
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
    'We reply within an hour.',
    'Expect a reply within a day.',
    'We answer in a business day.',
    'A person replies within the hour.',
    'A proposal within two weeks.',
    'Replies in 48h.',
  ])('finds %j', (text) => {
    expect(responseTimePattern.test(text)).toBe(true);
  });

  test.each([
    'Build did not respond within 10 seconds. Try again.',
    'Describe it within 2,000 characters.',
    'Please try again in 2 minutes.',
    'A person will review your brief and reply by email.',
  ])('finds nothing in %j', (text) => {
    expect(responseTimePattern.test(text)).toBe(false);
  });
});

test('the manual receipt says a person replies by email', () => {
  const main = copyFiles.find((file) => file.name === 'main.tsx');
  expect(main?.text).toContain('A person will review your brief and reply by email.');
});
