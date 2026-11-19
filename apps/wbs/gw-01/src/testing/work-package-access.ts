import type { ConnectionAccess } from '../service/connection-access';
import type { CheckWorkPackageAccess } from '../service/work-package-access';

/** For tests about something other than authorization: every work package is readable. */
export const GRANT_EVERY_WORK_PACKAGE = (): CheckWorkPackageAccess => () =>
  Promise.resolve('granted');

/** A controller-level access double that grants every work package and orders nothing. */
export function grantingAccess(): Pick<ConnectionAccess, 'run' | 'admit' | 'hold' | 'release'> {
  return {
    run: (change) => Promise.resolve(change()),
    admit: () => Promise.resolve('granted'),
    hold: () => undefined,
    release: () => undefined,
  };
}
