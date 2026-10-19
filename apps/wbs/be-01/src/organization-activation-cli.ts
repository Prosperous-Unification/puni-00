// Activates organization isolation on an existing WBS store: one legacy
// organization named `--name`, `--super-admin` (a user id or username) as its
// super-admin, every other user a member, every root mapped to it, then the
// durable marker. See `activateLegacyOrganization` for the transaction and
// `docs/runbook-organization-activation.md` for the operator procedure.
//
//   DB_PATH=/path/plan.db bun run src/organization-activation-cli.ts \
//     --name default --super-admin <user id or username> [--apply [--prune-retained-streams]]
//
// `--prune-retained-streams` deletes the event streams of deleted projects that
// reconciliation would otherwise refuse (exit 6, `event_stream`); it is a usage
// error without `--apply`, so a rehearsal always reports them first.
//
// Without `--apply` it rehearses the whole transaction and rolls it back,
// printing the plan. Prints one JSON document on stdout; a refusal prints one
// on stderr and exits with its own code (3 activated, 4 organization exists,
// 5 super-admin unresolved, 6 reconciliation failed). A broken marker, a
// malformed legacy pair or bad arguments throw.
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

const REFUSAL_EXIT_CODES: Record<LegacyActivationRefusal['refusal'], number> = {
  already_activated: 3,
  organization_exists: 4,
  super_admin_unresolved: 5,
  reconciliation_failed: 6,
};

const USAGE =
  'usage: DB_PATH=/path/plan.db bun organization-activation-cli.ts --name <name> --super-admin <user id or username> [--apply [--prune-retained-streams]]';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');
const { values, positionals } = parseArgs({
  options: {
    name: { type: 'string' },
    'super-admin': { type: 'string' },
    apply: { type: 'boolean', default: false },
    'prune-retained-streams': { type: 'boolean', default: false },
  },
  strict: true,
  allowPositionals: true,
});
const name = values.name?.trim();
const superAdmin = values['super-admin'];
if (
  positionals.length > 0 ||
  name === undefined ||
  name === '' ||
  superAdmin === undefined ||
  superAdmin === '' ||
  // Proof: 2026-10-20, without this clause `refuses pruning without --apply before opening the
  // database` and `prunes a deleted project's retained stream only with --apply` exited 0.
  (values['prune-retained-streams'] && !values.apply)
)
  throw new Error(USAGE);

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
    console.log(
      JSON.stringify({ ...activation, mappedRoots: Object.fromEntries(mappedRoots) }, null, 2),
    );
  } else {
    console.error(JSON.stringify(outcome.refused, null, 2));
    process.exitCode = REFUSAL_EXIT_CODES[outcome.refused.refusal];
  }
} finally {
  connection.close();
}
