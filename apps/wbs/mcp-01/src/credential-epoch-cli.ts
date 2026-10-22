// Advances the MCP store's credential epoch for organization activation (task 6.5): revokes
// every pre-activation refresh family and session and moves the epoch from 0 to 1. See
// `advanceCredentialEpoch` for the transaction and the in-use guard, and
// `docs/runbook-organization-activation.md` for where it sits in the cutover.
//
//   MCP_STORE_PATH=/data/mcp-session.sqlite bun apps/wbs/mcp-01/src/credential-epoch-cli.ts [--apply]
//
// Without `--apply` it rehearses the transaction and rolls it back. Prints one JSON document
// on stdout: `planned` (dry run), `advanced` or `already_activated` (a no-op), each exit 0.
// While another process has the store open it prints `{"refusal":"store_in_use"}` on stderr
// and exits 3, changing nothing. An absent, unreadable, unmigrated or unknown-epoch store, or
// bad arguments, throw (exit 1). There is no undo: epoch 1 is one-way.
import { parseArgs } from 'node:util';

import { advanceCredentialEpoch, McpStoreInUse } from './credential-epoch';

const USAGE = 'usage: MCP_STORE_PATH=<store> bun credential-epoch-cli.ts [--apply]';
const STORE_IN_USE_EXIT = 3;

const path = process.env['MCP_STORE_PATH'];
if (path === undefined || path === '') throw new Error(`MCP_STORE_PATH must be set; ${USAGE}`);
const { values, positionals } = parseArgs({
  options: { apply: { type: 'boolean', default: false } },
  strict: true,
  allowPositionals: true,
});
if (positionals.length > 0) throw new Error(USAGE);

try {
  const advance = advanceCredentialEpoch(path, Date.now(), values.apply);
  process.stdout.write(`${JSON.stringify(advance, null, 2)}\n`);
} catch (cause) {
  if (!(cause instanceof McpStoreInUse)) throw cause;
  // Raw bytes, one line: Bun's console.error colours its output under FORCE_COLOR.
  process.stderr.write(`${JSON.stringify({ refusal: 'store_in_use', message: cause.message })}\n`);
  process.exitCode = STORE_IN_USE_EXIT;
}
