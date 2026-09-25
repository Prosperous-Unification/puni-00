import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse, printParseErrorCode } from 'jsonc-parser';

import { readProjects } from './workspace-projects.mjs';

/** @param {string | URL} workspace */
function workspacePath(workspace) {
  return typeof workspace === 'string' ? resolve(workspace) : fileURLToPath(workspace);
}

/** @param {string} name */
function isProjectConfig(name) {
  return name === 'project.json' || /^tsconfig(?:\.[^.]+)?\.json$/.test(name);
}

/**
 * Every project or TypeScript configuration file at or below one directory of a project, skipping
 * dependencies, build output and dot-directories. A configuration nested inside a project — a
 * frontend module's own isolated type check — carries parent-relative paths that move with the
 * project exactly as its root configuration's do.
 *
 * @param {string} root
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function projectConfigFiles(root, directory) {
  /** @type {string[]} */
  const found = [];
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const path = `${directory}/${entry.name}`;
    // Proof: on 2026-09-25, skipping directories here (reading each project's root alone
    // again) failed `pins the complete moved depth-sensitive configuration inventory` with
    // `@@ -3,69 +3,10 @@`, its first missing row the calendar-markers module's `tsconfig.json`.
    if (entry.isDirectory()) found.push(...(await projectConfigFiles(root, path)));
    else if (isProjectConfig(entry.name)) found.push(path);
  }
  return found;
}

/**
 * @param {unknown} candidate
 * @param {readonly string[]} segments
 * @param {string} file
 * @param {{file: string; propertyPath: string; value: string}[]} paths
 */
function collectParentRelativePaths(candidate, segments, file, paths) {
  if (typeof candidate === 'string') {
    if (candidate.includes('../')) {
      paths.push({ file, propertyPath: segments.join('.'), value: candidate });
    }
    return;
  }
  if (Array.isArray(candidate)) {
    candidate.forEach((member, index) =>
      collectParentRelativePaths(member, [...segments, String(index)], file, paths),
    );
    return;
  }
  if (typeof candidate !== 'object' || candidate === null) return;
  for (const [property, member] of Object.entries(candidate)) {
    collectParentRelativePaths(member, [...segments, property], file, paths);
  }
}

/**
 * Enumerate parent-relative strings whose meaning changes when an app or
 * library project moves to a different namespace depth.
 *
 * @param {string | URL} workspace
 * @returns {Promise<readonly Readonly<{file: string; propertyPath: string; value: string}>[]>}
 */
export async function readDepthSensitiveConfigPaths(workspace) {
  const root = workspacePath(workspace);
  const projects = (await readProjects(root)).filter(
    ({ root: projectRoot }) => projectRoot.startsWith('apps/') || projectRoot.startsWith('libs/'),
  );
  /** @type {{file: string; propertyPath: string; value: string}[]} */
  const paths = [];
  /** @type {Set<string>} */
  const files = new Set();
  for (const project of projects) {
    for (const file of await projectConfigFiles(root, project.root)) files.add(file);
  }
  for (const file of [...files].sort((left, right) => left.localeCompare(right))) {
    /** @type {import('jsonc-parser').ParseError[]} */
    const errors = [];
    const config = parse(await readFile(join(root, file), 'utf8'), errors, {
      allowTrailingComma: true,
    });
    // Proof: omitting the JSONC error check made the malformed-config fixture
    // report `inventory unexpectedly succeeded` (2026-09-14).
    if (errors.length > 0) {
      const failures = errors.map(({ error }) => printParseErrorCode(error)).join(', ');
      throw new Error(`cannot parse ${file}: ${failures}`);
    }
    collectParentRelativePaths(config, [], file, paths);
  }
  return paths.sort((left, right) =>
    `${left.file}\0${left.propertyPath}\0${left.value}`.localeCompare(
      `${right.file}\0${right.propertyPath}\0${right.value}`,
    ),
  );
}
