/**
 * The slice of `fetch` gw-01 calls, so a test can hand it a stub.
 *
 * Narrower than `typeof fetch` on purpose: nothing in gw-01 calls
 * `fetch.preconnect`, and demanding it made every stub in gw-01's own tests a
 * type error — invisible, because no `typecheck` target compiled a test file
 * here until 2026-09-02. `globalThis.fetch` still satisfies it.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ForwardClientOptions {
  beUrl: string;
  secret: string;
  fetchImpl?: FetchLike;
}

export class ForwardClient {
  private readonly fetch: FetchLike;
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
