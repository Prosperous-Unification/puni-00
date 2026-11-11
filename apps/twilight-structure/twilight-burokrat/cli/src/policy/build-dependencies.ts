import { realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { hashBytes } from '../evidence/content-manifest';
import type { CommittedSource } from './committed-source';
import { readJson, readOperatorFile, readSourceFile } from './preparation-inputs';
import { assertPinnedTypeScript, assertReleaseRuntime } from './release';
import { buildModuleNames, hashSelectedModules, packageDirectory } from './trusted-modules';

/** A pre-copy byte identity of a stable operator-owned installation, not lockfile provenance. */
export interface BuildDependencies {
  readonly directory: string;
  readonly identity: string;
  readonly names: readonly string[];
  readonly bunVersion: string;
  readonly compilerVersion: string;
  readonly protectedPaths: readonly string[];
}

function readVersion(path: string): string {
  const manifest = readJson(readOperatorFile(path));
  if (
    // Proof: c27-dependency-version-shape; diagnostic/order: malformed version may meet the shared pin comparison; injected fault failed `refuses malformed installed TypeScript proxy version null` and 3 additional named controls; restoration passed.
    typeof manifest !== 'object' ||
    manifest === null ||
    !('version' in manifest) ||
    typeof manifest.version !== 'string'
  )
    throw new Error('build dependency version is malformed: ' + path);
  return manifest.version;
}

function readCompilerPin(manifest: unknown): string | undefined {
  // Proof: c27-dependency-manifest-shape; diagnostic/order: malformed objects may meet later compiler pin refusal; injected fault failed `refuses matching but malformed trusted compiler authority null` and 1 additional named controls; restoration passed.
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest))
    throw new Error('build installation manifest is malformed');
  for (const key of ['devDependencies', 'dependencies']) {
    if (!(key in manifest)) continue;
    const versions: unknown = Reflect.get(manifest, key);
    // Proof: c27-dependency-map-shape; diagnostic/order: malformed maps may meet later compiler pin refusal; injected fault failed `refuses matching but malformed trusted compiler authority {"devDependencies":null}` and 2 additional named controls; restoration passed.
    if (typeof versions !== 'object' || versions === null || Array.isArray(versions))
      throw new Error('build installation dependency map is malformed: ' + key);
    if (!('typescript' in versions)) continue;
    // Proof: c27-dependency-pin-shape; diagnostic/order: invalid pin may meet the shared pinned-version boundary; injected fault failed `refuses matching but malformed trusted compiler authority {"devDependencies":{"typescript":17}}`; restoration passed.
    if (typeof versions.typescript !== 'string')
      throw new Error('build installation TypeScript pin is malformed');
    return versions.typescript;
  }
  return undefined;
}

/**
 * Admit an explicitly trusted host install whose three authority files match captured source.
 * Matching lock bytes alone do not authenticate installed bytes: the operator owns the stable
 * installation and the exact selected closure is hashed before its later private copy is checked.
 * No package manager, candidate helper or ambient installation discovery executes here.
 * @throws for absent, nonregular, unreadable, mismatched or malformed authority and dependencies.
 */
export function readBuildDependencies(
  source: CommittedSource,
  installationRoot: string,
): BuildDependencies {
  const installation = realpathSync.native(installationRoot);
  // Proof: c27-dependency-install-directory; diagnostic/order: missing directory admission later reaches ENOTDIR; injected fault failed `refuses a regular file selected as the trusted installation with its named boundary`; restoration passed.
  if (!statSync(installation).isDirectory())
    throw new Error('build installation must be a directory');
  function readAuthority(path: string) {
    const native = realpathSync.native(join(installation, path));
    const bytes = readOperatorFile(native);
    // Proof: c27-dependency-authority-match; injected fault failed `refuses a build installation whose package.json differs from the capture` and 2 additional named controls; restoration passed.
    if (hashBytes(bytes) !== hashBytes(readSourceFile(source, path)))
      throw new Error('build installation authority differs from capture: ' + path);
    return { native, bytes };
  }
  const manifest = readAuthority('package.json'),
    lock = readAuthority('bun.lock'),
    pin = readAuthority('.bun-version');
  // Proof: c27s-dependency-wire-assertReleaseRuntime; injected fault failed `retains the runtime pin refusal for matching authority built for another Bun`; restoration passed.
  assertReleaseRuntime(Bun.version, new TextDecoder('utf-8', { fatal: true }).decode(pin.bytes));
  const directory = realpathSync.native(join(installation, 'node_modules'));
  // Proof: c27-dependency-modules-directory; diagnostic/order: missing directory admission later reaches ENOTDIR; injected fault failed `refuses a regular file selected as the trusted node_modules with its named boundary`; restoration passed.
  if (!statSync(directory).isDirectory()) throw new Error('build dependencies must be a directory');
  // Proof: c27s-dependency-wire-assertPinnedTypeScript; injected fault failed `retains the fixed compiler pin refusal for matching authority with no TypeScript pin`; restoration passed.
  assertPinnedTypeScript(
    readCompilerPin(readJson(manifest.bytes)),
    readVersion(join(packageDirectory(directory, 'typescript'), 'package.json')),
  );
  const compilerVersion = readVersion(
    join(packageDirectory(directory, '@typescript/old'), 'package.json'),
  );
  // Proof: c27-dependency-compiler-version; diagnostic/order: sparse controlled install later lacks the fixed roster; injected fault failed `refuses an installed compiler version different from the producer before roster expansion`; restoration passed.
  if (compilerVersion !== ts.version)
    throw new Error('build compiler differs from producer TypeScript ' + ts.version);
  const names = buildModuleNames(directory);
  return {
    directory,
    identity: hashSelectedModules(directory, names),
    names,
    bunVersion: Bun.version,
    compilerVersion,
    protectedPaths: [
      installation,
      directory,
      ...[manifest, lock, pin].map((authority) => authority.native),
    ],
  };
}
