import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

import { anchorPath } from '../validator-paths';
import type { PreparationSource } from './preparation-source';

interface Context {
  readonly callerDirectory: string;
  readonly selection: Extract<PreparationSource, { kind: 'ready' }>;
  readonly readCancellation: () => { readonly status: 130 | 143 } | undefined;
  readonly otherDirectories: readonly string[];
  readonly recordOwnership: (directory: string) => void;
}
function isWithin(root: string, path: string): boolean {
  const offset = relative(root, path);
  return (
    offset === '' || (offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset))
  );
}
/** Reserve a fresh private native-external root. The synchronous ownership callback runs immediately
 * after successful mkdir, before fallible canonical refinement, and again with its native identity.
 * The caller owns cancellation and retains any recorded path if this helper throws. No deletion,
 * signal subscription, merge or overwrite is performed. Stable authority metadata is required.
 */
export async function reservePreparationDirectory(
  destination: string,
  context: Context,
): Promise<
  | { readonly kind: 'reserved'; readonly directory: string }
  | { readonly kind: 'cancelled'; readonly status: 130 | 143 }
> {
  const callerDirectory = context.callerDirectory,
    selection = context.selection;
  const operand = anchorPath(destination, callerDirectory),
    leaf = basename(operand);
  if (
    // Proof: material-destination-empty; `refuses invalid fresh output leaf ""` failed under its recorded source fault and passed after restoration.
    destination === '' || // Proof: material-leaf-empty; `refuses invalid fresh output leaf "/"` failed under its recorded source fault and passed after restoration.
    leaf === '' || // Proof: material-leaf-dot; `refuses invalid fresh output leaf "."` failed under its recorded source fault and passed after restoration.
    leaf === '.' || // Proof: material-leaf-parent; `refuses invalid fresh output leaf ".."` failed under its recorded source fault and passed after restoration.
    leaf === '..'
  )
    throw new Error('materialization requires a fresh output leaf');
  const parent = // Proof: material-native-parent; `preserves native symlink-parent output placement` failed under its recorded source fault and passed after restoration.
      realpathSync.native(dirname(operand)),
    proposed = join(parent, leaf);
  const toolkit = selection.toolkit.directory;
  const protectedPaths = [
    // Proof: material-protect-candidate; `refuses output beneath native protected candidate authority before reservation` failed under its recorded source fault and passed after restoration.
    selection.candidateDirectory,
    // Proof: material-protect-toolkit; `refuses output beneath native protected toolkit authority before reservation` failed under its recorded source fault and passed after restoration.
    toolkit,
    // Proof: material-protect-runtime; `refuses output beneath native protected runtime authority before reservation` failed under its recorded source fault and passed after restoration.
    selection.runtime.directory,
    // Proof: material-protect-closure; `refuses output beneath native protected closure authority before reservation` failed under its recorded source fault and passed after restoration.
    join(toolkit, 'trusted-node-modules'),
    // Proof: material-descriptor-availability; `refuses missing selected descriptor target before output ownership` failed under its recorded source fault and passed after restoration.
    join(toolkit, 'toolkit.json'),
    // Proof: material-role-availability; `refuses missing selected role target before output ownership` failed under its recorded source fault and passed after restoration.
    ...Object.keys(selection.toolkit.roleBytes).map((role) => join(toolkit, role)),
  ] // Proof: material-protected-native; `refuses output beneath native protected closure authority before reservation` failed under its recorded source fault and passed after restoration.
    .map((path) => realpathSync.native(path));
  if (
    // Proof: material-protected-refusal; `refuses output beneath native protected candidate authority before reservation` failed under its recorded source fault and passed after restoration.
    protectedPaths.some((path) => isWithin(path, proposed))
  )
    throw new Error('materialization output is beneath protected source authority');
  if (
    // Proof: prep-output-disjoint; its recorded production-source fault failed `refuses a destination nested inside the owned work root before destination creation` and passed after restoration.
    context.otherDirectories.some(
      (directory) => isWithin(directory, proposed) || isWithin(proposed, directory),
    )
  )
    throw new Error('preparation output roots must be physically disjoint');
  const cancellation = context.readCancellation();
  // Proof: material-before-root-cancel; `honors cancellation recorded by captured metadata before any output reservation` failed under its recorded source fault and passed after restoration.
  if (cancellation !== undefined) return { kind: 'cancelled', status: cancellation.status };
  // Proof: material-fresh-root; `refuses existing directory without replacement or output ownership` failed under its recorded source fault and passed after restoration.
  // Proof: prep-root-exclusive; its recorded production-source fault failed `refuses an occupied work directory without altering its sentinel` and passed after restoration.
  await mkdir(proposed, { mode: 0o700 });
  // Proof: material-record-ownership; `retains created root identity when native canonicalization fails after successful mkdir` failed under its recorded source fault and passed after restoration.
  // Proof: prep-root-ownership; its recorded production-source fault failed `retains the prepared work root if native canonical refinement fails after reservation` and passed after restoration.
  context.recordOwnership(proposed);
  const canonical = realpathSync.native(proposed);
  context.recordOwnership(canonical);
  return { kind: 'reserved', directory: canonical };
}
