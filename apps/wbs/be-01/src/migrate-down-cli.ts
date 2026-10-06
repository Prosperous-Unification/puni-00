// Reverses migrations this deploy applied, run from the swap executor's abort
// path while the incoming container is still up:
//
//   docker exec be-01-<color> bun run src/migrate-down-cli.ts --to=<name|none>
//
// `--to` is the newest migration that was applied BEFORE the deploy, captured
// by migrate-status-cli.ts in the same swap. `none` means the database had no
// migrations applied at all, so everything this deploy added comes back off.
//
// Blue and green share one SQLite file. A forward migration is required to be
// additive, so the old colour keeps working while green migrates; the reverse
// is not additive by nature, which is why this runs only on an abort, when
// green is being taken away and blue is the release that will keep serving.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { rollbackTo } from '@wbs/store-sqlite/migrate-down';
import {
  parseMigrationSetCapture,
  restoreAppliedMigrationSet,
} from '@wbs/store-sqlite/migration-set';

import { downModeOf } from './migration-cli-options';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');

const mode = downModeOf(process.argv.slice(2));
if (mode.kind === 'capture') {
  // Proof: replacing capture read/parse errors with legacy rollback-to-none made the
  // missing, unreadable and malformed-capture CLI tests exit 0 and reverse additions.
  const bytes = readFileSync(mode.path);
  // Proof: removing this comparison made the Compose manual-recovery test exit 0
  // and delete both the baseline shared-people and candidate lifecycle tables.
  if (
    mode.expectedSha256 !== null &&
    createHash('sha256').update(bytes).digest('hex') !== mode.expectedSha256
  ) {
    throw new Error('migration capture SHA-256 differs from the recorded deploy attempt');
  }
  const capture: unknown = JSON.parse(bytes.toString('utf8'));
  const reversed = restoreAppliedMigrationSet(
    dbPath,
    './drizzle',
    parseMigrationSetCapture(capture, mode.identity),
  );
  console.log(`restored captured migration set: ${reversed.join(', ') || '(already restored)'}`);
  process.exit(0);
}

const target = mode.target;

const reversed = rollbackTo(dbPath, './drizzle', target);
if (reversed.length === 0) {
  console.log(`no migrations to roll back (already at ${target})`);
} else {
  console.log(`rolled back: ${reversed.join(', ')}`);
}
