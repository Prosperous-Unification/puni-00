import { type AuthorityClock, bootstrapAuthority, openAuthority } from './authority-store';
import { recoverPublication } from './publication';

/** What an authority command reaches besides its arguments. */
export interface AuthorityCommandDependencies {
  readonly clock: AuthorityClock;
  readonly write: (text: string) => void;
}

const bootstrapUsage = 'usage: twilight-dash bootstrap-authority <repository>';
const inspectUsage = 'usage: twilight-dash inspect-authority <repository> [--session <id>]';
const recoverUsage = 'usage: twilight-dash recover-publication <repository> --integration-id <id>';

/**
 * Creates the repository's authority and prints its path. This is the only command that creates
 * one; it refuses an existing store as `exists`.
 *
 * @throws Error with the usage line before any filesystem effect when the grammar is wrong.
 */
export function bootstrapAuthorityCommand(
  argv: readonly string[],
  { clock, write }: AuthorityCommandDependencies,
): void {
  const [repository] = argv;
  // Proof: loosening this to `argv.length === 0` made `unknown commands and flags refuse before
  // any store open` observe Dash accept `bootstrap-authority <root> extra` (2026-10-11).
  if (argv.length !== 1 || repository.startsWith('--')) throw new Error(bootstrapUsage);
  const store = bootstrapAuthority(repository, { clock });
  try {
    write(`${JSON.stringify({ path: store.databasePath, status: 'bootstrapped' })}\n`);
  } finally {
    store.close();
  }
}

/** Parses `<repository> [--session <id>]`, refusing unknown, duplicate and valueless flags. */
function inspectArguments(argv: readonly string[]): {
  readonly repository: string;
  readonly sessionId: string | undefined;
} {
  const [repository, ...flags] = argv;
  if (argv.length === 0 || repository.startsWith('--')) throw new Error(inspectUsage);
  if (flags.length === 0) return { repository, sessionId: undefined };
  const [flag, sessionId] = flags;
  // Proof: deleting this check made `unknown commands and flags refuse before any store open`
  // receive the store's `authority absent` refusal for `--sessions a` instead of usage
  // (2026-10-11).
  if (flags.length !== 2 || flag !== '--session' || sessionId.startsWith('--')) {
    throw new Error(inspectUsage);
  }
  return { repository, sessionId };
}

/**
 * Prints the authority state, or one session's generations with `--session`, as JSON. Read-only:
 * it is how an owner recovers a token whose acquisition response was lost.
 *
 * @throws Error with the usage line before the store is opened when the grammar is wrong.
 */
export function inspectAuthorityCommand(
  argv: readonly string[],
  { clock, write }: AuthorityCommandDependencies,
): void {
  const { repository, sessionId } = inspectArguments(argv);
  const store = openAuthority(repository, { clock });
  try {
    const state = store.inspect();
    write(
      `${JSON.stringify(
        sessionId === undefined
          ? state
          : {
              generations: state.generations.filter((record) => record.sessionId === sessionId),
              sessionId,
            },
      )}\n`,
    );
  } finally {
    store.close();
  }
}

/**
 * Finishes an interrupted publication from its durable record and prints the report as JSON.
 *
 * @throws Error with the usage line before the store is opened when the grammar is wrong.
 */
export function recoverPublicationCommand(
  argv: readonly string[],
  { clock, write }: AuthorityCommandDependencies,
): void {
  const [repository, flag, integrationId] = argv;
  // Proof: loosening this check to `argv.length < 3` made `unknown commands and flags refuse
  // before any store open` observe Dash accept `recover-publication <root> --integration-id x
  // extra` and open the store (2026-10-12).
  if (
    argv.length !== 3 ||
    repository.startsWith('--') ||
    flag !== '--integration-id' ||
    integrationId.startsWith('--')
  ) {
    throw new Error(recoverUsage);
  }
  const store = openAuthority(repository, { clock });
  try {
    write(`${JSON.stringify(recoverPublication(store, repository, integrationId))}\n`);
  } finally {
    store.close();
  }
}
