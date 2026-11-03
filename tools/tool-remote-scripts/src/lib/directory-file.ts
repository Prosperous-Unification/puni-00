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
