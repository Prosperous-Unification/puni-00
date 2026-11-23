import {
  ClientConfigurationError,
  clientFromShapes,
  type ClientInput,
  type ClientReply,
  type ClientTransport,
  readWorkPackageClaims,
} from '@wbs/contracts';
/** Validated live work package observations. Injected implementations must preserve the shared response contract; this reader grants no execution permission by itself. */
export interface ClaimClient {
  readClaims(
    input: ClientInput<typeof readWorkPackageClaims>,
  ): Promise<ClientReply<typeof readWorkPackageClaims>>;
}
/** Composes the shared boundary using exactly one public read shape. */
export function createClaimClient(transport: ClientTransport): ClaimClient {
  // Proof: C01 removed callable validation; 'narrow claim reader rejects noncallable' failed.
  if (typeof transport !== 'function')
    throw new ClientConfigurationError('Claim client requires a callable transport');
  // Proof: C02 removed the sole read shape; 'narrow claim reader forwards' failed.
  const client = clientFromShapes([readWorkPackageClaims] as const, transport);
  // Proof: current-claim-sdk-operation retained the removed method after current export binding;
  // 'narrow claim reader forwards only validated work package claims with original signal' reached
  // TypeError before transport. This proves required SDK binding, not permission admission.
  return { readClaims: (input) => client.getApiWorkPackagesByIdClaims(input) };
}
