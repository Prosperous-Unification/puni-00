import { accessSync, constants } from 'node:fs';
import { userInfo } from 'node:os';
import { parseArgs } from 'node:util';

import type { AccessAct } from '@wbs/core';
import {
  AccessGrantRepository,
  directSuperAdminCount,
  operatorSubjectRefusal,
} from '@wbs/store-sqlite/access-grant';
import { openExistingConnection } from '@wbs/store-sqlite/db';
import { OPEN } from '@wbs/store-sqlite/gate';

/**
 * The host operator's one path to an organization's super-admins outside the
 * product (`wbs-permissions` P21): for an organization where no super-admin
 * can act. It needs the host, not a login. Each write is one immediate
 * transaction of {@link AccessGrantRepository}, so it runs beside a live
 * be-01. `--user` names a `users.id`, never a machine credential. There is no
 * `--force`: a non-member is admitted through onboarding first.
 */
const USAGE =
  'usage: DB_PATH=/path/plan.db bun access-grant-cli.ts grant-super-admin --organization <id> --user <id>\n' +
  '       … revoke-super-admin --organization <id> --user <id>';

/** The built-in role this CLI grants and revokes, and the only one. */
const SUPER_ADMIN_ROLE = 'org-super-admin';

/**
 * Every refusal the CLI models, each with its own exit code. A refusal is one
 * JSON line on stderr and nothing is written; anything else throws (exit 1).
 * A machine credential's id is refused as `machine_credential` rather than
 * the store's `not_a_member` (which it would earn as a `user` subject) or
 * `unknown_credential` (the store's word for a credential subject), so the
 * operator learns the id was a credential, not an absent account.
 */
const REFUSAL_EXIT_CODES = {
  malformed: 2,
  missing_database: 3,
  unreadable_database: 4,
  unknown_organization: 5,
  machine_credential: 6,
  not_a_member: 7,
  already_granted: 8,
  not_granted: 9,
  last_super_admin: 10,
} as const;

type Refusal =
  | { readonly refusal: 'malformed'; readonly reason: string; readonly usage: string }
  | {
      readonly refusal: 'missing_database' | 'unreadable_database';
      readonly path: string;
      readonly reason: string;
    }
  | { readonly refusal: 'unknown_organization'; readonly organizationId: string }
  | {
      readonly refusal:
        | 'machine_credential'
        | 'not_a_member'
        | 'already_granted'
        | 'not_granted'
        | 'last_super_admin';
      readonly organizationId: string;
      readonly userId: string;
    };

/** The command a well-formed invocation names. */
interface Command {
  readonly kind: 'grant-super-admin' | 'revoke-super-admin';
  readonly organizationId: string;
  readonly userId: string;
}

/**
 * The command `argv` names, or the refusal it earns. Validates the whole
 * invocation before the database is opened, so a malformed one touches nothing.
 */
function parseCommand(argv: readonly string[]): Command | Refusal {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: { organization: { type: 'string' }, user: { type: 'string' } },
      strict: true,
      allowPositionals: true,
    });
  } catch (cause) {
    // `parseArgs` throws only for the invocation it was given: an unknown flag,
    // a flag without its value. That is the modeled `malformed` refusal.
    return malformed(cause instanceof Error ? cause.message : String(cause));
  }
  const { values, positionals } = parsed;
  const [kind, ...extra] = positionals;
  if (positionals.length === 0)
    return malformed('name a command: grant-super-admin or revoke-super-admin');
  if (extra.length > 0) return malformed(`unexpected arguments: ${extra.join(' ')}`);
  if (kind !== 'grant-super-admin' && kind !== 'revoke-super-admin')
    return malformed(`unknown command ${kind}`);
  const organizationId = values.organization?.trim();
  if (organizationId === undefined || organizationId === '')
    return malformed('--organization <id> is required');
  const userId = values.user?.trim();
  if (userId === undefined || userId === '') return malformed('--user <id> is required');
  return { kind, organizationId, userId };
}

function malformed(reason: string): Refusal {
  return { refusal: 'malformed', reason, usage: USAGE };
}

/**
 * The refusal an absent or permission-closed database earns, or null when
 * the file may be opened for reading and writing. Checked before opening,
 * because `openExistingConnection` throws one undifferentiated error for both.
 *
 * Proof: 2026-11-08, the `unreadable_database` return replaced by
 * `process.exit(0)` failed `refuse an unreadable database, writing nothing`
 * (no refusal line) in `access-grant-cli.db.test.ts`, and the `ENOENT` branch
 * answering null failed `refuse a missing database without creating it` (the
 * open's own error, 17 stderr lines).
 *
 * @throws any other failure to reach the file (a directory path is opened and
 * throws there).
 */
function databaseRefusal(path: string): Refusal | null {
  try {
    accessSync(path, constants.R_OK | constants.W_OK);
    return null;
  } catch (cause) {
    const code = cause instanceof Error && 'code' in cause ? cause.code : undefined;
    const reason = cause instanceof Error ? cause.message : String(cause);
    if (code === 'ENOENT') return { refusal: 'missing_database', path, reason };
    if (code === 'EACCES' || code === 'EPERM')
      return { refusal: 'unreadable_database', path, reason };
    throw cause;
  }
}

/** Raw bytes, one line: Bun's console.error colours its output under FORCE_COLOR, which Nx sets. */
function refuse(refusal: Refusal): void {
  process.stderr.write(`${JSON.stringify(refusal)}\n`);
  process.exitCode = REFUSAL_EXIT_CODES[refusal.refusal];
}

/**
 * The operating-system login P21's deferred audit row will name as
 * `operator:<login>`.
 *
 * @throws when the login is empty, so no change is attributed to nobody.
 */
function operatorLogin(): string {
  const login = userInfo().username;
  if (login === '') throw new Error('the operating-system login is empty');
  return login;
}

/** Writes the grant, or names why not. The organization and subject were read already. */
async function grantSuperAdmin(
  grants: AccessGrantRepository,
  command: Command,
  act: AccessAct,
): Promise<{ readonly grantId: string } | Refusal> {
  const { organizationId, userId } = command;
  // TODO(wbs-permissions 4.1): write P21's `access_granted` audit row (origin
  // operator, actor operator:<login>) in this write's transaction once
  // `widen_organization_audit_access` admits the action.
  const outcome = await grants.grant(
    organizationId,
    {
      id: crypto.randomUUID(),
      scope: { kind: 'organization' },
      subject: { kind: 'user', userId },
      roleId: SUPER_ADMIN_ROLE,
      origin: 'operator',
    },
    act,
  );
  if (typeof outcome !== 'string') return { grantId: outcome.grant.id };
  switch (outcome) {
    // Proof: 2026-11-08, the store's membership check (`subjectRefusalOf`,
    // `access-grant.ts`) made to answer null failed `refuses a user who is
    // not a current member, writing nothing` (the outsider was granted), and
    // its duplicate read answering null failed `refuses a user who holds the
    // role directly already` (UNIQUE constraint thrown), both in
    // `access-grant-cli.db.test.ts`.
    case 'not_a_member':
    case 'already_granted':
      return { refusal: outcome, organizationId, userId };
    // An organization scope is `not_found` only when the organization is absent.
    case 'not_found':
      return { refusal: 'unknown_organization', organizationId };
    case 'unknown_role':
    case 'role_scope_mismatch':
    case 'unknown_group':
    case 'unknown_credential':
      throw new Error(
        `the store refused a built-in super-admin grant to a user as ${outcome}, which it cannot earn`,
      );
  }
}

/**
 * Deletes the user's direct organization-scope super-admin grant, or names
 * why not. CP14's count is the store's, inside the delete's transaction.
 */
async function revokeSuperAdmin(
  grants: AccessGrantRepository,
  command: Command,
  act: AccessAct,
): Promise<{ readonly grantId: string } | Refusal> {
  const { organizationId, userId } = command;
  const held = await grants.list(organizationId, {
    scope: { kind: 'organization' },
    subject: { kind: 'user', userId },
  });
  const grant = held.find((candidate) => candidate.roleId === SUPER_ADMIN_ROLE);
  if (grant === undefined) return { refusal: 'not_granted', organizationId, userId };
  // TODO(wbs-permissions 4.1): write P21's `access_revoked` audit row (origin
  // operator, actor operator:<login>) in this write's transaction once
  // `widen_organization_audit_access` admits the action.
  const outcome = await grants.revoke(organizationId, grant.id, act);
  if (typeof outcome !== 'string') return { grantId: outcome.grant.id };
  // Proof: 2026-11-08, the store's CP14 count (`revoke`, `access-grant.ts`)
  // made `false &&` failed `refuses revoking the last direct human
  // super-admin, writing nothing` in `access-grant-cli.db.test.ts` (revoked,
  // none left).
  if (outcome === 'last_super_admin') return { refusal: outcome, organizationId, userId };
  // A concurrent revoke deleted the grant between the read and the delete.
  return { refusal: 'not_granted', organizationId, userId };
}

const command = parseCommand(process.argv.slice(2));
if ('refusal' in command) refuse(command);
else {
  const dbPath = process.env['DB_PATH'];
  if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');
  const unopenable = databaseRefusal(dbPath);
  if (unopenable !== null) refuse(unopenable);
  else {
    const login = operatorLogin();
    const connection = openExistingConnection(dbPath);
    try {
      const refusal = operatorSubjectRefusal(connection.db, command.organizationId, command.userId);
      if (refusal === 'unknown_organization')
        refuse({ refusal, organizationId: command.organizationId });
      else if (refusal !== null)
        refuse({ refusal, organizationId: command.organizationId, userId: command.userId });
      else {
        // `OPEN`: this process is the only writer it coordinates, and each
        // write takes SQLite's own write lock (`BEGIN IMMEDIATE`).
        const grants = new AccessGrantRepository(connection.db, OPEN);
        const act: AccessAct = { actor: { kind: 'operator', login }, at: Date.now() };
        const outcome =
          command.kind === 'grant-super-admin'
            ? await grantSuperAdmin(grants, command, act)
            : await revokeSuperAdmin(grants, command, act);
        if ('refusal' in outcome) refuse(outcome);
        else
          process.stdout.write(
            `${JSON.stringify({
              command: command.kind,
              organizationId: command.organizationId,
              userId: command.userId,
              grantId: outcome.grantId,
              roleId: SUPER_ADMIN_ROLE,
              origin: 'operator',
              actor: `operator:${login}`,
              audit: 'deferred to wbs-permissions 4.1',
              superAdminCount: directSuperAdminCount(connection.db, command.organizationId, {
                besides: null,
              }),
            })}\n`,
          );
      }
    } finally {
      connection.close();
    }
  }
}
