import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, posix, relative, sep } from 'node:path';

import {
  assertCommittedPuniSource,
  type PuniSelection,
  readPuniSelection,
  verifyPuniSelection,
} from '@puni/packaging';

import { readInstallationRoot } from './forge-admission';

/** A lab v2 mount is explicit; legacy lab records contain no inferred installation authority. */
export interface ForgeInstallationMount {
  readonly directory: string;
  readonly identity: string;
}

export interface ForgeInstallation extends PuniSelection {
  readonly nodeDirectory: string;
  readonly containerEntrypoint: string;
}

export const PUNI_NODE_ROOT = '/srv/puni/puni-installations';
export const PUNI_CONTAINER_ROOT = '/opt/puni-dev';

/**
 * Acquire the independently pinned external installation before any claim or cluster write.
 * The lab's mounted parent is retained separately from the exact read-only directory permission.
 * Archive/profile verification is owned by the public PUNI packaging boundary, not copied here.
 */
export async function readForgeInstallation(
  selected: { readonly path: string; readonly sha256: string },
  mounted: ForgeInstallationMount,
  worktree: string,
): Promise<ForgeInstallation> {
  const request = { ...selected },
    mount = { ...mounted };
  const repository = realpathSync.native(worktree);
  const prefix = realpathSync.native(mount.directory);
  const before = statSync(prefix, { bigint: true });
  if (!before.isDirectory() || String(before.dev) + ':' + String(before.ino) !== mount.identity)
    throw new Error('lab PUNI installation mount changed since lab creation');
  const installation = await readPuniSelection(request.path, request.sha256);
  assertCommittedPuniSource(installation.record);
  const after = statSync(prefix, { bigint: true });
  if (after.dev !== before.dev || after.ino !== before.ino)
    throw new Error('lab PUNI installation mount changed during acquisition');
  const relation = relative(prefix, installation.directory);
  if (
    relation === '' ||
    relation === '..' ||
    relation.startsWith('..' + sep) ||
    isAbsolute(relation)
  )
    throw new Error('selected PUNI installation is not inside the lab installation mount');
  const repositoryRelation = relative(repository, installation.directory);
  const installationRelation = relative(installation.directory, repository);
  if (
    (repositoryRelation !== '..' &&
      !repositoryRelation.startsWith('..' + sep) &&
      !isAbsolute(repositoryRelation)) ||
    (installationRelation !== '..' &&
      !installationRelation.startsWith('..' + sep) &&
      !isAbsolute(installationRelation))
  )
    throw new Error('selected PUNI installation overlaps the candidate worktree');
  const entrypoint = relative(installation.directory, installation.entrypoint);
  if (
    entrypoint === '' ||
    entrypoint.startsWith('..' + sep) ||
    entrypoint === '..' ||
    isAbsolute(entrypoint)
  )
    throw new Error('selected PUNI entrypoint is not in its mounted installation');
  return {
    ...installation,
    nodeDirectory: readInstallationRoot(posix.join(PUNI_NODE_ROOT, ...relation.split(sep))),
    containerEntrypoint: posix.join(PUNI_CONTAINER_ROOT, ...entrypoint.split(sep)),
  };
}

/** Re-observe retained bytes at the mounted consumption boundary immediately before a PUNI launch. */
export async function verifyForgeInstallation(
  bytes: Uint8Array,
  sha256: string,
  directory: string,
  entrypoint: string,
): Promise<PuniSelection> {
  const installed = await verifyPuniSelection(bytes, sha256, directory);
  assertCommittedPuniSource(installed.record);
  if (installed.entrypoint !== entrypoint)
    throw new Error('Forge launch selection differs from the verified mounted entrypoint');
  return installed;
}

/** Recheck the retained host observation and lab mapping before an admission or Pod creation write. */
export async function verifyForgeHostInstallation(
  supplied: ForgeInstallation,
  suppliedMount: ForgeInstallationMount,
): Promise<void> {
  const selected = { ...supplied, bytes: supplied.bytes.slice() },
    mount = { ...suppliedMount };
  const prefix = realpathSync.native(mount.directory),
    before = statSync(prefix, { bigint: true });
  if (String(before.dev) + ':' + String(before.ino) !== mount.identity)
    throw new Error('lab PUNI installation mount changed before its consumption');
  const current = await verifyPuniSelection(selected.bytes, selected.sha256, selected.directory);
  assertCommittedPuniSource(current.record);
  const after = statSync(prefix, { bigint: true });
  if (
    after.dev !== before.dev ||
    after.ino !== before.ino ||
    current.directoryIdentity !== selected.directoryIdentity ||
    current.entrypoint !== selected.entrypoint
  )
    throw new Error('PUNI installation or mapped directory changed before its consumption');
}
