import {
  ClientConfigurationError,
  clientFromShapes,
  type ClientInput,
  type ClientReply,
  type ClientTransport,
  readProjectClaims,
} from '@wbs/contracts';
/** Validated live project observations. Injected implementations must preserve the shared response contract; this reader grants no execution permission by itself. */
export interface ClaimClient {
  readClaims(
    input: ClientInput<typeof readProjectClaims>,
  ): Promise<ClientReply<typeof readProjectClaims>>;
}
/** Composes the shared boundary using exactly one public read shape. */
export function createClaimClient(transport: ClientTransport): ClaimClient {
  // Proof: C01 removed callable validation; 'narrow claim reader rejects noncallable' failed.
  if (typeof transport !== 'function')
    throw new ClientConfigurationError('Claim client requires a callable transport');
  // Proof: C02 removed the sole read shape; 'narrow claim reader forwards' failed.
  const client = clientFromShapes([readProjectClaims] as const, transport);
  return { readClaims: (input) => client.getApiProjectsByIdClaims(input) };
}
