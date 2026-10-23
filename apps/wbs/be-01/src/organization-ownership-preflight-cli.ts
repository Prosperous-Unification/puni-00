import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { preflightOrganizationOwnership } from '@wbs/store-sqlite/organization-ownership-preflight';

// Proof: bypassing this check failed `refuses unexpected arguments before opening the
// database` (missing-file error replaced usage), observed 2026-10-17.
if (process.argv.length !== 2) {
  throw new Error('usage: DB_PATH=/path/to/copy.db bun organization-ownership-preflight-cli.ts');
}
const dbPath = process.env['DB_PATH'];
// Proof: removing this check failed `refuses absent and empty DB_PATH from a clean cwd`
// (no DB_PATH refusal), observed 2026-10-17.
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');

// Proof: replacing this opener with openExistingConnection failed `the actual connection
// opened by the CLI refuses an injected write` (write accepted), observed 2026-10-17.
const connection = openReadOnlyConnection(dbPath);
try {
  const report = await preflightOrganizationOwnership(connection.db);
  console.log(JSON.stringify(report, null, 2));
} finally {
  connection.close();
}
