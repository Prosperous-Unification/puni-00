import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { expect, test } from 'bun:test';

import { extractTypeScriptRelationships } from './typescript';
import { fixture, limits, request, workspace } from './typescript.test.fixture';
import { extractTypeScriptRelationshipsFromSource } from './typescript-core';

const recorded: unknown = JSON.parse(
  readFileSync(join(import.meta.dir, 'typescript.test.legacy.json'), 'utf8'),
);
const trustedModules = realpathSync(
  dirname(dirname(Bun.resolveSync('typescript/package.json', import.meta.dir))),
);

test('legacy wrapper and source preserve full pre-seam relationships and identities including empty families', () => {
  const observations = [];
  const legacy = [];
  for (const empty of [false, true]) {
    const { source, files } = fixture(empty ? { 'src/index.ts': 'export const value = 1;' } : {});
    files.set(
      '/candidate/node_modules/typescript/package.json',
      readFileSync(join(trustedModules, 'typescript/package.json'), 'utf8'),
    );
    const selection = empty ? { ...request, publicEntrypoints: [] } : request;
    observations.push(
      extractTypeScriptRelationshipsFromSource(workspace, selection, source, limits),
    );
    const directory = mkdtempSync('/tmp/typescript-legacy-parity-');
    try {
      for (const [path, text] of files) {
        const candidatePath = path.slice('/candidate/'.length);
        if (candidatePath.startsWith('node_modules/')) continue;
        const absolute = join(directory, candidatePath);
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, text);
      }
      legacy.push(extractTypeScriptRelationships(directory, selection, trustedModules));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  expect(recorded).toEqual(observations);
  expect(recorded).toEqual(legacy);
});
