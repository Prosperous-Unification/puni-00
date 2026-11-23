import { realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';

import {
  assertCommittedPuniSource,
  decodePuniSelection,
  type PuniSelectionRecord,
  verifyPuniSelection,
} from '@puni/packaging';

export interface SourcePuniSelection {
  readonly contents: string;
  readonly sha256: string;
}
export interface SourcePuniInstallation {
  readonly selectionSha256: string;
  readonly directory: '/opt/puni-dev';
  readonly entrypoint: string;
}
export interface DecodedSourcePuniSelection extends SourcePuniSelection {
  readonly record: PuniSelectionRecord;
}
/** Retain an independently pinned closed record; parsing alone grants no startup or physical authority. */
export function decodeSourcePuniSelection(
  supplied: SourcePuniSelection,
): DecodedSourcePuniSelection {
  const contents = supplied.contents,
    sha256 = supplied.sha256;
  if (
    typeof contents !== 'string' ||
    Buffer.byteLength(contents) > 65536 ||
    typeof sha256 !== 'string'
  )
    throw new Error('current source PUNI selection is invalid');
  const record = decodePuniSelection(Buffer.from(contents), sha256);
  assertCommittedPuniSource(record);
  return { contents, sha256, record };
}
function overlaps(left: string, right: string): boolean {
  const suffix = relative(left, right);
  return (
    suffix === '' || (suffix !== '..' && !suffix.startsWith('..' + sep) && !isAbsolute(suffix))
  );
}
function assertDeadline(deadline: number): void {
  if (!Number.isFinite(deadline) || deadline <= performance.now())
    throw new Error('current source installation deadline exceeded');
}
/**
 * Observe the complete host installation selected independently of the source bind mount, then
 * retain its directory identity for rechecks. The current container decoder separately checks
 * this exact host source and whole read-only mapped directory. These are sequential observations,
 * not an atomic host snapshot or proof of native mount/cgroup containment.
 */
export async function captureSourcePuniInstallation(
  supplied: SourcePuniSelection,
  installation: SourcePuniInstallation,
  deadline: number,
  sourceRoot: string,
): Promise<() => Promise<void>> {
  const selected = decodeSourcePuniSelection(supplied);
  const mapping: Readonly<Record<keyof SourcePuniInstallation, string>> = { ...installation };
  assertDeadline(deadline);
  if (
    mapping.directory !== '/opt/puni-dev' ||
    mapping.selectionSha256 !== selected.sha256 ||
    mapping.entrypoint !== selected.record.entrypoint
  )
    throw new Error('current source PUNI installation mapping differs');
  const root = realpathSync.native(sourceRoot),
    directory = selected.record.installationDirectory;
  if (
    realpathSync.native(directory) !== directory ||
    overlaps(root, directory) ||
    overlaps(directory, root)
  )
    throw new Error('current source PUNI installation is not an independent canonical directory');
  const initial = await verifyPuniSelection(
    Buffer.from(selected.contents),
    selected.sha256,
    directory,
  );
  assertDeadline(deadline);
  async function recheck(): Promise<void> {
    assertDeadline(deadline);
    if (realpathSync.native(directory) !== directory)
      throw new Error('current source PUNI directory alias changed');
    const observed = await verifyPuniSelection(
      Buffer.from(selected.contents),
      selected.sha256,
      directory,
    );
    assertDeadline(deadline);
    if (
      observed.directoryIdentity !== initial.directoryIdentity ||
      observed.entrypoint !== initial.entrypoint
    )
      throw new Error('current source PUNI installation identity changed');
  }
  await recheck();
  return recheck;
}
