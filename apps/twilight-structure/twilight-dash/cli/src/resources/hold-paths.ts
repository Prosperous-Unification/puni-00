import { join } from 'node:path';

/** Where a pool keeps the hold files of its legacy holders: `<root>/.dash/legacy-holds`. */
export function legacyHoldDirectory(root: string): string {
  return join(root, '.dash', 'legacy-holds');
}

/** The hold file of host job `jobId`'s legacy holder in observe mode. */
export function jobHoldFile(root: string, jobId: string): string {
  return join(legacyHoldDirectory(root), jobId);
}

/** The hold file of the singleton guard's legacy holder in concurrent mode. */
export function guardHoldFile(root: string): string {
  return join(legacyHoldDirectory(root), 'dash-singleton');
}

/** The log beside hold file `holdFile`: the native holder's stdout and stderr. */
export function holdLogFile(holdFile: string): string {
  return `${holdFile}.log`;
}

/** The version-one Ready/Cancelled/Retired decision: helper identity for Ready/Retired, controller identity for cancellation. */
export function resolveReadyFile(holdFile: string): string {
  return holdFile + '.ready';
}
