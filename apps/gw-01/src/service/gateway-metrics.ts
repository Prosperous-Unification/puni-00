export interface GatewayCounters {
  activeConnections: number;
  connectionsTotal: number;
  reconnectsTotal: number;
  messageFanoutTotal: number;
  inboundMessagesTotal: number;
  backendUnavailableTotal: number;
}

export class GatewayMetrics {
  readonly counters: GatewayCounters = {
    activeConnections: 0,
    connectionsTotal: 0,
    reconnectsTotal: 0,
    messageFanoutTotal: 0,
    inboundMessagesTotal: 0,
    backendUnavailableTotal: 0,
  };

  connectionOpened(): void {
    this.counters.connectionsTotal++;
    this.counters.activeConnections++;
  }

  connectionClosed(): void {
    if (this.counters.activeConnections > 0) this.counters.activeConnections--;
  }

  reconnect(): void {
    this.counters.reconnectsTotal++;
  }

  fanOut(n: number): void {
    this.counters.messageFanoutTotal += n;
  }

  inbound(): void {
    this.counters.inboundMessagesTotal++;
  }

  backendUnavailable(): void {
    this.counters.backendUnavailableTotal++;
  }
}

export const gwMetrics = new GatewayMetrics();
