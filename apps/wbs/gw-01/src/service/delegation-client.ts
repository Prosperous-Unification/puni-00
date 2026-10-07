import type { FetchLike } from './backend-request';

/** Unwired gateway adapter for a one-request project access check. */
export class DelegationClient {
  constructor(private readonly opts: { beUrl: string; secret: string; fetchImpl: FetchLike }) {}

  /** Requires an exact 204 and sends no cookie or context authority. */
  async checkProject(projectId: string, token: string, signal?: AbortSignal): Promise<void> {
    const response = await this.opts.fetchImpl(
      `${this.opts.beUrl}/internal/gateway/projects/${encodeURIComponent(projectId)}/access`,
      {
        method: 'POST',
        // Proof: adding a cookie failed `presents service and bearer credentials
        // without cookies` (2026-09-28).
        headers: {
          'x-internal-auth': this.opts.secret,
          authorization: `Bearer ${token}`,
        },
        signal,
      },
    );
    // Proof: accepting any 2xx made `refuses a success-shaped body on any
    // status other than 204` accept 200 (2026-09-28).
    if (response.status !== 204) {
      await response.body?.cancel();
      throw new Error(`gateway project access failed ${String(response.status)}`);
    }
  }
}
