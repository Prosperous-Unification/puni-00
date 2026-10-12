import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { buildValidatorBundle } from '../policy/trusted-modules';

/**
 * Strings only the runtime admission authority carries: its schema version, a table name and its
 * database file name. `bun:sqlite` itself is not one, because `relationships/declarations.ts`
 * uses an in-memory SQLite parser that belongs to the judge.
 */
const AUTHORITY_MARKERS = ['module-wiki-authority', 'authority_generation', 'authority.sqlite'];

test('the validator bundle carries no authority store', async () => {
  // Proof: re-adding the `submit-admission` route to cli.ts with dynamic imports of Dash's moved
  // `authority-store` and `submit` made this bundle carry all three markers (2026-10-11).
  const bundle = new TextDecoder().decode(
    await buildValidatorBundle(join(import.meta.dir, '..', 'cli.ts')),
  );
  expect(bundle.length).toBeGreaterThan(10_000);
  expect(AUTHORITY_MARKERS.filter((marker) => bundle.includes(marker))).toEqual([]);
}, 60_000);
