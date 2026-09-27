import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'bun:test';

import { LAB_MIGRATION } from './lab';

const ROOT = resolve(import.meta.dir, '../../../..');

/** Drizzle's `created_at` for a migration folder: its numeric prefix. */
function stampOf(folder: string): number {
  return Number.parseInt(folder.split('_')[0] ?? '', 10);
}

it('ships exactly the lab migration the rehearsal asserts on', () => {
  expect(readdirSync(resolve(ROOT, 'deploy/k8s/wbs/lab/migrations'))).toEqual([LAB_MIGRATION]);
});

// A lab stamp older than the newest committed migration makes the induced-failure scenario
// end `rollback-failed`: migrate-down reverses only migrations newer than the captured
// baseline, so the lab column survives the schema rollback (CI run 36296199037).
it('stamps the lab migration after every committed backend migration', () => {
  const committed = readdirSync(resolve(ROOT, 'apps/wbs/be-01/drizzle'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => stampOf(entry.name));
  expect(committed.length).toBeGreaterThan(0);
  expect(stampOf(LAB_MIGRATION)).toBeGreaterThan(Math.max(...committed));
});
