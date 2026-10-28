import type { RunDocker } from './docker-deadline';

/**
 * Trusted issuer and machine credential ids as an operator names them in
 * `--accept-breaking`: UUIDs and slugs. The list crosses an SSH shell, so
 * nothing outside this set may reach it.
 */
const ACCEPTED_ID = /^[A-Za-z0-9._:-]+$/;

/**
 * The ids an operator accepts as breaking the audience rule
 * (`wbs-mcp-agent-surface` M2), from `--accept-breaking=<id,id>`, which maps
 * one to one onto the candidate's `WBS_ACCEPT_BREAKING_AUDIENCES`. Empty
 * accepts nothing.
 *
 * @throws on an empty entry, a repeated id, or a character outside
 * {@link ACCEPTED_ID}.
 */
export function parseAcceptBreaking(raw: string): string[] {
  if (raw === '') return [];
  const ids = raw.split(',');
  // Proof: with this refusal removed, `refuses a malformed accept list`
  // (mcp-preflight.test.ts) parsed `ti-a,,ti-b` into an empty id; watched 2026-10-28.
  if (ids.some((id) => !ACCEPTED_ID.test(id)) || new Set(ids).size !== ids.length)
    throw new Error(
      `--accept-breaking must be distinct ids of [A-Za-z0-9._:-] separated by single commas, got "${raw}"`,
    );
  return ids;
}

/** What `mcp-service-settings-check-cli.ts` reports about the live store. */
export interface McpSettingsReport {
  readonly activation: 'pre_activation' | 'activated' | 'not_migrated';
  readonly authorizationServer: string | null;
}

/** A candidate CLI's absence under a readable `src`: the release predates the check. */
const ABSENT = 'cli-absent';

/** The candidate's own CLIs this preflight runs, by path inside the image. */
export const MCP_PREFLIGHT_CLIS = {
  settings: 'src/mcp-service-settings-check-cli.ts',
  audiences: 'src/trusted-issuer-audience-check-cli.ts',
} as const;

/** Where the candidate's data comes from and which env files configure it. */
export interface McpPreflightTarget {
  /** The pinned candidate image. */
  readonly image: string;
  /** The environment root whose `data` directory holds the store. */
  readonly root: string;
  /** be's validated `DB_PATH` inside the container. */
  readonly databasePath: string;
  /** be's env files in Compose order, so the candidate sees be-01's own settings. */
  readonly envFiles: readonly string[];
  readonly acceptBreaking: readonly string[];
}

/**
 * Runs one candidate CLI the way be-01 would see the store, before any writer
 * stops. Nothing here writes: both CLIs open the database `readonly`. The data
 * directory is bound writable only because a WAL reader beside the live
 * writer maps its `-shm`, as the runbook's manual check did. `--network none`
 * and `--pull never` keep the run to the image already pulled and verified.
 *
 * An absent CLI under a readable `src` prints {@link ABSENT}: a release older
 * than the check. A nonregular CLI path exits 73 and an unreadable `src` 74,
 * as the stored-vocabulary commands do. Secrets reach the container through
 * `--env-file` paths, never argv, so a refusal's echoed command holds none.
 */
export function mcpPreflightCommand(target: McpPreflightTarget, cli: string): string[] {
  return [
    'run',
    '--rm',
    '--pull',
    'never',
    '--network',
    'none',
    '--mount',
    `type=bind,source=${target.root}/data,target=/data`,
    ...target.envFiles.flatMap((file) => ['--env-file', file]),
    '-e',
    `DB_PATH=${target.databasePath}`,
    ...(target.acceptBreaking.length > 0
      ? ['-e', `WBS_ACCEPT_BREAKING_AUDIENCES=${target.acceptBreaking.join(',')}`]
      : []),
    '--entrypoint',
    'sh',
    target.image,
    '-c',
    `if test -f ${cli}; then exec bun run ${cli}; elif test -e ${cli}; then exit 73; elif test -d src && test -r src && test -x src; then printf '"${ABSENT}"\\n'; else exit 74; fi`,
  ];
}

const ACTIVATIONS: ReadonlySet<string> = new Set(['pre_activation', 'activated', 'not_migrated']);

/**
 * Parses the settings CLI's JSON at the Docker output boundary, or null for a
 * candidate that ships no such CLI.
 *
 * @throws on any other shape.
 */
export function parseMcpSettingsReport(output: string): McpSettingsReport | null {
  const parsed: unknown = JSON.parse(output);
  if (parsed === ABSENT) return null;
  if (parsed === null || typeof parsed !== 'object')
    throw new Error('candidate reported malformed machine grant settings');
  const activation: unknown = Reflect.get(parsed, 'activation');
  const authorizationServer: unknown = Reflect.get(parsed, 'authorizationServer');
  // Proof: with the activation test removed, `refuses a malformed settings
  // report` (mcp-preflight.test.ts) parsed `{"activation":"maybe"}`; watched 2026-10-28.
  if (
    typeof activation !== 'string' ||
    !ACTIVATIONS.has(activation) ||
    (authorizationServer !== null && typeof authorizationServer !== 'string')
  )
    throw new Error('candidate reported malformed machine grant settings');
  // Boundary: membership in ACTIVATIONS was checked above.
  return { activation: activation as McpSettingsReport['activation'], authorizationServer };
}

/**
 * The MCP agent surface's pre-migration admission for a be swap, run while
 * the outgoing colour still serves, so a refusal changes nothing:
 *
 * 1. the machine grant settings: an activated store whose candidate env lacks
 *    `MCP_BE_INTERNAL_SECRET`, `WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT` or
 *    `WBS_MCP_AUTHORIZATION_SERVER`, or holds one boot would refuse, refuses
 *    here (exit 4) rather than at be-01's boot after migrating;
 * 2. the audience preflight, whenever the candidate env names an
 *    authorization server: a stored audience that breaks it and is not in
 *    `acceptBreaking` refuses (exit 3).
 *
 * Each refusal is the Docker failure, which carries the CLI's stderr. Without
 * a server the store cannot be activated (step 1 refused that), so there is
 * nothing to judge audiences against, and the skip is logged. A candidate
 * without a CLI predates its check; that is logged too.
 *
 * @throws when either CLI refuses, fails, or prints anything malformed.
 */
export async function assertMcpSurfaceReady(
  target: McpPreflightTarget,
  sh: RunDocker,
  log: (line: string) => void,
): Promise<void> {
  const report = parseMcpSettingsReport(
    await sh(mcpPreflightCommand(target, MCP_PREFLIGHT_CLIS.settings)),
  );
  if (report === null) {
    log(
      `candidate ships no ${MCP_PREFLIGHT_CLIS.settings}: it predates the MCP preflight, which is skipped`,
    );
    return;
  }
  log(`machine grant settings admitted on a ${report.activation} store`);
  if (report.authorizationServer === null) {
    // The settings CLI refuses an activated store without a server.
    // Proof: with this refusal removed, `refuses an activated store reported
    // without a server` (mcp-preflight.test.ts) resolved; watched 2026-10-28.
    if (report.activation === 'activated')
      throw new Error('an activated store reported no authorization server');
    log('audience preflight skipped: the candidate env names no WBS_MCP_AUTHORIZATION_SERVER');
    return;
  }
  const audiences: unknown = JSON.parse(
    await sh(mcpPreflightCommand(target, MCP_PREFLIGHT_CLIS.audiences)),
  );
  if (audiences === ABSENT) {
    log(`candidate ships no ${MCP_PREFLIGHT_CLIS.audiences}: the audience preflight is skipped`);
    return;
  }
  const breaking: unknown =
    audiences !== null && typeof audiences === 'object'
      ? Reflect.get(audiences, 'breaking')
      : undefined;
  // Proof: with this check removed, `refuses a malformed audience check`
  // (mcp-preflight.test.ts) failed on a raw TypeError instead; watched 2026-10-28.
  if (!Array.isArray(breaking)) throw new Error('candidate reported a malformed audience check');
  log(
    `audience preflight passed against ${report.authorizationServer}; ${String(breaking.length)} breaking row(s), all accepted`,
  );
}
