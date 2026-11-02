import { canonicalMcpAuthorizationServer } from '@wbs/contracts';
import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { hasTable, isMigrationApplied } from '@wbs/store-sqlite/migration-ledger';
import { checkTrustedIssuerAudiences } from '@wbs/store-sqlite/trusted-issuer-audience-check';

/**
 * The exit while a row {@link checkTrustedIssuerAudiences} lists is not named
 * in `WBS_ACCEPT_BREAKING_AUDIENCES` (comma-separated ids, the deploy CLI's
 * `--accept-breaking`), so a swap refuses; 0 when every listed row is. The
 * check is a dry run on a read-only connection, printed as JSON. The deploy
 * runs it before migrating, so a store the ledger proves has not reached
 * {@link TRUSTED_ISSUER_MIGRATION} holds no registration and passes, printed
 * with `notMigrated`; a ledger naming it without the table throws.
 */
const UNACCEPTED_EXIT = 3;

/** The migration that creates both tables the check reads. */
const TRUSTED_ISSUER_MIGRATION = '20261022100000_add_machine_credential';

// Proof: with this check removed, `refuses arguments before opening the
// database` (trusted-issuer-audience-check-cli.db.test.ts) reported the
// missing file instead of the usage; watched 2026-10-27.
if (process.argv.length !== 2)
  throw new Error(
    'usage: DB_PATH=… WBS_MCP_AUTHORIZATION_SERVER=… [WBS_ACCEPT_BREAKING_AUDIENCES=id,…] bun trusted-issuer-audience-check-cli.ts',
  );
const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');
const configured = process.env['WBS_MCP_AUTHORIZATION_SERVER'];
if (configured === undefined || configured === '')
  throw new Error('WBS_MCP_AUTHORIZATION_SERVER must be set');
const authorizationServer = canonicalMcpAuthorizationServer(
  configured,
  'WBS_MCP_AUTHORIZATION_SERVER',
);
const named = process.env['WBS_ACCEPT_BREAKING_AUDIENCES'] ?? '';
const accepted = named === '' ? [] : named.split(',');
// An empty entry is a typo in the list, never an id.
if (accepted.some((id) => id.trim() === '' || id.trim() !== id))
  throw new Error('WBS_ACCEPT_BREAKING_AUDIENCES must be ids separated by single commas');

const connection = openReadOnlyConnection(dbPath);
try {
  // Proof: with this branch removed, `passes a store the trusted issuer
  // migration has not reached` (trusted-issuer-audience-check-cli.db.test.ts)
  // exited 1 on the absent table instead of 0; watched 2026-10-28.
  if (!isMigrationApplied(connection.db, TRUSTED_ISSUER_MIGRATION)) {
    if (hasTable(connection.db, 'organization_trusted_issuer'))
      throw new Error(
        `organization_trusted_issuer exists but the ledger lacks ${TRUSTED_ISSUER_MIGRATION}`,
      );
    const empty = { breaking: [], unaccepted: [] };
    console.log(
      JSON.stringify(
        { authorizationServer, notMigrated: TRUSTED_ISSUER_MIGRATION, ...empty },
        null,
        2,
      ),
    );
  } else {
    const check = checkTrustedIssuerAudiences(
      connection.db,
      authorizationServer,
      new Set(accepted),
    );
    console.log(JSON.stringify(check, null, 2));
    if (check.unaccepted.length > 0) {
      console.error(
        `${String(check.unaccepted.length)} stored audience(s) break WBS_MCP_AUTHORIZATION_SERVER and are not accepted: ${check.unaccepted.map(({ kind, id }) => `${kind} ${id}`).join(', ')}`,
      );
      process.exitCode = UNACCEPTED_EXIT;
    }
  }
} finally {
  connection.close();
}
