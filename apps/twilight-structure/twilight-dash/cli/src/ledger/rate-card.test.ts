import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { rateCardJson } from './fixtures.test-support';
import { loadRateCard, priceTokens } from './rate-card';

function cardPath(contents = rateCardJson()): string {
  const directory = scratchSync('ledger-card');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'card.json');
  writeFileSync(path, contents);
  return path;
}

test('prices a known row exactly in micros and names the card by digest', () => {
  const loaded = loadRateCard(cardPath());
  expect(loaded.digest).toMatch(/^[0-9a-f]{64}$/);
  const priced = priceTokens(loaded.card, 'claude-fable-5-1', {
    input: 1_000_000,
    cacheWrite: 1_000_000,
    cacheWriteExtended: 1_000_000,
    cacheRead: 1_000_000,
    output: 1_000_000,
  });
  expect(priced).toEqual({ kind: 'priced', micros: (10 + 12.5 + 20 + 0.25 + 50) * 1_000_000 });
});

test('an unlisted model stays unpriced', () => {
  const loaded = loadRateCard(cardPath());
  expect(
    priceTokens(loaded.card, 'codex-auto-review', {
      input: 5,
      cacheWrite: 0,
      cacheWriteExtended: 0,
      cacheRead: 0,
      output: 1,
    }),
  ).toEqual({ kind: 'unpriced', reason: 'unknown-model' });
});

test('a missing category stays unpriced', () => {
  const loaded = loadRateCard(cardPath());
  expect(
    priceTokens(loaded.card, 'claude-no-extended', {
      input: 1,
      cacheWrite: 0,
      cacheWriteExtended: 7,
      cacheRead: 0,
      output: 0,
    }),
  ).toEqual({ kind: 'unpriced', reason: 'missing-category' });
  expect(
    priceTokens(loaded.card, 'claude-no-extended', {
      input: 1_000_000,
      cacheWrite: 0,
      cacheWriteExtended: 0,
      cacheRead: 0,
      output: 0,
    }),
  ).toEqual({ kind: 'priced', micros: 10_000_000 });
});

test('a malformed, duplicated or absent card refuses', () => {
  expect(() => loadRateCard(cardPath('{"schemaVersion":1}'))).toThrow(/malformed/);
  const duplicated = JSON.parse(rateCardJson()) as { entries: unknown[] };
  duplicated.entries.push(duplicated.entries[0]);
  expect(() => loadRateCard(cardPath(JSON.stringify(duplicated)))).toThrow(/twice/);
  expect(() => loadRateCard(join(scratchSync('ledger-card'), 'absent.json'))).toThrow(
    /missing, unreadable or not JSON/,
  );
});

test('the committed rate card parses', () => {
  const loaded = loadRateCard(
    join(import.meta.dir, '../../rate-cards/2026-10-22-list-prices.json'),
  );
  expect(loaded.card.entries.map((entry) => entry.model)).toContain('claude-fable-5-1');
  expect(loaded.card.entries.map((entry) => entry.model)).not.toContain('codex-auto-review');
});
