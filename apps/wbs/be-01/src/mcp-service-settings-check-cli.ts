import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { readOrganizationActivationBeforeMigration } from '@wbs/store-sqlite/organization-activation';

import { loadMcpServiceSettings, missingMcpServiceSettings } from './config';
import { machineGrantSettingsFaultsOf } from './runtime/machine-grant';

/**
 * The exit while the store is activated and the machine grant settings
 * (`wbs-mcp-agent-surface` M3) are missing or would fail boot, so the deploy
 * refuses before migrating instead of be-01 refusing at boot after it
 * (`bootBe01`'s readiness). The deploy runs this with the candidate image and
 * be-01's own env files, on the live store, read-only; it prints one JSON
 * document, `{ activation, authorizationServer, missing, invalid }`, whose
 * `authorizationServer` tells the deploy whether to run the audience
 * preflight (`trusted-issuer-audience-check-cli.ts`).
 *
 * `activation` is `not_migrated` only when the ledger proves the marker's
 * migration never ran; a broken marker throws. Settings that `loadMcpServiceSettings`
 * refuses (an equal pair, a non-canonical server, `_PREVIOUS` alone) throw
 * whatever the activation, because boot loads them the same way.
 */
const UNREADY_EXIT = 4;

// Proof: with this check removed, `refuses arguments before opening the
// database` (mcp-service-settings-check-cli.db.test.ts) reported the missing
// file instead of the usage; watched 2026-10-28.
if (process.argv.length !== 2)
  throw new Error('usage: DB_PATH=… [be-01 environment] bun mcp-service-settings-check-cli.ts');
const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');

const settings = loadMcpServiceSettings(process.env);
const missing = missingMcpServiceSettings(settings);
const invalid = await machineGrantSettingsFaultsOf(settings);
const connection = openReadOnlyConnection(dbPath);
try {
  const activation = readOrganizationActivationBeforeMigration(connection.db);
  console.log(
    JSON.stringify(
      { activation, authorizationServer: settings.authorizationServer, missing, invalid },
      null,
      2,
    ),
  );
  // Proof: with this condition replaced by `false`, `refuses an activated
  // store without a setting, naming it` and `refuses an activated store with
  // a weak grant key` (mcp-service-settings-check-cli.db.test.ts) exited 0;
  // watched 2026-10-28.
  if (activation === 'activated' && (missing.length > 0 || invalid.length > 0)) {
    console.error(
      `the store is activated and be-01 would refuse to boot it: ${[
        ...missing.map((name) => `${name} is missing`),
        ...invalid,
      ].join('; ')}; see docs/runbook-organization-activation.md`,
    );
    process.exitCode = UNREADY_EXIT;
  }
} finally {
  connection.close();
}
