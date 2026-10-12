import {
  AuthorityOpenError,
  type AuthorityStoreOptions,
  bootstrapAuthority,
  openAuthority,
} from '../authority-store';

/**
 * Test fixture setup only: opens a scratch repository's authority, bootstrapping it on first use.
 * Production never does this; `openAuthority` refuses absence and only `bootstrap-authority`
 * creates. A concurrent fixture that loses the bootstrap race opens the winner's store.
 */
export function openOrBootstrapAuthority(
  worktreePath: string,
  options: AuthorityStoreOptions,
): ReturnType<typeof openAuthority> {
  try {
    return openAuthority(worktreePath, options);
  } catch (error) {
    if (!(error instanceof AuthorityOpenError) || error.failure !== 'absent') throw error;
  }
  try {
    return bootstrapAuthority(worktreePath, options);
  } catch (error) {
    if (!(error instanceof AuthorityOpenError) || error.failure !== 'exists') throw error;
    return openAuthority(worktreePath, options);
  }
}
