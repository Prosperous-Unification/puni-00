/** Modeled DNS network/protocol unavailability; bounded attempts may try another peer. */
export class DnsUnavailableError extends Error {
  override name = 'DnsUnavailableError';
}
