import {
  constants,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

import ts from 'typescript';

export interface TrustedSystem extends ts.System {
  realpath(path: string): string;
}

function contains(root: string, path: string): boolean {
  const offset = relative(root, path);
  return offset !== '..' && !offset.startsWith('../') && !isAbsolute(offset);
}

function inspectPath(path: string): ReturnType<typeof statSync> | undefined {
  try {
    return statSync(path);
  } catch (cause) {
    if (
      cause instanceof Error &&
      'code' in cause &&
      (cause.code === 'ENOENT' || cause.code === 'ENOTDIR')
    )
      return undefined;
    throw new Error(`trusted runtime path unreadable: ${path}`, { cause });
  }
}

/** Copies a complete package without carrying symlinks or reads outside the trusted closure. */
function copyPackage(root: string, source: string, destination: string, ancestors: string[]): void {
  const canonical = realpathSync(source);
  // Proof: removing containment made the escaping-package CLI fixture exit 0 after copying a
  // compatible ancestor B; `refuses trusted package escape` expected exit 1 and failed.
  if (!contains(root, canonical))
    throw new Error(`trusted runtime symlink escapes closure: ${source}`);
  // Proof: removing cycle detection reached ENAMETOOLONG instead of the named cycle refusal;
  // `refuses trusted package cycle` failed its production CLI oracle.
  if (ancestors.includes(canonical)) throw new Error(`trusted runtime symlink cycle: ${source}`);
  const status = statSync(canonical);
  // Proof: removing the mode boundary reported raw EACCES for mode-000 bytes rather than trusted
  // unreadability; `refuses trusted package unreadable` failed its production CLI oracle.
  if ((status.mode & 0o444) === 0) throw new Error(`trusted runtime path unreadable: ${source}`);
  if (status.isDirectory()) {
    mkdirSync(destination);
    for (const name of readdirSync(canonical)) {
      copyPackage(root, join(canonical, name), join(destination, name), [...ancestors, canonical]);
    }
  } else if (status.isFile()) {
    copyFileSync(canonical, destination, constants.COPYFILE_FICLONE);
  } else {
    // Proof: ignoring a FIFO lost the named special-file refusal to unresolved vendor B;
    // `refuses trusted package special` failed through the production CLI.
    throw new Error(`trusted runtime path is not a regular file or directory: ${source}`);
  }
}

/**
 * Gives every compiler filesystem consumer the same isolated view. Packages are copied once per
 * extraction, on demand, with their complete file topology. Missing probes stay absent; unreadable
 * trusted packages and escaping symlinks throw. Only the compiler's own lib*.d.ts files may be read
 * outside the candidate and its physical copied node_modules directory.
 */
export function createTrustedSystem(workspace: string, trustedModules: string): TrustedSystem {
  const modules = join(workspace, 'node_modules');
  const libraryDirectory = realpathSync(dirname(ts.getDefaultLibFilePath({})));
  const copied = new Set<string>();
  // Proof: restoring the direct directory symlink made A bind an ancestor B and the augmentation
  // fixture fail; missing trusted B with a compatible ancestor incorrectly exited 0.
  mkdirSync(modules);

  const isLibrary = (path: string): boolean =>
    dirname(path) === libraryDirectory && /^lib(?:\.[\w.-]+)?\.d\.ts$/.test(basename(path));

  const preparePath = (path: string): boolean => {
    const absolute = resolve(path);
    // Proof: allowing outside probes read the absolute-import fixture before the realpath
    // recheck; `refuses absolute compiler inputs` lost its unresolved-input refusal and failed.
    if (!contains(workspace, absolute)) return isLibrary(absolute);
    if (!contains(modules, absolute)) {
      if (inspectPath(absolute) === undefined) return true;
      if (!contains(workspace, realpathSync(absolute))) {
        throw new Error(`compiler path escapes candidate: ${path}`);
      }
      return true;
    }
    const segments = relative(modules, absolute).split('/').filter(Boolean);
    if (segments.length === 0) return true;
    if (segments[0].startsWith('@') && segments.length === 1) {
      const scope = join(trustedModules, segments[0]);
      if (inspectPath(scope) === undefined) return false;
      if (!contains(trustedModules, realpathSync(scope))) {
        throw new Error(`trusted runtime symlink escapes closure: ${scope}`);
      }
      mkdirSync(join(modules, segments[0]), { recursive: true });
      return true;
    }
    const name = segments.slice(0, segments[0].startsWith('@') ? 2 : 1).join('/');
    if (copied.has(name)) return true;
    const source = join(trustedModules, name);
    if (inspectPath(source) === undefined) return false;
    const staging = mkdtempSync(join(workspace, '.trusted-package-'));
    try {
      const stagedPackage = join(staging, 'package');
      copyPackage(trustedModules, source, stagedPackage, []);
      const destination = join(modules, name);
      mkdirSync(dirname(destination), { recursive: true });
      renameSync(stagedPackage, destination);
      copied.add(name);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
    return true;
  };

  return {
    ...ts.sys,
    getCurrentDirectory: () => workspace,
    fileExists: (path) => preparePath(path) && ts.sys.fileExists(path),
    directoryExists: (path) => preparePath(path) && ts.sys.directoryExists(path),
    readFile: (path, encoding) => (preparePath(path) ? ts.sys.readFile(path, encoding) : undefined),
    realpath: (path) => {
      if (!preparePath(path)) throw new Error(`compiler path outside trusted closure: ${path}`);
      const canonical = realpathSync(path);
      if (!contains(workspace, canonical) && !isLibrary(canonical)) {
        throw new Error(`compiler realpath outside trusted closure: ${path}`);
      }
      return canonical;
    },
    getDirectories: (path) => {
      if (!preparePath(path)) return [];
      const offset = relative(modules, resolve(path));
      if (offset === '' || (offset.startsWith('@') && !offset.includes('/'))) {
        const source = join(trustedModules, offset);
        return readdirSync(source).filter((name) => inspectPath(join(source, name))?.isDirectory());
      }
      return ts.sys.getDirectories(path);
    },
    readDirectory: (path, extensions, exclude, include, depth) =>
      preparePath(path) ? ts.sys.readDirectory(path, extensions, exclude, include, depth) : [],
  };
}
