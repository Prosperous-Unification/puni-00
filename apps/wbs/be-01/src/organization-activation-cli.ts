// Activates organization isolation on an existing WBS store: one legacy
// organization named `--name`, `--super-admin` (a user id or username) as its
// super-admin, every other user a member, every root mapped to it, then the
// durable marker. See `activateLegacyOrganization` for the transaction and
// `docs/runbook-organization-activation.md` for the operator procedure.
//
//   DB_PATH=/path/plan.db bun run src/organization-activation-cli.ts --mcp-store <mcp store> \
//     --name default --super-admin <user id or username> [--apply [--prune-retained-streams]]
//
// `--mcp-store` names mcp-01's store (`MCP_STORE_PATH`). Activation waits for its credential
// epoch advance (`apps/wbs/mcp-01/src/credential-epoch-cli.ts`, task 6.5): while the store is
// absent, lacks the epoch migration or is at epoch 0, `--apply` refuses before opening the WBS
// database, and a rehearsal prints its plan and then the same refusal. There is no bypass.
//
// `--prune-retained-streams` deletes the event streams of deleted projects that
// reconciliation would otherwise refuse (exit 6, `event_stream`); it is a usage
// error without `--apply`, so a rehearsal always reports them first.
//
// Without `--apply` it rehearses the whole transaction and rolls it back,
// printing the plan. Prints one JSON document on stdout; a refusal prints one
// JSON line on stderr and exits with its own code (3 activated, 4 organization exists,
// 5 super-admin unresolved, 6 reconciliation failed, 7 MCP epoch not advanced). A broken
// marker, a malformed legacy pair or MCP epoch, an unreadable MCP store or bad arguments throw.
//
// There is no undo. Activation is one-way: the marker refuses reverting, and
// rollback across it is refused (`openspec/changes/organization-ownership-and-access`,
// "Migration and rollback preserve tenant isolation"). Recover forward.
import { parseArgs } from 'node:util';

import { openExistingConnection } from '@wbs/store-sqlite/db';
import {
  activateLegacyOrganization,
  type LegacyActivationRefusal,
} from '@wbs/store-sqlite/organization-legacy-activation';

import { type McpEpochNotAdvanced, readMcpEpochReadiness } from './mcp-credential-epoch';

const REFUSAL_EXIT_CODES: Record<LegacyActivationRefusal['refusal'], number> = {
  already_activated: 3,
  organization_exists: 4,
  super_admin_unresolved: 5,
  reconciliation_failed: 6,
};
const MCP_EPOCH_NOT_ADVANCED_EXIT = 7;

const USAGE =
  'usage: DB_PATH=/path/plan.db bun organization-activation-cli.ts --mcp-store <mcp store> --name <name> --super-admin <user id or username> [--apply [--prune-retained-streams]]';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');
const { values, positionals } = parseArgs({
  options: {
    name: { type: 'string' },
    'mcp-store': { type: 'string' },
    'super-admin': { type: 'string' },
    apply: { type: 'boolean', default: false },
    'prune-retained-streams': { type: 'boolean', default: false },
  },
  strict: true,
  allowPositionals: true,
});
const name = values.name?.trim();
const superAdmin = values['super-admin'];
const mcpStore = values['mcp-store'];
if (
  positionals.length > 0 ||
  // Proof: 2026-10-22, without this clause `refuses without --mcp-store before opening the
  // database` exited 7 (an `absent` store at path undefined) instead of the usage error.
  mcpStore === undefined ||
  mcpStore === '' ||
  name === undefined ||
  name === '' ||
  superAdmin === undefined ||
  superAdmin === '' ||
  // Proof: 2026-10-20, without this clause `refuses pruning without --apply before opening the
  // database` and `prunes a deleted project's retained stream only with --apply` exited 0.
  (values['prune-retained-streams'] && !values.apply)
)
  throw new Error(USAGE);

/** Raw bytes, one line: see the refusal branch below for why not console.error. */
function refuseMcpEpoch(refusal: McpEpochNotAdvanced): void {
  process.stderr.write(`${JSON.stringify(refusal)}\n`);
  process.exitCode = MCP_EPOCH_NOT_ADVANCED_EXIT;
}

const mcpEpoch = readMcpEpochReadiness(mcpStore);
// Proof: 2026-10-22, applying regardless here made `refuses activation while the MCP epoch is 0,
// writing nothing` (organization-activation-cli.db.test.ts) print `mode: applied`.
if (values.apply && mcpEpoch !== null) refuseMcpEpoch(mcpEpoch);
else {
  const connection = openExistingConnection(dbPath);
  try {
    const outcome = await activateLegacyOrganization(connection.db, {
      name,
      superAdmin,
      at: Date.now(),
      isApplied: values.apply,
      isPruningRetainedStreams: values['prune-retained-streams'],
    });
    if (outcome.ok) {
      const { mappedRoots, ...activation } = outcome.activation;
      process.stdout.write(
        `${JSON.stringify({ ...activation, mappedRoots: Object.fromEntries(mappedRoots) }, null, 2)}\n`,
      );
      // Only a rehearsal reaches here with the epoch not advanced: it shows the plan, then refuses.
      // Proof: 2026-10-22, dropping this made `rehearses while the MCP epoch is 0, then reports
      // the refusal` (organization-activation-cli.db.test.ts) exit 0.
      if (mcpEpoch !== null) refuseMcpEpoch(mcpEpoch);
    } else {
      // Raw bytes, one line: Bun's console.error wraps its output in red ANSI escapes under
      // FORCE_COLOR, which Nx sets, and the caller parses this line.
      // Proof: 2026-10-20, console.error here failed the seven refusal-parsing cases of
      // `organization-activation-cli.db.test.ts` under FORCE_COLOR=1, stderr beginning `\x1b[0m\x1b[31m`.
      process.stderr.write(`${JSON.stringify(outcome.refused)}\n`);
      process.exitCode = REFUSAL_EXIT_CODES[outcome.refused.refusal];
    }
  } finally {
    connection.close();
  }
}
