import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

/** Acquire one no-follow, nonblocking regular descriptor; preserve read and close failures. */
export function readArchive(path: string): Uint8Array {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let outcome: { ok: true; bytes: Uint8Array } | { ok: false; cause: unknown };
  try {
    if (!fstatSync(descriptor).isFile()) throw new Error('PUNI archive is not a regular file');
    outcome = { ok: true, bytes: readFileSync(descriptor) };
  } catch (cause) {
    outcome = { ok: false, cause };
  }
  let release: { cause: unknown } | undefined;
  try {
    closeSync(descriptor);
  } catch (cause) {
    release = { cause };
  }
  if (!outcome.ok) {
    if (release !== undefined)
      throw new AggregateError(
        [outcome.cause, release.cause],
        'PUNI archive read and close failed',
        { cause: outcome.cause },
      );
    throw outcome.cause;
  }
  if (release !== undefined) throw release.cause;
  return outcome.bytes;
}

const decode = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
function text(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  if (end < 0) return decode(bytes);
  if (bytes.subarray(end).some((byte) => byte !== 0))
    throw new Error('PUNI tar string has nonzero bytes after NUL');
  return decode(bytes.subarray(0, end));
}
function octal(bytes: Uint8Array): number {
  const word = decode(bytes)
    .replace(/[\0 ]+$/u, '')
    .replace(/^ +/u, '');
  if (!/^[0-7]+$/u.test(word)) throw new Error('PUNI tar integer is unsupported');
  const count = Number.parseInt(word, 8);
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error('PUNI tar integer is outside its byte extent');
  return count;
}
function pathOf(path: string, directory: boolean): string {
  const canonical = directory && path.endsWith('/') ? path.slice(0, -1) : path;
  if (
    canonical.includes('\\') ||
    canonical.includes('\0') ||
    !(canonical === 'package' || canonical.startsWith('package/')) ||
    canonical.split('/').some((part) => part === '' || part === '.' || part === '..')
  )
    throw new Error('PUNI tar path is not canonical package-relative text');
  return canonical;
}
function paxPath(bytes: Uint8Array): string | undefined {
  let offset = 0,
    path: string | undefined;
  const keys = new Set<string>();
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset);
    if (space < 0) throw new Error('PUNI PAX record has no byte length');
    const decimal = decode(bytes.subarray(offset, space));
    if (!/^[1-9][0-9]*$/u.test(decimal)) throw new Error('PUNI PAX byte length is malformed');
    const size = Number(decimal),
      end = offset + size;
    if (
      !Number.isSafeInteger(end) ||
      end > bytes.length ||
      end <= space + 1 ||
      bytes[end - 1] !== 10
    )
      throw new Error('PUNI PAX record exceeds its bytes');
    const field = decode(bytes.subarray(space + 1, end - 1)),
      equals = field.indexOf('=');
    if (equals < 1) throw new Error('PUNI PAX record has no field');
    const key = field.slice(0, equals),
      value = field.slice(equals + 1);
    if (keys.has(key) || !['path', 'mtime', 'atime', 'ctime'].includes(key))
      throw new Error('PUNI PAX field is duplicate or unsupported');
    keys.add(key);
    if (key === 'path') path = value;
    offset = end;
  }
  return path;
}

interface ArchivePath {
  isFile: boolean;
  readonly children: Map<string, ArchivePath>;
}

/** Records a canonical effective member by segments. A file cannot contain descendants;
 * an explicit directory may follow its already recorded children. Raw and effective
 * duplicate identities remain the caller's separate admission decision. */
function admitArchivePath(root: ArchivePath, path: string, directory: boolean): void {
  let current = root;
  for (const segment of path.split('/')) {
    // Proof: forcing this condition false admitted package/a then package/a/b;
    // archive.test.ts's earlier-effective-file case failed its collision throw
    // and passed after exact restoration.
    if (current.isFile) throw new Error('PUNI tar file and directory paths collide');
    let next = current.children.get(segment);
    if (next === undefined) {
      next = { isFile: false, children: new Map() };
      current.children.set(segment, next);
    }
    current = next;
  }
  // Proof: forcing this condition false admitted package/a after package/a/b;
  // archive.test.ts's later-effective-file case failed its collision throw
  // and passed after exact restoration.
  if (!directory && current.children.size > 0)
    throw new Error('PUNI tar file and directory paths collide');
  current.isFile = !directory;
}

/**
 * Admit the retained gzip tar's physical metadata before Bun can install it. Support only
 * canonical regular/directory members and unambiguous local PAX path/timestamps; reject links,
 * GNU/global extensions, duplicates and metadata aliases. Bun.Archive remains the payload
 * decoder after this raw gate. This is a fixed PUNI profile, not an arbitrary tar extractor.
 */
export function admitArchiveMembers(bytes: Uint8Array): void {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('PUNI archive must be gzip tar');
  const tar = gunzipSync(bytes);
  if (tar.length % 512 !== 0) throw new Error('PUNI tar has an incomplete block');
  const raw = new Set<string>(),
    effective = new Map<string, boolean>();
  const paths: ArchivePath = { isFile: false, children: new Map() };
  let offset = 0,
    metadata = 0,
    main = 0,
    terminated = false;
  let pending: { path: string | undefined } | undefined;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (pending !== undefined || tar.subarray(offset).some((byte) => byte !== 0))
        throw new Error('PUNI tar has pending metadata or nonzero trailing bytes');
      terminated = true;
      break;
    }
    const expected = octal(header.subarray(148, 156));
    let checksum = 0;
    for (let index = 0; index < 512; index++)
      checksum += index >= 148 && index < 156 ? 32 : header[index];
    if (checksum !== expected) throw new Error('PUNI tar header checksum differs');
    if (text(header.subarray(257, 263)) !== 'ustar')
      throw new Error('PUNI tar header format is unsupported');
    const prefix = text(header.subarray(345, 500)),
      name = text(header.subarray(0, 100));
    const headerPath = prefix === '' ? name : prefix + '/' + name;
    const size = octal(header.subarray(124, 136)),
      start = offset + 512,
      end = start + size;
    const next = start + Math.ceil(size / 512) * 512;
    if (!Number.isSafeInteger(next) || next > tar.length || end > tar.length)
      throw new Error('PUNI tar member exceeds its bytes');
    const kind = header[156];
    if (kind === 120) {
      if (
        pending !== undefined ||
        headerPath === 'package/package.json' ||
        headerPath === 'package/dist/puni.mjs'
      )
        throw new Error('PUNI tar has ambiguous local metadata');
      pending = { path: paxPath(tar.subarray(start, end)) };
      offset = next;
      continue;
    }
    if (kind !== 0 && kind !== 48 && kind !== 53)
      throw new Error('PUNI tar member type is unsupported');
    const directory = kind === 53;
    if (directory && size !== 0) throw new Error('PUNI tar directory has payload bytes');
    const original = pathOf(headerPath, directory),
      selected = pathOf(pending?.path ?? headerPath, directory);
    pending = undefined;
    // Proof: local-install-unique-members; replacing this whole predicate with false made
    // `owns local PUNI installation archive admission: duplicate-ordinary` fail because
    // its destination existed; the selected canonical after-control passed.
    if (raw.has(original) || effective.has(selected))
      throw new Error('PUNI tar member is duplicated');
    raw.add(original);
    admitArchivePath(paths, selected, directory);
    effective.set(selected, directory);
    for (const identity of ['package/package.json', 'package/dist/puni.mjs']) {
      if (original === identity || selected === identity) {
        if (directory || original !== selected)
          throw new Error('PUNI tar identity has a path alias');
        if (identity === 'package/package.json') metadata++;
        else main++;
      }
    }
    offset = next;
  }
  if (!terminated || metadata !== 1 || main !== 1)
    throw new Error('PUNI tar does not contain unique regular metadata and main');
}
