import type { InternalPushRequest } from '@wbs/contracts';

export interface PushClientOptions {
  gwUrl: string;
  secret: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

export class PushFailed extends Error {
  override name = 'PushFailed' as const;
}

export class PushClient {
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(private readonly opts: PushClientOptions) {
    this.fetch = opts.fetchImpl ?? globalThis.fetch;
    this.sleep =
      opts.sleep ??
      ((ms) =>
        new Promise((r) => {
          setTimeout(r, ms);
        }));
    this.maxRetries = opts.maxRetries ?? 5;
  }

  async push(payload: InternalPushRequest): Promise<{ delivered: number }> {
    let backoff = 500;
    // Serialised once, outside the retry loop. The payload does not change
    // between attempts, and the dominant one is `tree_replaced` carrying a whole
    // plan — so a gateway that is down made be-01 stringify every row of the
    // project six times over about a minute.
    const body = JSON.stringify(payload);
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const res = await this.fetch(`${this.opts.gwUrl}/internal/push`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Internal-Auth': this.opts.secret,
        },
        body,
      });
      if (res.status >= 200 && res.status < 300) {
        const body = (await res.json()) as { delivered_to_sockets: number };
        return { delivered: body.delivered_to_sockets };
      }
      const transient = res.status >= 500 || res.status === 408 || res.status === 429;
      if (!transient) {
        const text = await res.text();
        throw new PushFailed(`push failed with ${String(res.status)}: ${text}`);
      }
      if (attempt === this.maxRetries) {
        throw new PushFailed(
          `push failed after ${String(this.maxRetries + 1)} attempts: last=${String(res.status)}`,
        );
      }
      await this.sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
    }
    throw new PushFailed('unreachable');
  }
}
