/**
 * Retain every Bun field/value while giving only its top-level input/output dictionaries a
 * stable key order. Import/export arrays, nested values and their ordering remain exact.
 * The caller supplies actual Bun compiler metadata; this is not an arbitrary JSON normalizer.
 */
export function orderCompilerMetadata(metadata: Bun.BuildMetafile): Bun.BuildMetafile {
  const inputs = Object.fromEntries(Object.entries(metadata.inputs).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0));
  const outputs = Object.fromEntries(Object.entries(metadata.outputs).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0));
  return { ...metadata, inputs, outputs };
}

/** Actual source-stability decision; dictionary key order alone is not a changed compiler input. */
export function compareCompilerMetadata(before: Bun.BuildMetafile, after: Bun.BuildMetafile):
  | { readonly kind: 'same' }
  | { readonly kind: 'different'; readonly before: string; readonly after: string } {
  const beforeText = JSON.stringify(orderCompilerMetadata(before));
  const afterText = JSON.stringify(orderCompilerMetadata(after));
  return beforeText === afterText ? { kind: 'same' } : { kind: 'different', before: beforeText, after: afterText };
}
