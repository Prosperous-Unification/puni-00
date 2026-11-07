/** Genuine format4 uses the unchanged strict legacy Attempt2 wire contract. The archived format3 protocol is byte-identical at both compiled producer pins; provenance includes that dependency. Guard ownership and original proof credit remain with format3-protocol. */
export const format4SourceEntries = [
  'sqlite/format.ts',
  'sqlite/read-recovery.ts',
  'sqlite/recovery-store.ts',
  'recovery-codecs.ts',
  'sqlite/open-stores.ts',
  'sqlite/run-store.ts',
  'sqlite/schema.ts',
  'record-codecs.ts',
  'execution-codecs.ts',
  'runtime-codecs.ts',
  // Proof: fix-round1 007 omitted only this dependency; tampered archived protocol bytes passed verifyFormat4Source. The shared hash comparison remained installed.
  'testing/format3-protocol.ts',
  'testing/fixtures.ts',
  'testing/runtime-history-contract.ts',
] as const;
export type {
  Format3Capture as Format4Capture,
  Format3Command as Format4Command,
  Format3Correlation as Format4Correlation,
  Format3Expected as Format4Expected,
  Format3Failure as Format4Failure,
  Format3Invocation as Format4Invocation,
  Format3InvokeReply as Format4InvokeReply,
  Format3Mutation as Format4Mutation,
  Format3Payload as Format4Payload,
  Format3Population as Format4Population,
  Format3Request as Format4Request,
  Format3Response as Format4Response,
  SqliteCaptureCell,
} from './format3-protocol';
export {
  correlateFormat3Request as correlateFormat4Request,
  decodeFormat3Command as decodeFormat4Command,
  decodeFormat3Envelope as decodeFormat4Envelope,
  decodeFormat3Payload as decodeFormat4Payload,
  decodeFormat3Response as decodeFormat4Response,
  format3MutationCodec as format4MutationCodec,
} from './format3-protocol';
