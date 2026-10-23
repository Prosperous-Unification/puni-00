import {
  DEPENDENCY_SEMANTICS,
  DEPENDENCY_SEMANTICS_HEADER,
  DEPENDENCY_WEBSOCKET_PROTOCOL,
  type DependencyRuntimeCapability,
  type Refusal,
} from '@wbs/contracts';
import { withinDeadline } from '@wbs/runtime-portable';

import type { BackendRequestOptions } from './backend-request';

/**
 * The backend reads current authority on every upgrade. Only the intersection of
 * the offered client protocol and this binary's immutable support may claim v1.
 * Disabled authority accepts legacy clients; enabled authority refuses this
 * currently incapable binary. Retained delivery reuses this fresh read with
 * connection cancellation; deployment participant fencing remains required.
 */
export async function admitDependencyUpgrade(
  opts: BackendRequestOptions,
  offered: string | null,
  capability: DependencyRuntimeCapability,
  parent?: AbortSignal,
): Promise<Refusal<'client_dependency_incompatible'> | null> {
  // Proof: omitting validation changed the invalid-budget client failure and failed dependency-admission.test.ts.
  if (![opts.attemptMs, opts.overallMs].every((ms) => Number.isFinite(ms) && ms > 0))
    throw new Error('deadline budgets must be positive and finite');
  const claimsSemantics = claimsDependencySemantics(capability, offered);
  return withinDeadline(
    opts.timers,
    Math.min(opts.attemptMs, opts.overallMs),
    async (signal) => {
      // Proof: corrupting this outbound claim refused the capable binary's exact offer in dependency-admission.test.ts.
      const response = await opts.fetchImpl(`${opts.beUrl}/internal/gateway/dependency-admission`, {
        method: 'POST',
        signal,
        headers: {
          'x-internal-auth': opts.secret,
          ...(claimsSemantics ? { [DEPENDENCY_SEMANTICS_HEADER]: DEPENDENCY_SEMANTICS } : {}),
        },
      });
      // Proof: accepting typed409 as success admitted incompatible clients in dependency-admission.test.ts.
      if (response.status === 204) return null;
      // Proof: removing this status guard resolved the first unexpected-status case (200) instead of rejecting in dependency-admission.test.ts.
      if (response.status !== 409) {
        await response.body?.cancel();
        throw new Error(`dependency admission failed ${String(response.status)}`);
      }
      const refusal: unknown = await response.json();
      // Proof: dropping closed-envelope validation accepted extra trusted fields in dependency-admission.test.ts.
      if (
        typeof refusal !== 'object' ||
        refusal === null ||
        Object.keys(refusal).length !== 2 ||
        !('error' in refusal) ||
        refusal.error !== 'client_dependency_incompatible' ||
        !('required' in refusal) ||
        refusal.required !== DEPENDENCY_SEMANTICS
      )
        throw new Error('malformed dependency admission refusal');
      return { error: 'client_dependency_incompatible', required: DEPENDENCY_SEMANTICS };
    },
    // Proof: omitting parent cancellation times out physical close cancels a held retained authority request.
    parent,
  );
}

/** Exact offered WS tokens and immutable binary support jointly authorize the claim. */
export function claimsDependencySemantics(
  capability: DependencyRuntimeCapability,
  offered: string | null,
): boolean {
  // Proof: removing binary support or using prefix token matching independently admitted incompatible offers in dependency-admission.test.ts.
  return (
    capability.semantics.includes(DEPENDENCY_SEMANTICS) &&
    offered
      ?.split(',')
      .map((token) => token.trim())
      .includes(DEPENDENCY_WEBSOCKET_PROTOCOL) === true
  );
}
