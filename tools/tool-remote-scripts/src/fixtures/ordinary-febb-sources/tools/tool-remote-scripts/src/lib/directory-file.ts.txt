import { dlopen, FFIType } from 'bun:ffi';

// Proof: removing the platform boundary let both unsupported-ABI child fixtures create a file.
const symbols =
  process.platform === 'linux' && process.arch === 'x64'
    ? dlopen('libc.so.6', {
        openat: {
          args: [FFIType.i32, FFIType.cstring, FFIType.i32, FFIType.i32],
          returns: FFIType.i32,
        },
        renameat: {
          args: [FFIType.i32, FFIType.cstring, FFIType.i32, FFIType.cstring],
          returns: FFIType.i32,
        },
      }).symbols
    : undefined;

/** Linux x64 descriptor-relative native port; other ABIs refuse before native creation. Caller owns the retained directory and supplies scoped basenames. */
export function openDirectoryFile(directory: number, name: string, flags: number): number {
  if (symbols === undefined) throw new Error('owner site publication requires Linux x64');
  const encoded = Buffer.from(`${name}\0`);
  const descriptor = symbols.openat(directory, encoded, flags, 0o600);
  if (descriptor < 0) throw new Error('owner site exclusive relative open failed');
  return descriptor;
}

/** Rename within one retained directory; replacing its pathname cannot redirect either operand. */
export function renameDirectoryFile(directory: number, source: string, target: string): void {
  if (symbols === undefined) throw new Error('owner site publication requires Linux x64');
  const from = Buffer.from(`${source}\0`);
  const to = Buffer.from(`${target}\0`);
  // Proof: original path-based rename overwrote foreign files under both parent-swap tests.
  if (symbols.renameat(directory, from, directory, to) !== 0)
    throw new Error('owner site relative rename failed');
}

/**
 * Atomically move a basename within the retained directory without replacing a destination.
 * Refuses invalid basenames/descriptors, unsupported ABIs, absent libc renameat2, and syscall
 * failures. Loads the optional symbol only here, preserving the existing native ports.
 * The caller owns directory retention, subsequent readback, and file/directory synchronization;
 * a successful syscall alone does not establish archival durability.
 */
export function renameDirectoryFileNoReplace(
  directory: number,
  source: string,
  target: string,
): void {
  if (process.platform !== 'linux' || process.arch !== 'x64')
    throw new Error('owner archive publication requires Linux x64');
  if (!Number.isInteger(directory) || directory < 0 || directory > 2147483647)
    throw new Error('owner archive publication requires native directory descriptor');
  for (const name of [source, target]) {
    if (
      name.length === 0 ||
      name === '.' ||
      name === '..' ||
      name.includes('/') ||
      name.includes('\0')
    )
      throw new Error('owner archive publication requires single basenames');
  }
  // Proof: real missing-symbol lookup and injected loader failure both refused; old ports still moved files.
  const library = dlopen('libc.so.6', {
    renameat2: {
      args: [FFIType.i32, FFIType.cstring, FFIType.i32, FFIType.cstring, FFIType.u32],
      returns: FFIType.i32,
    },
  });
  try {
    const from = Buffer.from(source + '\0');
    const to = Buffer.from(target + '\0');
    // Proof: existing destination, absent source, and non-directory descriptor each refused in directory-file.test.ts.
    if (library.symbols.renameat2(directory, from, directory, to, 1) !== 0)
      throw new Error('owner archive no-replace rename failed');
  } finally {
    library.close();
  }
}
