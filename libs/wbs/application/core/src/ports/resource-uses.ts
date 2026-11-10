import type { AuthenticatedUser } from '@wbs/contracts';
import type {
  Permission,
  ResourceUse,
  ResourceUseEvent,
  ResourceUseEventDraft,
  ResourceUseRegistration,
  ResourceUseState,
} from '@wbs/domain';

import type { ResourceAccess } from './organization-access';
import { retainSecurityPrincipal, type SecurityPrincipal } from './security-principal';
/** Verified request identity. The fingerprint distinguishes machine credentials from their issuing account. */
export interface ResourceUseActor {
  readonly principal: SecurityPrincipal;
  id: string;
  fingerprint: string;
  personId: string | null;
  access: ResourceAccess;
}

/** Compares verified authentication fields without depending on object insertion order. */
function matchesAuthentication(
  actual: AuthenticatedUser['authentication'],
  scoped: AuthenticatedUser['authentication'],
): boolean {
  if (actual === undefined || scoped === undefined) return actual === scoped;
  if (actual.kind !== scoped.kind) return false;
  switch (actual.kind) {
    case 'first_party':
      // Proof: authentication-first_party-issuedAt.
      // The recorded fault broke `rejects direct resource authentication field first party time before reads`; restored GREEN.
      return scoped.kind === 'first_party' && actual.issuedAt === scoped.issuedAt;
    case 'upstream':
      return (
        scoped.kind === 'upstream' &&
        // Proof: authentication-upstream-issuer.
        // The recorded fault broke `rejects direct resource authentication field upstream issuer before reads`; restored GREEN.
        actual.issuer === scoped.issuer &&
        // Proof: authentication-upstream-subject.
        // The recorded fault broke `rejects direct resource authentication field upstream subject before reads`; restored GREEN.
        actual.subject === scoped.subject
      );
    case 'machine':
      return (
        scoped.kind === 'machine' &&
        // Proof: authentication-machine-credentialId.
        // The recorded fault broke `rejects direct resource authentication field machine credential before reads`; restored GREEN.
        actual.credentialId === scoped.credentialId &&
        // Proof: authentication-machine-personId.
        // The recorded fault broke `rejects direct resource authentication field machine person before reads`; restored GREEN.
        actual.personId === scoped.personId &&
        // Proof: authentication-machine-runId.
        // The recorded fault broke `rejects direct resource authentication field machine run before reads`; restored GREEN.
        actual.runId === scoped.runId
      );
    case 'consent':
      return (
        scoped.kind === 'consent' &&
        // Proof: authentication-consent-credentialId.
        // The recorded fault broke `rejects direct resource authentication field consent credential before reads`; restored GREEN.
        actual.credentialId === scoped.credentialId &&
        // Proof: authentication-consent-personId.
        // The recorded fault broke `rejects direct resource authentication field consent person before reads`; restored GREEN.
        actual.personId === scoped.personId &&
        // Proof: authentication-consent-issuer.
        // The recorded fault broke `rejects direct resource authentication field consent issuer before reads`; restored GREEN.
        actual.issuer === scoped.issuer &&
        // Proof: authentication-consent-subject.
        // The recorded fault broke `rejects direct resource authentication field consent subject before reads`; restored GREEN.
        actual.subject === scoped.subject
      );
  }
}

/** Canonical historical replay identity, derived from actual authentication and never authority. */
export function fingerprintResourceUseActor(principal: SecurityPrincipal): string {
  const authentication = principal.authentication;
  const pinned = authentication?.kind === 'machine' || authentication?.kind === 'consent';
  return JSON.stringify([
    principal.id,
    pinned ? authentication.kind : 'account',
    pinned ? authentication.credentialId : null,
  ]);
}

/**
 * Rejects inconsistent trusted actor evidence before any owner or database read.
 * The actual authenticated principal is required; scoped identity is never a fallback.
 * @throws when actor, scoped account or authentication differs from actual evidence.
 */
export function assertResourceUseActor(actor: ResourceUseActor): void {
  const principal = actor.principal;
  // Runtime trusted-boundary absence is checked despite the required internal type.
  // Proof: tuple-scalar-actor.
  // The recorded fault broke `rejects the isolated resource scalar actor mismatch before every dependency`; restored GREEN.
  if (Object.is(principal, null) || Object.is(principal, undefined) || actor.id !== principal.id)
    throw new Error('resource actor differs from the authenticated principal');
  if (actor.access.kind === 'scoped') {
    const scoped = actor.access.principal;
    // Proof: tuple-scoped-identity.
    // The recorded fault broke `rejects direct resource register scope mismatch before reads`; restored GREEN.
    if (
      Object.is(scoped, undefined) ||
      Object.is(scoped, null) ||
      actor.access.scope.userId !== principal.id ||
      scoped.id !== principal.id
    )
      throw new Error('resource scope differs from the authenticated principal');
    // Proof: tuple-authentication.
    // The recorded fault broke `rejects direct resource authentication field first party time before reads`; restored GREEN.
    if (!matchesAuthentication(principal.authentication, scoped.authentication))
      throw new Error('resource scoped authentication differs from the actual principal');
    if (
      principal.delegation !== undefined &&
      // Proof: tuple-delegation-organization.
      // The recorded fault broke `rejects direct resource register delegation organization before reads`; restored GREEN.
      principal.delegation.organizationId !== actor.access.scope.organizationId
    )
      throw new Error('resource delegation organization differs from the authenticated scope');
  }
  const authentication = principal.authentication;
  const personId =
    authentication?.kind === 'machine' || authentication?.kind === 'consent'
      ? authentication.personId
      : null;
  // Proof: tuple-person.
  // The recorded fault broke `rejects direct resource register unpinned person before reads`; restored GREEN.
  if (actor.personId !== personId)
    throw new Error('resource actor person differs from the authenticated principal');
  // Proof: tuple-fingerprint.
  // The recorded fault broke `rejects direct resource register fingerprint before reads`; restored GREEN.
  if (actor.fingerprint !== fingerprintResourceUseActor(principal))
    throw new Error('resource actor fingerprint differs from the authenticated principal');
}

/** Detaches a previously checked actor before queueing, selecting no binding, token or unrelated caller fields. */
export function retainResourceUseActor(actor: ResourceUseActor): ResourceUseActor {
  const access = actor.access;
  return {
    id: actor.id,
    // Proof: store-authentication-deep-retention.
    // The recorded fault broke `retains manual resource register queued nested authentication before the writer`; restored GREEN.
    // Proof: store-authority-minimal-projection.
    // The recorded fault broke `projects actual resource grant authority without binding or secret-shaped extras`; restored GREEN.
    principal: retainSecurityPrincipal(actor.principal),
    fingerprint: actor.fingerprint,
    personId: actor.personId,
    access:
      access.kind === 'legacy'
        ? { kind: 'legacy' }
        : {
            kind: 'scoped',
            scope: {
              organizationId: access.scope.organizationId,
              userId: access.scope.userId,
              role: access.scope.role,
              cap: structuredClone(access.scope.cap),
              ...(access.scope.delegated === undefined
                ? {}
                : { delegated: access.scope.delegated }),
            },
            principal: {
              id: access.principal.id,
              ...(access.principal.authentication === undefined
                ? {}
                : { authentication: structuredClone(access.principal.authentication) }),
            },
          },
  };
}

export type ResourceUseRefusal = 'not_found' | 'forbidden' | 'conflict' | 'invalid_body';
export type ResourceUseDenial =
  | { readonly ok: false; readonly reason: 'forbidden'; readonly permission?: Permission }
  | { readonly ok: false; readonly reason: Exclude<ResourceUseRefusal, 'forbidden'> };
export type ResourceUseAnswer<T> = { ok: true; value: T } | ResourceUseDenial;
export interface ResourceUsePage {
  cursor?: string;
  limit: number;
  workItemId?: string;
  state?: ResourceUseState;
}
/** Durable reported uses, outside plan undo and capacity. Each write rechecks access and commits projection and history together. */
export interface ResourceUses {
  register(
    projectId: string,
    actor: ResourceUseActor,
    draft: ResourceUseRegistration,
    at: number,
  ): Promise<ResourceUseAnswer<ResourceUse>>;
  append(
    projectId: string,
    useId: string,
    actor: ResourceUseActor,
    draft: ResourceUseEventDraft,
    at: number,
  ): Promise<ResourceUseAnswer<ResourceUse>>;
  list(
    projectId: string,
    actor: ResourceUseActor,
    page: ResourceUsePage,
  ): Promise<ResourceUseAnswer<{ uses: ResourceUse[]; nextCursor: string | null }>>;
  history(
    projectId: string,
    useId: string,
    actor: ResourceUseActor,
    page: ResourceUsePage,
  ): Promise<ResourceUseAnswer<{ events: ResourceUseEvent[]; nextCursor: string | null }>>;
}
