import { parseSecretsOrThrow, type } from '@shared/validation';

import { serializeCanonical } from '../evidence/content-manifest';

/**
 * Complete tool-source identity; a working capture never asserts committed/release provenance.
 * Proof: making tree/identity optional or deleting each branch's extra keys makes its
 * toolkit3 required/closed owner accept missing identity or silently stripped extra fields.
 */
export const ToolkitSourceSelection = type({
  kind: "'committed'",
  revision: /^[0-9a-f]{40}$/u,
  tree: /^[0-9a-f]{40}$/u,
})
  .onUndeclaredKey('reject')
  .or(
    type({
      kind: "'working'",
      base: /^[0-9a-f]{40}$/u,
      identity: /^[0-9a-f]{64}$/u,
    }).onUndeclaredKey('reject'),
  );

export type ToolkitSourceSelection = typeof ToolkitSourceSelection.infer;

/** Compare complete already-decoded source identities; the display/reference commit alone is insufficient. */
export function isSameToolkitSource(
  left: ToolkitSourceSelection,
  right: ToolkitSourceSelection,
): boolean {
  return serializeCanonical(left) === serializeCanonical(right);
}

/** Decode one external serialized source selection; internal consumers retain this closed union. */
export function readToolkitSourceSelection(input: unknown): ToolkitSourceSelection {
  const selection = parseSecretsOrThrow(ToolkitSourceSelection, input);
  return selection.kind === 'committed'
    ? { kind: 'committed', revision: selection.revision, tree: selection.tree }
    : { kind: 'working', base: selection.base, identity: selection.identity };
}
