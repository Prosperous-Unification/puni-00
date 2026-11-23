import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scratchSync } from '@tools/test-scratch';

import { git } from './tree';

/**
 * Actual input to the one-shot rename, before a39ba8ed3 introduced the renamed tree.
 * These tests run today's tool against this immutable parent, including its mixed old SQL
 * and future permission-model witnesses. Full Git history is required; missing history
 * throws instead of falling back to today's already-renamed source. Only the scratch
 * clone is checked out; the caller's checkout and index are never changed.
 * The audit witness uses its exact a39 source: that commit reordered the equivalent
 * scope ternary to the shape required by today's qualified protection. This is an explicit
 * two-revision fixture, not a claim that the untouched parent satisfies that later guard.
 */
export const HISTORICAL_TREE = scratchSync('rename-historical-input-');

const repository = fileURLToPath(new URL('../../../', import.meta.url));
git(repository, ['clone', '--shared', '--no-checkout', '--quiet', repository, HISTORICAL_TREE]);
git(HISTORICAL_TREE, [
  'checkout',
  '--quiet',
  '--detach',
  '1816f5848e11c40786f7919388f98abeb330ebeb',
]);
const audit = 'libs/wbs/adapters/store-sqlite/src/access-audit.ts';
writeFileSync(
  join(HISTORICAL_TREE, audit),
  git(repository, ['show', 'a39ba8ed373dbea965d29d3f6f110d134f49a5c5:' + audit]),
);
