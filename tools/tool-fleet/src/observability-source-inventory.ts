import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { indexObservabilitySource } from './observability-source-render';

/** Immutable rendered bytes; source evidence never establishes observed Pods or admission authority. */
export interface ColdStartFrame {
  readonly owner: string;
  readonly bytes: string;
}
/** Expected unfiltered resources from the independently validated render contract. */
export interface ColdStartInventory {
  readonly owner: string;
  readonly sha256: string;
  readonly resources: readonly string[];
}
/** Reuse the source index boundary after exact owner, byte and resource closure; no filtered inventory grants authority. */
export function readColdStartSource(
  frames: readonly ColdStartFrame[],
  inventory: readonly ColdStartInventory[],
) {
  const owners = frames.map((frame) => frame.owner).sort();
  // Proof: Task25a source-owner-closure removal failed missing/duplicate/empty source-inventory negatives.
  if (
    inventory.length === 0 ||
    new Set(owners).size !== owners.length ||
    new Set(inventory.map((frame) => frame.owner)).size !== inventory.length ||
    !isDeepStrictEqual(owners, inventory.map((frame) => frame.owner).sort())
  )
    throw new Error('Cold start source-owner-closure');
  const rendered: Record<string, string> = {};
  for (const frame of frames) {
    const expected = inventory.find((expected) => expected.owner === frame.owner);
    // Proof: Task25a source-hash removal admitted changed immutable source bytes.
    if (createHash('sha256').update(frame.bytes).digest('hex') !== expected?.sha256)
      throw new Error('Cold start source-hash');
    rendered[frame.owner] = frame.bytes;
  }
  const indexed = indexObservabilitySource(rendered);
  for (const expected of inventory) {
    // Proof: Task25a resource-closure removal admitted omitted/wrong-name/wrong-namespace owners.
    if (
      !isDeepStrictEqual(
        Object.keys(indexed[expected.owner]).sort(),
        [...expected.resources].sort(),
      )
    )
      throw new Error('Cold start source-resource-closure');
  }
  return { indexed, inventory };
}
