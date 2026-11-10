import { Buffer } from 'node:buffer';
import { readFileSync, statSync } from 'node:fs';

import { extractNxRelationshipsFromSource } from '../relationships/nx-core';
import type { CommittedSource } from './committed-source';

export function readOperatorFile(path: string): Uint8Array {
  // Proof: prep-operator-regular; its recorded production-source fault failed `refuses a native FIFO review input within the bounded subprocess`; `refuses a native FIFO audit input within the bounded subprocess` and passed after restoration.
  if (!statSync(path).isFile())
    throw new Error('preparation operator input must be a regular file: ' + path);
  return readFileSync(path);
}
// Proof: prep-json-utf8; its recorded production-source fault failed `preserves review fatal UTF8 decoding instead of replacement JSON parsing`; `preserves audit fatal UTF8 decoding instead of replacement JSON parsing` and passed after restoration.
export function readJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}
export function readSourceFile(source: CommittedSource, path: string): Uint8Array {
  const entry = source.readSnapshot().entries.find((entry) => entry.path === path);
  // Proof: prep-captured-regular; its recorded production-source fault failed `refuses a captured symlink nx configuration before output reservation` and passed after restoration.
  if (entry === undefined || (entry.mode !== '100644' && entry.mode !== '100755'))
    throw new Error('preparation input must be a captured regular file: ' + path);
  return source.readFile(path);
}
export function readProjects(source: CommittedSource) {
  const entries = source.readSnapshot().entries;
  readSourceFile(source, 'nx.json');
  return extractNxRelationshipsFromSource({
    projectPaths: () =>
      entries
        .filter(
          (entry) =>
            (entry.mode === '100644' || entry.mode === '100755') &&
            entry.path.split('/').at(-1) === 'project.json' &&
            !entry.path
              .split('/')
              .some((component) => component === '.git' || component === 'node_modules'),
        )
        .map((entry) => entry.path)
        .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))),
    read: (path) => readSourceFile(source, path),
  }).relationships.projects;
}
