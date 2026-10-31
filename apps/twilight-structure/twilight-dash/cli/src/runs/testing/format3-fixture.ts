import { FORMAT3_IDENTITY } from '../sqlite/format';
import {
  decodeFormat3Envelope,
  decodeFormat3Response,
  format3SourceEntries,
} from './format3-protocol';
import { createPredecessorFixture, verifyPredecessorSource } from './predecessor-fixture';

const commit = 'bb14bb1cf3afc0559e4d0864374e11c652751751';
/** Audits this exact predecessor source without loading current production modules. */
export function verifyFormat3Source(directory: string) {
  return verifyPredecessorSource(directory, commit, format3SourceEntries);
}
/** Loads the genuine pinned provider before exposing its already-open writer. */
export async function createFormat3Fixture(path: string, mode: 'bootstrap' | 'open' = 'bootstrap') {
  return await createPredecessorFixture(
    {
      commit,
      label: 'format3',
      identity: FORMAT3_IDENTITY,
      sourceEntries: format3SourceEntries,
      workerFiles: ['format3-worker.ts', 'format3-protocol.ts'],
      decodeEnvelope: decodeFormat3Envelope,
      decodeResponse: decodeFormat3Response,
    },
    path,
    mode,
  );
}
export { settleFixture } from './construct-fixture';
export type {
  Format3Capture,
  Format3Command,
  Format3Mutation,
  Format3Population,
  SqliteCaptureCell,
} from './format3-protocol';
