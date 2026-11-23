import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';

import {
  isSameToolkitSource,
  readToolkitSourceSelection,
  type ToolkitSourceSelection,
  verifyPuniInstallation,
} from '@puni/burokrat/installation';

import { admitArchiveMembers, readArchive } from './archive';
import { createHistoricalPackageMetadata, createPackageMetadata } from './metadata';

export interface LegacyPuniSelectionRecord {
  readonly schemaVersion: 1;
  readonly installationDirectory: string;
  readonly archive: { readonly path: string; readonly sha256: string };
  readonly entrypoint: string;
}

/** Current selected source is mandatory; historical record1 retains its original closed byte contract. */
export interface SelectedPuniSelectionRecord extends Omit<
  LegacyPuniSelectionRecord,
  'schemaVersion'
> {
  readonly schemaVersion: 2;
  readonly sourceSelection: ToolkitSourceSelection;
}
export type PuniSelectionRecord = LegacyPuniSelectionRecord | SelectedPuniSelectionRecord;

/** A retained independently pinned record and the actual closure it admitted at this observation. */
export interface PuniSelection {
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly directory: string;
  readonly entrypoint: string;
  readonly directoryIdentity: string;
  readonly archiveSha256: string;
  readonly record: PuniSelectionRecord;
}

const RECORD_LIMIT = 65_536;
const SHA256 = /^[0-9a-f]{64}$/;
function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error('PUNI selection record has unsupported fields');
  return value;
}
function readRelativePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value === '' ||
    posix.isAbsolute(value) ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.endsWith('/') ||
    value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  )
    throw new Error('PUNI selection requires a canonical relative file path');
  return value;
}
/** Decode only exact independently pinned record bytes; this grants no physical installation observation. */
export function decodePuniSelection(bytes: Uint8Array, sha256: string): PuniSelectionRecord {
  if (!SHA256.test(sha256) || bytes.byteLength > RECORD_LIMIT || hashBytes(bytes) !== sha256)
    throw new Error('PUNI selection record does not match its independently expected digest');
  const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (isRecord(decoded) && decoded['schemaVersion'] === 2)
    return decodeSelectedRecord(bytes, decoded);
  const record = readObject(decoded, [
    'schemaVersion',
    'installationDirectory',
    'archive',
    'entrypoint',
  ]);
  const archive = readObject(record['archive'], ['path', 'sha256']);
  const installationDirectory = record['installationDirectory'];
  if (
    record['schemaVersion'] !== 1 ||
    typeof installationDirectory !== 'string' ||
    !isAbsolute(installationDirectory) ||
    resolve(installationDirectory) !== installationDirectory ||
    installationDirectory.endsWith('/') ||
    typeof archive['sha256'] !== 'string' ||
    !SHA256.test(archive['sha256'])
  )
    throw new Error('PUNI selection record has unsupported identity or placement');
  const selected: PuniSelectionRecord = {
    schemaVersion: 1,
    installationDirectory,
    archive: { path: readRelativePath(archive['path']), sha256: archive['sha256'] },
    entrypoint: readRelativePath(record['entrypoint']),
  };
  if (!Buffer.from(bytes).equals(Buffer.from(JSON.stringify(selected, null, 2) + '\n')))
    throw new Error('PUNI selection record is not canonical JSON plus one LF');
  return selected;
}

/** Complete source metadata cannot be omitted or inferred when the record claims the new format. */
function decodeSelectedRecord(bytes: Uint8Array, input: unknown): SelectedPuniSelectionRecord {
  const record = readObject(input, [
    'schemaVersion',
    'installationDirectory',
    'archive',
    'entrypoint',
    'sourceSelection',
  ]);
  const archive = readObject(record['archive'], ['path', 'sha256']),
    installationDirectory = record['installationDirectory'];
  if (
    record['schemaVersion'] !== 2 ||
    typeof installationDirectory !== 'string' ||
    !isAbsolute(installationDirectory) ||
    resolve(installationDirectory) !== installationDirectory ||
    installationDirectory.endsWith('/') ||
    typeof archive['sha256'] !== 'string' ||
    !SHA256.test(archive['sha256'])
  )
    throw new Error('selected PUNI record has unsupported identity or placement');
  const selected: SelectedPuniSelectionRecord = {
    schemaVersion: 2,
    installationDirectory,
    archive: { path: readRelativePath(archive['path']), sha256: archive['sha256'] },
    entrypoint: readRelativePath(record['entrypoint']),
    sourceSelection: readToolkitSourceSelection(record['sourceSelection']),
  };
  if (!Buffer.from(bytes).equals(Buffer.from(JSON.stringify(selected, null, 2) + '\n')))
    throw new Error('selected PUNI record is not canonical JSON plus one LF');
  return selected;
}

function requireInside(directory: string, path: string): string {
  const suffix = relative(directory, path);
  if (suffix === '' || suffix === '..' || suffix.startsWith('..' + sep) || isAbsolute(suffix))
    throw new Error('PUNI selection file escapes its installation directory');
  return path;
}
function readRegular(path: string, maximum?: number): Uint8Array {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let settled: { ok: true; bytes: Uint8Array } | { ok: false; cause: unknown };
  try {
    const status = fstatSync(descriptor);
    if (!status.isFile() || (maximum !== undefined && status.size > maximum))
      throw new Error('PUNI selection requires a bounded regular file');
    const bytes = readFileSync(descriptor);
    if (maximum !== undefined && bytes.byteLength > maximum)
      throw new Error('PUNI selection record exceeded its byte bound during acquisition');
    settled = { ok: true, bytes };
  } catch (cause: unknown) {
    settled = { ok: false, cause };
  }
  let release: { cause: unknown } | undefined;
  try {
    closeSync(descriptor);
  } catch (cause: unknown) {
    release = { cause };
  }
  if (!settled.ok) {
    if (release !== undefined)
      throw new AggregateError(
        [settled.cause, release.cause],
        'PUNI selection read and close failed',
        { cause: settled.cause },
      );
    throw settled.cause;
  }
  if (release !== undefined) throw release.cause;
  return settled.bytes;
}
function listPackageFiles(directory: string, suffix = ''): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(join(directory, suffix), { withFileTypes: true })) {
    const path = suffix === '' ? entry.name : suffix + '/' + entry.name;
    if (entry.isDirectory()) names.push(...listPackageFiles(directory, path));
    else if (entry.isFile()) names.push(path);
    else throw new Error('PUNI installed package contains a nonregular member: ' + path);
  }
  return names.sort();
}

/**
 * Bun1.4.4 adds one root regular metadata file for a verified local tarball: exact SHA512 SRI,
 * no LF. It is not archive payload or provenance. Require its retained-archive bytes rather
 * than ignoring a filename or accepting an empty --no-verify marker.
 * @see https://github.com/oven-sh/bun/blob/bun-v1.4.4/src/install/integrity.rs#L157-L178
 * @see https://github.com/oven-sh/bun/blob/bun-v1.4.4/src/install/extract_tarball.rs#L500-L524
 */
function verifyInstallMetadata(packageDirectory: string, archive: Uint8Array): void {
  const expected = Buffer.from('sha512-' + createHash('sha512').update(archive).digest('base64'));
  const actual = readRegular(join(packageDirectory, '.bun-tag'), expected.byteLength);
  if (!Buffer.from(actual).equals(expected))
    throw new Error('Bun installation metadata differs from the authenticated archive SRI');
}

/**
 * Verify one retained operator-pinned record against an explicitly chosen host or mapped directory.
 * The raw archive gate precedes Bun's normalized member map, and every authenticated payload file
 * must equal the retained SHA-bound archive; exact generated metadata is checked separately. The profile facade adds current toolkit/revision checks;
 * none of these consistency checks invent public provenance or prevent a trusted host writer later.
 * readPuniSelection binds the canonical host directory declared by the record. This lower-level
 * directory argument is trusted explicit consumption placement: the Forge constructor derives
 * its mapped Pod directory from that host observation and the owned lab mapping. It is not a
 * second host acquisition or authority to substitute an arbitrary directory under a record pin.
 * Callers must re-observe the retained record at the actual mount/launch consumption boundary.
 */
export async function verifyPuniSelection(
  supplied: Uint8Array,
  sha256: string,
  installationDirectory: string,
): Promise<PuniSelection> {
  const bytes = Uint8Array.from(supplied);
  const runtimeVersion = Bun.version;
  const record = decodePuniSelection(bytes, sha256);
  if (!isAbsolute(installationDirectory))
    throw new Error('PUNI installation directory must be absolute');
  const directory = realpathSync.native(installationDirectory);
  const acquired = statSync(directory, { bigint: true });
  if (!acquired.isDirectory()) throw new Error('PUNI selection is not an installation directory');
  const archivePath = requireInside(
    directory,
    realpathSync.native(join(directory, record.archive.path)),
  );
  const retained = readArchive(archivePath);
  if (hashBytes(retained) !== record.archive.sha256)
    throw new Error('retained PUNI archive differs from the independent selection');
  admitArchiveMembers(retained);
  const entries = await new Bun.Archive(retained).files();
  const metadata = entries.get('package/package.json');
  const expectedMetadata =
    record.schemaVersion === 1
      ? createHistoricalPackageMetadata(runtimeVersion)
      : createPackageMetadata(runtimeVersion);
  if (metadata === undefined || !Buffer.from(await metadata.arrayBuffer()).equals(expectedMetadata))
    throw new Error('PUNI selection archive is not the current package for this Bun runtime');
  const entrypoint = requireInside(
    directory,
    realpathSync.native(join(directory, record.entrypoint)),
  );
  const packageDirectory = requireInside(
    directory,
    realpathSync.native(dirname(dirname(entrypoint))),
  );
  const expected = [...entries.keys()]
    .map((path) => {
      if (!path.startsWith('package/'))
        throw new Error('PUNI selection archive member is outside its package');
      return readRelativePath(path.slice('package/'.length));
    })
    .sort();
  if (expected.includes('.bun-tag'))
    throw new Error('authenticated PUNI payload collides with Bun installation metadata');
  verifyInstallMetadata(packageDirectory, retained);
  const installedPaths = listPackageFiles(packageDirectory);
  const installedMembership = [...expected, '.bun-tag'].sort();
  if (JSON.stringify(installedPaths) !== JSON.stringify(installedMembership))
    throw new Error('installed PUNI package membership differs from its authenticated archive', {
      cause: new Error(
        JSON.stringify({ archivePaths: expected, generatedMetadata: ['.bun-tag'], installedPaths }),
      ),
    });
  for (const path of expected) {
    const member = entries.get('package/' + path);
    if (member === undefined) throw new Error('retained PUNI archive lost an admitted member');
    const archived = new Uint8Array(await member.arrayBuffer());
    const installedPath = requireInside(
      packageDirectory,
      realpathSync.native(join(packageDirectory, path)),
    );
    if (hashBytes(readRegular(installedPath)) !== hashBytes(archived))
      throw new Error('installed PUNI file differs from authenticated archive: ' + path);
  }
  const verified = verifyPuniInstallation(packageDirectory);
  if (verified.entrypoint !== entrypoint)
    throw new Error('PUNI selection does not name the exact current delivered entrypoint');
  switch (verified.profileVersion) {
    case '0.4.0':
      if (
        record.schemaVersion !== 2 ||
        !isSameToolkitSource(record.sourceSelection, verified.sourceSelection)
      )
        throw new Error('PUNI selected source differs from the actual installed profile');
      break;
    case '0.3.0':
      if (record.schemaVersion !== 1)
        throw new Error('historical PUNI profile does not supply selected-source admission');
      break;
    default:
      throw new Error('verified PUNI profile kind is unsupported');
  }
  if (hashBytes(readArchive(archivePath)) !== record.archive.sha256)
    throw new Error('retained PUNI archive changed while checking the installation');
  const status = statSync(directory, { bigint: true });
  if (status.dev !== acquired.dev || status.ino !== acquired.ino)
    throw new Error('PUNI installation directory changed while verifying its selection');
  return {
    bytes,
    sha256,
    directory,
    entrypoint,
    directoryIdentity: String(status.dev) + ':' + String(status.ino),
    archiveSha256: record.archive.sha256,
    record: structuredClone(record),
  };
}

/** Build the owned provisioner record; downstream authority still comes from an independent expected digest. */
export function createSelectionRecord(
  directory: string,
  archiveSha256: string,
  entrypoint: string,
): Uint8Array {
  const installationDirectory = realpathSync.native(directory);
  const record: PuniSelectionRecord = {
    schemaVersion: 1,
    installationDirectory,
    archive: { path: 'authenticated-puni.tgz', sha256: archiveSha256 },
    entrypoint: readRelativePath(
      relative(installationDirectory, realpathSync.native(entrypoint)).split(sep).join('/'),
    ),
  };
  const bytes = Buffer.from(JSON.stringify(record, null, 2) + '\n');
  decodePuniSelection(bytes, hashBytes(bytes));
  return bytes;
}

/** Serialize the explicit new profile selection; this grants no provenance beyond the caller's independently expected record digest. */
export function createSelectedSelectionRecord(
  directory: string,
  archiveSha256: string,
  entrypoint: string,
  sourceSelection: ToolkitSourceSelection,
): Uint8Array {
  const installationDirectory = realpathSync.native(directory);
  const record: SelectedPuniSelectionRecord = {
    schemaVersion: 2,
    installationDirectory,
    archive: { path: 'authenticated-puni.tgz', sha256: archiveSha256 },
    entrypoint: readRelativePath(
      relative(installationDirectory, realpathSync.native(entrypoint)).split(sep).join('/'),
    ),
    sourceSelection: readToolkitSourceSelection(sourceSelection),
  };
  const bytes = Buffer.from(JSON.stringify(record, null, 2) + '\n');
  decodePuniSelection(bytes, hashBytes(bytes));
  return bytes;
}

/** Acquire a bounded record once; the independently expected digest selects its exact installation. */
export async function readPuniSelection(path: string, sha256: string): Promise<PuniSelection> {
  if (!isAbsolute(path)) throw new Error('PUNI selection record must be absolute');
  const bytes = readRegular(path, RECORD_LIMIT);
  const record = decodePuniSelection(bytes, sha256);
  if (realpathSync.native(record.installationDirectory) !== record.installationDirectory)
    throw new Error('PUNI selection installation directory must not be a symlink alias');
  return await verifyPuniSelection(bytes, sha256, record.installationDirectory);
}

/**
 * Release, certification and deployment consumers require committed tool source. Historical
 * record1 keeps its original committed-producer contract; a new working record never acquires
 * committed authority from its base/reference field. Local test-level composition remains separate.
 */
export function assertCommittedPuniSource(record: PuniSelectionRecord): void {
  switch (record.schemaVersion) {
    case 1:
      return;
    case 2:
      if (record.sourceSelection.kind === 'working')
        throw new Error('this PUNI consumer requires committed source selection');
      return;
    default:
      throw new Error('unsupported PUNI selection schema at committed-source consumption');
  }
}
