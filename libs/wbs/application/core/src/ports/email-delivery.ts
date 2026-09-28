/** An injected dev/test sink; implementations must throw when delivery fails. */
export interface EmailDelivery {
  deliver(address: string, token: string): Promise<void>;
}
