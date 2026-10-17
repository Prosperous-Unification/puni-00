import { Buffer } from 'node:buffer';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { extractNxRelationshipsFromSource } from './nx-core';
export type {
  NxDependencySelector,
  NxProjectSelector,
  NxRelationships,
  NxTargetSelector,
} from './nx-core';
const compareText = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

function findProjectFiles(workspace: string, directory = workspace): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    compareText(left.name, right.name),
  )) {
    if (entry.isSymbolicLink() || entry.name === '.git' || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findProjectFiles(workspace, path));
    else if (entry.isFile() && entry.name === 'project.json')
      files.push(relative(workspace, path).replaceAll('\\', '/'));
  }
  return files;
}

/** Reads static Nx configuration without loading plugins or executing candidate code. */
export function extractNxRelationships(
  workspace: string,
): ReturnType<typeof extractNxRelationshipsFromSource> {
  // Proof: renaming nx.json in the packed-install candidate exposed the missing workspace.
  if (!existsSync(join(workspace, 'nx.json')))
    throw new Error('Nx workspace configuration is absent: nx.json');
  return extractNxRelationshipsFromSource({
    projectPaths: () => findProjectFiles(workspace),
    read: (path) => readFileSync(join(workspace, path)),
  });
}
