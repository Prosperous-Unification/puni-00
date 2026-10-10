// Reports the applied migrations, run by deploy callers immediately BEFORE the
// migrate step so an abort afterwards can restore that set:
//
//   bun run src/migrate-status-cli.ts --capture --target=<t> --attempt=<a> --candidate=<c>
//   bun run src/migrate-status-cli.ts
//
// `--capture` prints the versioned complete name/hash capture `migrate-down-cli.ts
// --capture-file` consumes; without flags it prints the newest name or `none` for
// legacy `--to` rollback. Stdout carries only that answer, because the caller parses
// it. A tier that cannot answer must fail the deploy rather than print something
// the abort path would read as "roll back everything".
import { openDatabase } from '@wbs/store-sqlite/db';
import { type AppliedMigration, ROLLBACK_ALL } from '@wbs/store-sqlite/migrate-down';
import { captureAppliedMigrationSet } from '@wbs/store-sqlite/migration-set';

import { statusModeOf } from './migration-cli-options';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');

const mode = statusModeOf(process.argv.slice(2));
if (mode.kind === 'capture') {
  console.log(JSON.stringify(captureAppliedMigrationSet(dbPath, './drizzle', mode.identity)));
  process.exit(0);
}

const db = openDatabase(dbPath);
try {
  // The table does not exist until the first migration runs; that is a real
  // "nothing applied" answer rather than an error.
  const exists = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
    )
    .get();
  if (exists === null) {
    console.log(ROLLBACK_ALL);
  } else {
    const rows = db
      .query<AppliedMigration, []>(
        'SELECT id, hash, created_at, name FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
      )
      .all();
    // `rows[0]` is typed non-nullish here (noUncheckedIndexedAccess is off in
    // this repo), so the length check is what actually guards the read.
    console.log(rows.length === 0 ? ROLLBACK_ALL : (rows[0].name ?? ROLLBACK_ALL));
  }
} finally {
  db.close();
}
