// Reverses migrations this deploy applied, run from the Compose swap's and the
// Kubernetes schema Job's abort path:
//
//   bun run src/migrate-down-cli.ts --capture-file=<path> --target=<t> --attempt=<a>
//     --candidate=<c> [--capture-sha256=<hex>]
//   bun run src/migrate-down-cli.ts --to=<name|none>
//
// The capture is the complete applied set `migrate-status-cli.ts --capture` wrote
// before the forward migration. Exact-set mode removes every migration absent from
// it, including one older than the captured newest, and refuses changed bytes or an
// unexpected ledger. `--to` is the legacy manual timestamp rollback; `none` reverses all.
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
