// Links a fleet credential to an existing account, or unlinks it (wbs-team-claims D6):
//
//   DB_PATH=… bun run src/link-credential-cli.ts --issuer=<iss> --subject=<sub>
//     --account=<id or username> [--person=<person id>]
//   DB_PATH=… bun run src/link-credential-cli.ts --unlink --issuer=<iss> --subject=<sub>
//
// Runs only where the other host CLIs run, against the live store. It writes one
// `external_identity` row and prints it as JSON; every refusal exits non-zero and
// writes nothing. It never creates an account or a membership.
import { linkCredential, unlinkCredential } from '@wbs/store-sqlite/credential-link';
import { openExistingConnection } from '@wbs/store-sqlite/db';

type Flag = 'issuer' | 'subject' | 'account' | 'person' | 'unlink';
const FLAGS: readonly Flag[] = ['issuer', 'subject', 'account', 'person', 'unlink'];
const USAGE =
  'usage: link-credential-cli.ts --issuer=<iss> --subject=<sub> --account=<id or username> [--person=<id>]' +
  ' | --unlink --issuer=<iss> --subject=<sub>';

/** `--name=value` or `--name value`; `--unlink` alone. Unknown, repeated or empty flags refuse. */
function flagsOf(argv: readonly string[]): Map<Flag, string> {
  const flags = new Map<Flag, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv.at(index);
    if (argument === undefined) throw new Error(`argument ${String(index)} vanished`);
    const [name = '', ...inline] = argument.startsWith('--') ? argument.slice(2).split('=') : [];
    const flag = FLAGS.find((known) => known === name);
    if (flag === undefined) throw new Error(`unknown argument ${argument}; ${USAGE}`);
    if (flags.has(flag)) throw new Error(`--${flag} given twice; ${USAGE}`);
    if (flag === 'unlink') {
      if (inline.length > 0) throw new Error(`--unlink takes no value; ${USAGE}`);
      flags.set(flag, 'true');
      continue;
    }
    const value = inline.length > 0 ? inline.join('=') : argv.at((index += 1));
    if (value === undefined || value === '' || value.startsWith('--'))
      throw new Error(`--${flag} needs a value; ${USAGE}`);
    flags.set(flag, value);
  }
  return flags;
}

function requireFlag(flags: ReadonlyMap<Flag, string>, flag: Flag): string {
  const value = flags.get(flag);
  if (value === undefined) throw new Error(`--${flag} is required; ${USAGE}`);
  return value;
}

const flags = flagsOf(process.argv.slice(2));
const unlink = flags.has('unlink');
if (unlink && (flags.has('account') || flags.has('person')))
  throw new Error(`--unlink names only the pair; ${USAGE}`);
const pair = { issuer: requireFlag(flags, 'issuer'), subject: requireFlag(flags, 'subject') };
const account = unlink ? '' : requireFlag(flags, 'account');
const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');

// An existing store only: a mistyped DB_PATH must not create an empty database.
const connection = openExistingConnection(dbPath);
try {
  if (unlink) {
    const outcome = unlinkCredential(connection.db, pair);
    if (outcome.kind === 'not_linked')
      throw new Error(`${pair.issuer} ${pair.subject} is not linked to any account`);
    if (outcome.kind === 'own_sign_in')
      throw new Error(
        `${pair.issuer} ${pair.subject} is the sign-in of account ${outcome.account.username} (${outcome.account.id}) itself; it cannot be unlinked`,
      );
    console.log(JSON.stringify(outcome, null, 2));
  } else {
    const outcome = linkCredential(
      connection.db,
      { ...pair, account, personId: flags.get('person') ?? null },
      Date.now(),
    );
    switch (outcome.kind) {
      case 'linked':
        console.log(JSON.stringify(outcome, null, 2));
        break;
      case 'inactive':
        throw new Error(
          'organization isolation is not activated: logins do not read external_identity yet, so a linked credential would create a new account at its first login',
        );
      case 'unknown_account':
        throw new Error(`no account has the id or username ${outcome.account}`);
      case 'ambiguous_account':
        throw new Error(
          `${outcome.account} names more than one account: ${outcome.matches.map(({ id, username }) => `${username} (${id})`).join(', ')}; pass the id`,
        );
      case 'already_linked':
        throw new Error(
          `${pair.issuer} ${pair.subject} is already linked to account ${outcome.account.username} (${outcome.account.id}); unlink it first`,
        );
      case 'sign_in_pair':
        throw new Error(
          `${pair.issuer} ${pair.subject} is the sign-in of account ${outcome.account.username} (${outcome.account.id}); it cannot be linked as a credential`,
        );
      case 'unknown_person':
        throw new Error(`no person has the id ${outcome.personId}`);
      case 'person_not_bound':
        throw new Error(
          `person ${outcome.personId} is ${outcome.boundTo === null ? 'bound to no account' : `bound to account ${outcome.boundTo}`}, not to ${account}; bind it with patchPerson accountId first`,
        );
    }
  }
} finally {
  connection.close();
}
