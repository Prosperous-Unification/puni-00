// Proof: codec-T1-consumer added a trailing byte only here; real mounted
// authority/claim/write digest correspondence failed while each receiver returned success.
export {
  canonicalRuntimeRequest,
  parseCanonicalRuntimeRequest,
  parseRuntimeAuthorityRequest,
  parseRuntimeClaimRequest,
  parseRuntimeLookup,
  parseRuntimeStateRequest,
  parseRuntimeWriteRequest,
} from '@wbs/contracts';
