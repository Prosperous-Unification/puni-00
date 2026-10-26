import { parseOrThrow, type } from '@shared/validation';
import type { Database } from 'bun:sqlite';

import {
  referenceArtifact,
  snapshotArtifactContent,
  verifyArtifactContent,
} from '../artifact-integrity';
import type { ArtifactStore } from '../artifact-store';
import { decodeArtifactRef, equalRecords } from '../record-codecs';

const ArtifactRowCodec = type({
  digest: 'string',
  reference: 'string',
  content: type.instanceOf(Uint8Array),
});

/** Uses the provider's local transaction queue; no run or external-provider transaction crosses the artifact port. */
export function createSqliteArtifactStore(
  database: Database,
  transact: <T>(write: boolean, operation: () => T) => Promise<T>,
): ArtifactStore {
  function find(digest: string) {
    const input = database.query('SELECT * FROM run_artifact WHERE digest=?').get(digest);
    if (input === null) return undefined;
    const row = parseOrThrow(ArtifactRowCodec, input);
    const reference = decodeArtifactRef(JSON.parse(row.reference));
    // Proof: bypassing artifact key enforcement failed 'corrupt existing artifact metadata throws before retain or metadata conflict'.
    if (reference.digest !== row.digest) throw new Error('artifact integrity key mismatch');
    // Proof: bypassing artifact dispatch enforcement failed 'corrupt existing artifact bytes throws before retain or metadata conflict'.
    verifyArtifactContent(row.content, reference);
    return { reference, content: row.content };
  }
  return {
    async retainArtifact(input, mediaType) {
      const content = snapshotArtifactContent(input);
      const reference = referenceArtifact(content, mediaType);
      return await transact(true, () => {
        const existing = find(reference.digest);
        if (existing !== undefined) {
          // Proof: bypassing artifact retain metadata sql enforcement failed 'sqlite artifacts > retains immutable bytes and refuses metadata collisions'.
          if (!equalRecords(existing.reference, reference))
            return { kind: 'refused', reason: 'metadata_conflict' };
          return { kind: 'retained', reference: existing.reference };
        }
        database
          .query('INSERT INTO run_artifact(digest,reference,content) VALUES (?,?,?)')
          .run(reference.digest, JSON.stringify(reference), content);
        const retained = find(reference.digest);
        // Proof: bypassing artifact readback sql enforcement failed 'sqlite artifact retention reads back a suppressed insert and throws without claiming retention'.
        if (retained === undefined) throw new Error('artifact does not exist after retention');
        return { kind: 'retained', reference: retained.reference };
      });
    },
    async readArtifact(input) {
      const reference = decodeArtifactRef(structuredClone(input));
      return await transact(false, () => {
        const retained = find(reference.digest);
        // Proof: bypassing artifact missing sql enforcement failed 'sqlite artifacts > retains immutable bytes and refuses metadata collisions'.
        if (retained === undefined) throw new Error('artifact does not exist');
        // Proof: bypassing artifact read metadata sql enforcement failed 'sqlite artifacts > retains immutable bytes and refuses metadata collisions'.
        if (!equalRecords(reference, retained.reference))
          throw new Error('artifact metadata differs');
        return new Uint8Array(retained.content);
      });
    },
  };
}
