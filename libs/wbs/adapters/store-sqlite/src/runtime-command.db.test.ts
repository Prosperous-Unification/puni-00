import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runtimeCommandConformance,
  runtimeRecordConformance,
} from '@wbs/conformance/runtime-command-conformance';
import { describe } from 'bun:test';

import { runMigrations } from './migrate';
import { openSqliteSource } from './source';

const migrations = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
describe('SQLite runtime command persistence', () => {
  const open = () => {
    const directory = mkdtempSync(join(tmpdir(), 'runtime-command-'));
    const dbPath = join(directory, 'plan.db');
    runMigrations(dbPath, migrations);
    const source = openSqliteSource({ dbPath });
    return Promise.resolve({
      source,
      async close() {
        await source.close();
        rmSync(directory, { recursive: true, force: true });
      },
    });
  };
  runtimeCommandConformance(open);
  runtimeRecordConformance(open);
});
