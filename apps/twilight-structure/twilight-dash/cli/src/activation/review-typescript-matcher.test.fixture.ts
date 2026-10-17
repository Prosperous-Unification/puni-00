import { expect, mock, test } from 'bun:test';

import { createRetainedNamespace } from './review-namespace';
import { fixture } from './review-typescript-source.test.fixture';
const shape = process.env['RETAINED_MATCHER_SHAPE'];
function matchFiles(
  _path: unknown,
  _extensions: unknown,
  _exclude: unknown,
  _include: unknown,
  _caseSensitive: unknown,
  _cwd: unknown,
  _depth: unknown,
  _entries: unknown,
  _realpath: unknown,
) {
  return [];
}
await mock.module('typescript', () => ({
  default: {
    version: shape === 'version' ? 'foreign' : '6.0.3',
    matchFiles: shape === 'version' ? matchFiles : () => [],
  },
}));
const { createRetainedTypeScriptSource } = await import('./review-typescript-source');
test('installed matcher signature drift refuses before publishing a source', () => {
  const f = fixture();
  const namespace = createRetainedNamespace(f.candidate, f.runtime, {
    maximumEntries: 100,
    maximumNodes: 100,
    maximumPathBytes: 1024,
    maximumTotalPathBytes: 10000,
  });
  expect(() =>
    createRetainedTypeScriptSource(namespace, f.candidate, f.runtime, {
      maximumNodes: 100,
      maximumProbes: 100,
      maximumSteps: 100,
      maximumReads: 100,
      maximumReadBytes: 10000,
      maximumReadEntries: 100,
      maximumReadLedgerBytes: 100000,
      maximumPathBytes: 1024,
      maximumTargetBytes: 1024,
      maximumExpandedPathBytes: 4096,
      maximumLinkExpansions: 10,
      maximumDirectoryDepth: 30,
      maximumPatterns: 100,
      maximumPatternBytes: 1000,
      maximumEnumeratedEntries: 1000,
      maximumReturnedPathBytes: 10000,
    }),
  ).toThrow('matchFiles shape differs');
});
