import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { ordinaryHoldSourceEpochV1 } from './dependency-owner-custody';

/**
 * Reads only the authenticated historical compiler inputs for finite tests.
 *
 * Missing, unreadable, changed or incomplete archives throw. The logical root
 * only supplies planner map keys; no current checkout or runtime Git fallback
 * exists. These bytes preserve historical compiler assertions and grant no
 * current-source or native execution qualification.
 */
export async function readHistoricalSources(
  sourceRoot: string,
  archive = new URL('./ordinary-febb-sources/', import.meta.url),
): Promise<ReadonlyMap<string, Uint8Array>> {
  const expected =
    JSON.stringify(
      {
        format: 'ordinary-historical-source-archive',
        version: 1,
        sourceEpoch: ordinaryHoldSourceEpochV1.sourceEpoch,
        sourceIdentity: ordinaryHoldSourceEpochV1.sourceIdentity,
        sources: ordinaryHoldSourceEpochV1.pins,
      },
      null,
      2,
    ) + '\n';
  const manifest = await readFile(new URL('manifest.json', archive), 'utf8');
  // Proof: omitting this check made the altered complete-roster manifest negative resolve.
  if (manifest !== expected) throw new Error('historical source archive manifest differs');
  const supplied = new Map<string, Uint8Array>();
  for (const pin of ordinaryHoldSourceEpochV1.pins) {
    const bytes = await readFile(new URL(`${pin.relative}.txt`, archive));
    // Proof: omitting this check made the same-length changed-byte negative resolve.
    if (
      bytes.byteLength !== pin.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== pin.sha256
    )
      throw new Error(`historical source archive bytes differ: ${pin.relative}`);
    supplied.set(`${sourceRoot}/${pin.relative}`, bytes);
  }
  return supplied;
}
