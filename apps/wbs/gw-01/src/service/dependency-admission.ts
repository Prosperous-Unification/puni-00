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
 * the selected client protocol and this binary's immutable support may claim v1.
 * Disabled authority accepts legacy clients; enabled authority requires the
 * exact selected V1 protocol and immutable role support. Retained delivery reuses this fresh read with
 * connection cancellation; deployment participant fencing remains required.
 */
export async function admitDependencyUpgrade(
  opts: BackendRequestOptions,
  selected: string | null,
  capability: DependencyRuntimeCapability,
  parent?: AbortSignal,
): Promise<Refusal<'client_dependency_incompatible'> | null> {
  // Proof: omitting validation changed the invalid-budget client failure and failed dependency-admission.test.ts.
  if (![opts.attemptMs, opts.overallMs].every((ms) => Number.isFinite(ms) && ms > 0))
    throw new Error('deadline budgets must be positive and finite');
  const claimsSemantics = claimsDependencySemantics(capability, selected);
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

/** The exact selected token and immutable binary support jointly authorize the claim. */
export function claimsDependencySemantics(
  capability: DependencyRuntimeCapability,
  selected: string | null,
): boolean {
  return (
    capability.semantics.includes(DEPENDENCY_SEMANTICS) &&
    // Proof: permitting a raw offer list failed the selected-only claim assertion in dependency-admission.test.ts.
    selected === DEPENDENCY_WEBSOCKET_PROTOCOL
  );
}

/** A syntactically invalid or unsupported offered protocol is a modeled client refusal. */
export class DependencyProtocolRefused extends Error {}

/** Explicit handshake selection; legacy never grants V1 admission. Invalid offers throw. */
export function selectDependencyProtocol(
  capability: DependencyRuntimeCapability,
  offered: string | null,
): string | null {
  if (offered === null) return null;
  // Proof: restoring Unicode trim admitted raw NBSP-wrapped V1 with HTTP 101 in dependency-admission.integration.test.ts.
  const protocols = offered.split(',').map((token) => token.replace(/^[ \t]+|[ \t]+$/g, ''));
  // Proof: independently omitting duplicate or token-syntax rejection failed selection refuses in dependency-admission.test.ts.
  if (
    new Set(protocols).size !== protocols.length ||
    protocols.some((token) => !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(token))
  )
    throw new DependencyProtocolRefused('invalid dependency protocol offer');
  if (
    protocols.includes(DEPENDENCY_WEBSOCKET_PROTOCOL) &&
    // Proof: omitting immutable support selected V1 for the incapable fixture in dependency-admission.test.ts.
    capability.semantics.includes(DEPENDENCY_SEMANTICS)
  )
    return DEPENDENCY_WEBSOCKET_PROTOCOL;
  if (protocols.includes('wbs.legacy')) return 'wbs.legacy';
  // Proof: replacing this refusal with legacy selection admitted unknown-only offers in dependency-admission.test.ts.
  throw new DependencyProtocolRefused('unsupported dependency protocol offer');
}
