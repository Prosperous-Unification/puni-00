import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { buildValidatorBundle } from '../policy/trusted-modules';
import { executableBuildConfig } from './build';

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

/**
 * Names only Twilight Dash's activation runtime carries: the review invoker's process launcher and
 * journal lock, and the observation store's table prefix.
 */
const ACTIVATION_RUNTIME_MARKERS = [
  'ProcessReviewInvoker',
  'FileJournalLock',
  'activation_observation',
];

test('the validator and executable bundles carry no activation runtime', async () => {
  // Proof: re-importing `ProcessReviewInvoker` from Dash's `review/invoker.ts` into cli.ts and
  // naming it in the `validate-review-provenance` route failed this test with `validator.mjs`
  // carrying `ProcessReviewInvoker` (2026-10-12).
  const validator = new TextDecoder().decode(
    await buildValidatorBundle(join(import.meta.dir, '..', 'cli.ts')),
  );
  const built = await Bun.build(executableBuildConfig());
  if (!built.success || built.outputs.length !== 1) {
    throw new Error(`cannot build bin.mjs: ${built.logs.map(String).join('; ')}`);
  }
  const executable = await built.outputs[0].text();
  for (const [name, bundle] of [
    ['validator.mjs', validator],
    ['bin.mjs', executable],
  ] as const) {
    expect(bundle.length, name).toBeGreaterThan(10_000);
    expect(
      ACTIVATION_RUNTIME_MARKERS.filter((marker) => bundle.includes(marker)),
      name,
    ).toEqual([]);
  }
}, 120_000);
