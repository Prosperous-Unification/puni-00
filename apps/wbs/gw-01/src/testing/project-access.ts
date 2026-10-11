import type { ConnectionAccess } from '../service/connection-access';
import type { CheckProjectAccess } from '../service/project-access';

/** For tests about something other than authorization: every project is readable. */
export const GRANT_EVERY_PROJECT = (): CheckProjectAccess => () => Promise.resolve('granted');

/** A controller-level access double that grants every project and orders nothing. */
export function grantingAccess(): Pick<ConnectionAccess, 'run' | 'admit' | 'hold' | 'release'> {
  return {
    run: (change) => Promise.resolve(change()),
    admit: () => Promise.resolve('granted'),
    hold: () => undefined,
    release: () => undefined,
  };
}
