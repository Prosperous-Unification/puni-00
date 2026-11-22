import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';

import { readNativeMapping } from './forge-native-map';
const FILE_LIMIT = 128 * 1024 * 1024;
const hashBytes = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
interface FileObservation {
  readonly path: string;
  readonly size: number;
  readonly mode: string;
  readonly device: string;
  readonly inode: string;
  readonly modified: string;
  readonly changed: string;
  readonly sha256: string;
}
/** Hold one nofollow regular descriptor through a bounded read and retain release failure with its primary. */
function readObservedFile(
  path: string,
  limit = FILE_LIMIT,
): { readonly file: FileObservation; readonly bytes: Buffer } {
  const canonical = realpathSync.native(path);
  if (canonical !== path)
    throw new Error('Forge required execution file is not canonical: ' + path);
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let observation: FileObservation | undefined;
  let captured: Buffer | undefined;
  let primary: { readonly cause: unknown } | undefined;
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 0n || before.size > BigInt(limit))
      throw new Error('Forge required execution file exceeds regular-file bound: ' + path);
    const chunks: Buffer[] = [];
    let size = 0;
    while (size <= limit) {
      const chunk = Buffer.alloc(Math.min(65536, limit + 1 - size));
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
      size += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    const named = lstatSync(path, { bigint: true });
    if (
      size > limit ||
      BigInt(size) !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs ||
      named.dev !== before.dev ||
      named.ino !== before.ino ||
      named.mode !== before.mode
    )
      throw new Error('Forge required execution file changed while observed: ' + path);
    captured = Buffer.concat(chunks);
    observation = {
      path,
      size,
      mode: String(before.mode),
      device: String(before.dev),
      inode: String(before.ino),
      modified: String(before.mtimeNs),
      changed: String(before.ctimeNs),
      sha256: hashBytes(captured),
    };
  } catch (cause: unknown) {
    primary = { cause };
  }
  let releaseFailure: { readonly cause: unknown } | undefined;
  try {
    closeSync(descriptor);
  } catch (cause: unknown) {
    releaseFailure = { cause };
  }
  if (releaseFailure !== undefined) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, releaseFailure.cause],
        'Forge execution read and release failed',
        { cause: primary.cause },
      );
    throw releaseFailure.cause;
  }
  if (primary !== undefined) throw primary.cause;
  if (observation === undefined || captured === undefined)
    throw new Error('Forge execution read produced no observation');
  return { file: observation, bytes: captured };
}
function observeFile(path: string, limit = FILE_LIMIT): FileObservation {
  return readObservedFile(path, limit).file;
}
/** Linux Forge image profile: retain every actually mapped executable file, including the Bun runtime and any loaded native library. Anonymous JIT pages are derived from those captured inputs. */
function captureNativeFiles(): FileObservation[] {
  if (process.platform !== 'linux')
    throw new Error(
      'Forge current loaded-native profile requires Linux; another platform needs its own qualified adapter',
    );
  const maps = readVirtualText('/proc/self/maps', 4 * 1024 * 1024);
  const names = new Map<string, bigint>();
  for (const line of maps.trimEnd().split('\n')) {
    const { permissions, inode, encodedPath: encoded } = readNativeMapping(line);
    if (!permissions.includes('x') || encoded === undefined || encoded.startsWith('[')) continue;
    const path = encoded.replace(/\\([0-7]{3})/g, (_match, octal: string) =>
      String.fromCharCode(Number.parseInt(octal, 8)),
    );
    if (!path.startsWith('/') || path.endsWith(' (deleted)') || BigInt(inode) === 0n)
      throw new Error('Forge has an unsupported required executable mapping');
    names.set(path, BigInt(inode));
  }
  if (!names.has(realpathSync.native(process.execPath)))
    throw new Error('Forge native observation lacks the actual Bun executable');
  if (names.size === 0 || names.size > 512)
    throw new Error('Forge executable mapping roster exceeds bound');
  let bytes = 0;
  return [...names]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, inode]) => {
      const file = observeFile(path);
      if (BigInt(file.inode) !== inode)
        throw new Error('Forge mapped executable was replaced after loading');
      bytes += file.size;
      if (bytes > 512 * 1024 * 1024) throw new Error('Forge mapped executable bytes exceed bound');
      return file;
    });
}
/** procfs reports virtual size0, so bound its actual descriptor stream rather than allocating an unchecked whole read. */
function readVirtualText(path: string, limit: number): string {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let primary: { readonly cause: unknown } | undefined;
  let contents: string | undefined;
  try {
    if (!fstatSync(descriptor).isFile())
      throw new Error('Forge native map source is not a regular procfs endpoint');
    const chunks: Buffer[] = [];
    let size = 0;
    while (size <= limit) {
      const chunk = Buffer.alloc(Math.min(65536, limit + 1 - size));
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
      size += count;
    }
    if (size > limit) throw new Error('Forge native map observation exceeds byte bound');
    contents = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } catch (cause: unknown) {
    primary = { cause };
  }
  let releaseFailure: { readonly cause: unknown } | undefined;
  try {
    closeSync(descriptor);
  } catch (cause: unknown) {
    releaseFailure = { cause };
  }
  if (releaseFailure !== undefined) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, releaseFailure.cause],
        'Forge procfs read and release failed',
        { cause: primary.cause },
      );
    throw releaseFailure.cause;
  }
  if (primary !== undefined) throw primary.cause;
  if (contents === undefined) throw new Error('Forge native map observation is missing');
  return contents;
}

/** Retain the actual Linux Bun/native executable mapping roster; unknown added/deleted edges refuse. */
export function createForgeNativeInspection(): () => boolean {
  const initial = captureNativeFiles();
  const names = initial.map((file) => file.path);
  return () => {
    const current = captureNativeFiles();
    if (JSON.stringify(names) !== JSON.stringify(current.map((file) => file.path)))
      throw new Error('Forge native execution edges changed; container reload required');
    return JSON.stringify(initial) === JSON.stringify(current);
  };
}
