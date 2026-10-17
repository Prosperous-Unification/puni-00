import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** One actual compiler-options substitution, emitted synchronously before candidate IO. */
export interface PathsSubstitutionAttempt {
  readonly kind: 'compiler-options-paths-substitution';
  readonly specifier: string;
  readonly baseDirectory: string;
  readonly pattern: string;
  readonly substitution: string;
  readonly candidate: string;
}

const inputSha256 = '569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39';
const outputSha256 = '47bffa39459dbbb0797606506c790af1420a983ed6bc1d3ca4945a64ee782559';
const licenseSha256 = 'a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47';
const noticeSuffix =
  'TypeScript 6.0.3, Copyright Microsoft Corporation. Apache License 2.0.\nModified by Prosperous Unification: compiler-options paths substitution observation.\n';
const upstreamNoticeSha256 = '1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c';
const noticeSha256 = '2bc5ce9e6b7ca3e8cdee8a6593241646056d5018e5d6e21ea5df299f2a200555';
// Proof: removing the observer and repinning its derivative output made both tagged
// throw-before-IO tests resolve without refusal; the failure reached real resolution.
const sections: readonly (readonly [string, string])[] = [
  [
    '    return tryLoadModuleUsingPaths(\n      extensions,\n      moduleName,\n      baseDirectory,\n      paths,\n      pathPatterns,\n      loader,\n      /*onlyRecordFailures*/\n      false,\n      state\n    );',
    '    return tryLoadModuleUsingPaths(\n      extensions,\n      moduleName,\n      baseDirectory,\n      paths,\n      pathPatterns,\n      loader,\n      /*onlyRecordFailures*/\n      false,\n      state,\n      "compiler-options"\n    );',
  ],
  [
    'tryLoadModuleUsingPaths(extensions, moduleName, candidate, versionPaths.paths, pathPatterns, loader, onlyRecordFailuresForPackageFile || onlyRecordFailuresForIndex, state)',
    'tryLoadModuleUsingPaths(extensions, moduleName, candidate, versionPaths.paths, pathPatterns, loader, onlyRecordFailuresForPackageFile || onlyRecordFailuresForIndex, state, "types-versions")',
  ],
  [
    'tryLoadModuleUsingPaths(extensions, rest, packageDirectory, versionPaths.paths, pathPatterns, loader, !packageDirectoryExists, state)',
    'tryLoadModuleUsingPaths(extensions, rest, packageDirectory, versionPaths.paths, pathPatterns, loader, !packageDirectoryExists, state, "types-versions")',
  ],
  [
    'function tryLoadModuleUsingPaths(extensions, moduleName, baseDirectory, paths, pathPatterns, loader, onlyRecordFailures, state) {',
    'function tryLoadModuleUsingPaths(extensions, moduleName, baseDirectory, paths, pathPatterns, loader, onlyRecordFailures, state, origin) {',
  ],
  [
    '      const candidate = normalizePath(combinePaths(baseDirectory, path));',
    '      const candidate = normalizePath(combinePaths(baseDirectory, path));\n      if (origin === "compiler-options" && state.host.onPathsSubstitutionAttempt !== void 0) {\n        state.host.onPathsSubstitutionAttempt({\n          kind: "compiler-options-paths-substitution",\n          specifier: moduleName,\n          baseDirectory,\n          pattern: matchedPatternText,\n          substitution: subst,\n          candidate\n        });\n      }',
  ],
];

function hash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// Proof: removing Object.freeze let returned-manifest rebinding pass verifier identities.
const manifest = Object.freeze({
  schemaVersion: 1,
  upstream: '@typescript/old@6.0.3',
  inputSha256,
  outputSha256,
  transformations: sections.length,
  licenseSha256,
  upstreamNoticeSha256,
  noticeSha256,
} as const);

/** Replaces one reviewed compiler section; changed/missing/duplicate sections refuse. */
export function replaceCompilerSection(
  source: string,
  needle: string,
  replacement: string,
): string {
  // Proof: removing this guard made builder missing/duplicate-section negatives fail
  // with the downstream output refusal instead of the required exact-count refusal.
  if (source.split(needle).length !== 2)
    throw new Error('compiler transformation section must occur exactly once');
  return source.replace(needle, replacement);
}

/**
 * Builds a separate deterministic compiler derivative, never mutating installed bytes.
 * @throws Error when upstream, reviewed sections or resulting executable differs.
 * @see {@link PathsSubstitutionAttempt} and docs/adr/0055-observe-paths-attempts-inside-the-pinned-compiler.md
 */
export function buildCompilerDerivative(upstream: string) {
  // Proof: removing this guard lost the altered-upstream input-digest refusal.
  if (hash(upstream) !== inputSha256) throw new Error('compiler input digest differs');
  let instrumented = upstream;
  for (const [needle, replacement] of sections)
    instrumented = replaceCompilerSection(instrumented, needle, replacement);
  // Proof: removing this guard let the builder altered-output child exit successfully.
  if (hash(instrumented) !== outputSha256) throw new Error('compiler output digest differs');
  return { source: instrumented, manifest };
}

/** Checks a closed manifest against compiled-in identities before accepting executable bytes. */
export function verifyCompilerDerivative(source: string, supplied: unknown): void {
  // Proof: removing this guard made the null-manifest negative throw TypeError.
  if (supplied === null || typeof supplied !== 'object' || Array.isArray(supplied))
    throw new Error('compiler derivative manifest differs');
  const fields = Object.entries(supplied);
  // Proof: removing this guard admitted malformed fields and lost manifest-specific digest refusal.
  if (
    fields.length !== Object.keys(manifest).length ||
    fields.some(
      ([key, value]) => !Object.hasOwn(manifest, key) || Reflect.get(manifest, key) !== value,
    )
  )
    throw new Error('compiler derivative manifest differs');
  // Proof: removing this guard accepted executable tampering with the pinned manifest.
  if (hash(source) !== outputSha256) throw new Error('compiler output digest differs');
}

/**
 * Writes compiler.cjs, manifest.json, upstream LICENSE.txt and upstream notice with modification NOTICE together.
 * The destination must be new. All required upstream bytes are checked before creating it.
 */
export async function writeCompilerDerivative(directory: string): Promise<void> {
  const require = createRequire(import.meta.url);
  const executable = require.resolve('@typescript/old/lib/typescript.js');
  const upstream = await readFile(executable, 'utf8');
  const license = await readFile(join(dirname(executable), '../LICENSE.txt'), 'utf8');
  // Proof: removing this guard let the altered-upstream-license writer succeed.
  if (hash(license) !== licenseSha256) throw new Error('compiler upstream license digest differs');
  const upstreamNotice = await readFile(
    join(dirname(executable), '../ThirdPartyNoticeText.txt'),
    'utf8',
  );
  // Proof: removing this guard let the altered-upstream-notice writer succeed.
  if (hash(upstreamNotice) !== upstreamNoticeSha256)
    throw new Error('compiler upstream notice digest differs');
  const artifact = buildCompilerDerivative(upstream);
  await mkdir(directory);
  await writeFile(join(directory, 'compiler.cjs'), artifact.source);
  await writeFile(
    join(directory, 'manifest.json'),
    `${JSON.stringify(artifact.manifest, null, 2)}\n`,
  );
  await writeFile(join(directory, 'LICENSE.txt'), license);
  await writeFile(join(directory, 'NOTICE'), upstreamNotice + noticeSuffix);
}

/** Reads and verifies all four required artifact members; missing/unreadable bytes throw. */
export async function readCompilerDerivative(directory: string) {
  const source = await readFile(join(directory, 'compiler.cjs'), 'utf8');
  const supplied: unknown = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  verifyCompilerDerivative(source, supplied);
  const license = await readFile(join(directory, 'LICENSE.txt'), 'utf8');
  const modificationNotice = await readFile(join(directory, 'NOTICE'), 'utf8');
  // Proof: removing this guard admitted the altered LICENSE.txt artifact member.
  if (hash(license) !== licenseSha256) throw new Error('compiler artifact license digest differs');
  // Proof: removing this guard admitted the altered NOTICE artifact member.
  if (hash(modificationNotice) !== noticeSha256)
    throw new Error('compiler artifact notice differs');
  return { source, manifest };
}
