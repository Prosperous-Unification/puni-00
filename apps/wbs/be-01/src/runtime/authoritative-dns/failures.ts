import { DomainDnsUnavailableError } from '@wbs/core';

/**
 * Modeled DNS network/protocol unavailability; bounded attempts may try another peer.
 * Proof: inheriting plain Error made the booted activated `immediate configured
 * sweep` terminate on outage instead of persisting the expected failed proof.
 */
export class DnsUnavailableError extends DomainDnsUnavailableError {
  override name = 'DnsUnavailableError';
}
