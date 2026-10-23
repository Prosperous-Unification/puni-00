import { dlopen, FFIType } from 'bun:ffi';

const library = process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6';
const { symbols } = dlopen(library, {
  openat: { args: [FFIType.i32, FFIType.cstring, FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  renameat: {
    args: [FFIType.i32, FFIType.cstring, FFIType.i32, FFIType.cstring],
    returns: FFIType.i32,
  },
});

/** Descriptor-relative native port; caller owns the retained directory and supplies scoped basenames. */
export function openDirectoryFile(directory: number, name: string, flags: number): number {
  const encoded = Buffer.from(`${name}\0`);
  const descriptor = symbols.openat(directory, encoded, flags, 0o600);
  if (descriptor < 0) throw new Error('owner site exclusive relative open failed');
  return descriptor;
}

/** Rename within one retained directory; replacing its pathname cannot redirect either operand. */
export function renameDirectoryFile(directory: number, source: string, target: string): void {
  const from = Buffer.from(`${source}\0`);
  const to = Buffer.from(`${target}\0`);
  // Proof: original path-based rename overwrote foreign files under both parent-swap tests.
  if (symbols.renameat(directory, from, directory, to) !== 0)
    throw new Error('owner site relative rename failed');
}
