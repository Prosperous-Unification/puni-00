export interface ForwardClientOptions {
  beUrl: string;
  secret: string;
  fetchImpl?: typeof fetch;
}

export class ForwardClient {
  private readonly fetch: typeof fetch;
  constructor(private readonly opts: ForwardClientOptions) {
    this.fetch = opts.fetchImpl ?? globalThis.fetch;
  }

  async forward(
    message: unknown,
    ctx: { clientId: string; connectionId: string; traceId: string },
  ): Promise<{ ack: boolean; push_responses?: unknown[] }> {
    const res = await this.fetch(`${this.opts.beUrl}/internal/forward`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-auth': this.opts.secret,
        'x-client-id': ctx.clientId,
        'x-connection-id': ctx.connectionId,
      },
      body: JSON.stringify({ message, trace_id: ctx.traceId }),
    });
    if (!res.ok) throw new Error(`forward failed ${String(res.status)}`);
    return (await res.json()) as { ack: boolean };
  }
}
