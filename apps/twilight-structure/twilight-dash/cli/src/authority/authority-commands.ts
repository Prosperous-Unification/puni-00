import type { DashRequest } from '../cli-parser';
import { type AuthorityClock, bootstrapAuthority, openAuthority } from './authority-store';
import { recoverPublication } from './publication';

/** What an authority command reaches besides its arguments. */
export interface AuthorityCommandDependencies {
  readonly clock: AuthorityClock;
  readonly write: (text: string) => void;
}

/**
 * Creates the repository's authority and prints its path. This is the only command that creates
 * one; it refuses an existing store as `exists`. Its grammar is `cli-parser.ts`'s.
 */
export function bootstrapAuthorityCommand(
  { repository }: DashRequest<'bootstrap-authority'>,
  { clock, write }: AuthorityCommandDependencies,
): void {
  const store = bootstrapAuthority(repository, { clock });
  try {
    write(`${JSON.stringify({ path: store.databasePath, status: 'bootstrapped' })}\n`);
  } finally {
    store.close();
  }
}

/**
 * Prints the authority state, or one session's generations with `--session`, as JSON. Read-only:
 * it is how an owner recovers a token whose acquisition response was lost.
 */
export function inspectAuthorityCommand(
  { repository, session: sessionId }: DashRequest<'inspect-authority'>,
  { clock, write }: AuthorityCommandDependencies,
): void {
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
 */
export function recoverPublicationCommand(
  { repository, integrationId }: DashRequest<'recover-publication'>,
  { clock, write }: AuthorityCommandDependencies,
): void {
  const store = openAuthority(repository, { clock });
  try {
    write(`${JSON.stringify(recoverPublication(store, repository, integrationId))}\n`);
  } finally {
    store.close();
  }
}
