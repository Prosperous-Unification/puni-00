import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parseAllDocuments } from 'yaml';

import { readMemoryMiB } from './observability-capacity';

/** The sole supported Flux/offline target; selectors and alternative identities are refused. */
export const veleroPatchTarget = Object.freeze({
  group: 'apps',
  version: 'v1',
  kind: 'Deployment',
  name: 'velero',
  namespace: 'puni-backup',
} as const);

function refuse(reason: string): never {
  throw new Error(`Velero patch ${reason}`);
}
function readMapping(input: unknown, keys: readonly string[]) {
  // Proof: Task25c3d patch-fields bypass admitted unknown Kustomize options through validatePlatform.
  const parsed = type('Record<string,unknown>')(input);
  if (
    parsed instanceof type.errors ||
    Array.isArray(input) ||
    Object.keys(parsed).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(parsed, key))
  )
    refuse('fields differ');
  return parsed;
}
function readEntry(input: unknown) {
  // Proof: Task25c3d single-policy widening admitted extra renderer and patch entries.
  if (!Array.isArray(input) || input.length !== 1) refuse('requires one entry');
  return type('unknown[]').assert(input)[0];
}
/** Require the original archive's complete ordered volumes; preexisting limits also refuse. */
export function assertVeleroVolumes(input: unknown): void {
  // Proof: Task25c3d patch-volume-precondition bypass admitted a foreign credentials Secret.
  if (
    !isDeepStrictEqual(input, [
      { name: 'cloud-credentials', secret: { secretName: 'velero-credentials' } },
      { name: 'plugins', emptyDir: {} },
      { name: 'scratch', emptyDir: {} },
    ])
  )
    refuse('volume precondition differs');
}

/**
 * Decode only the supported three-operation JSON6902 policy, with YAML syntax checked before semantics.
 * The frozen flat return snapshots original patch bytes and quantities; caller mutation grants no authority.
 * Throws for missing/ambiguous documents, foreign fields/identities/operations or nonpositive quantities.
 */
export function readVeleroPatch(input: unknown) {
  const renderer = readMapping(readEntry(input), ['kustomize']);
  const kustomize = readMapping(renderer['kustomize'], ['patches']);
  const entry = readMapping(readEntry(kustomize['patches']), ['target', 'patch']);
  // Proof: Task25c3d patch-target bypass admitted every changed identity/selector field.
  if (!isDeepStrictEqual(entry['target'], veleroPatchTarget)) refuse('target differs');
  if (typeof entry['patch'] !== 'string') refuse('inline string required');
  const documents = parseAllDocuments(entry['patch']);
  // Proof: Task25c3d patch-document-count and patch-duplicate-keys omissions each admitted ambiguous YAML.
  if (documents.length !== 1 || documents[0].errors.length) refuse('malformed or ambiguous YAML');
  const operations: unknown = documents[0].toJSON();
  // Proof: Task25c3d patch-operation-count widening admitted an extra remove operation.
  if (!Array.isArray(operations) || operations.length !== 3) refuse('requires three operations');
  const decoded = type('unknown[]').assert(operations);
  const test = readMapping(decoded[0], ['op', 'path', 'value']);
  // Proof: Task25c3d patch-test-op bypass admitted add in place of the full-array test.
  if (test['op'] !== 'test' || test['path'] !== '/spec/template/spec/volumes')
    refuse('test differs');
  assertVeleroVolumes(test['value']);
  const quantities = [1, 2].map((index) => {
    const operation = readMapping(decoded[index], ['op', 'path', 'value']);
    // Proof: Task25c3d patch-add-op bypass admitted a different volume index.
    if (
      operation['op'] !== 'add' ||
      operation['path'] !== `/spec/template/spec/volumes/${String(index)}/emptyDir/sizeLimit`
    )
      refuse('add differs');
    // Proof: Task25c3d patch-string-quantity and patch-positive-quantity bypasses admitted numbers and zero/malformed/overflowing strings.
    if (typeof operation['value'] !== 'string' || readMemoryMiB(operation['value'], refuse) <= 0)
      refuse('sizeLimit must be a positive quantity string');
    return operation['value'];
  });
  // Proof: Task25c3d patch-freeze removal failed the immutable decoded authority assertion.
  return Object.freeze({
    patch: entry['patch'],
    pluginsSizeLimit: quantities[0],
    scratchSizeLimit: quantities[1],
  });
}
