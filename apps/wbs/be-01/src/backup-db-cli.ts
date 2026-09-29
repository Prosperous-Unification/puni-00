// Takes the pre-migration backup, run by the swap executor's `backup-db` step
// in the incoming container before it migrates the shared database:
//
//   docker exec be-01-<color> bun run src/backup-db-cli.ts /data/backups/<name>.db
//
// Prints one JSON line (path, sha256, bytes, migrations) and nothing else,
// because the caller parses it. See `snapshotDatabase` for what is verified.
import { snapshotDatabase } from '@wbs/store-sqlite/backup';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');
const target = process.argv.at(2);
if (target === undefined || target === '') {
  throw new Error('usage: backup-db-cli.ts <snapshot-path>');
}

console.log(JSON.stringify(snapshotDatabase(dbPath, target)));
