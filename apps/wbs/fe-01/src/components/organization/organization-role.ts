import { type ClientReply, readActiveOrganization } from '@wbs/contracts';
import { useCallback, useEffect, useState } from 'react';

import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient, useResourceScope } from '@/runtime/organization-resources';

import { type AccessLoss, lostAccess, READ_ONLY, RELOAD } from './organization-access';

const ROLE_SHAPES = [readActiveOrganization] as const;

/** A membership role as `GET /api/organization/active` answers it. */
export type OrganizationRole = Extract<
  ClientReply<typeof readActiveOrganization>,
  { kind: 'success' }
>['body']['role'];

/**
 * Whose machine credentials a role reaches (`wbs-machine-credentials` A7):
 * every agent's for an admin or super-admin, a member's own agents' only, and
 * none for a viewer. A drawing hint only: be-01 decides every read and write.
 */
export type CredentialReach = 'all' | 'own' | 'none';

/** The reach of `role`; see {@link CredentialReach}. */
export function credentialReach(role: OrganizationRole): CredentialReach {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return 'all';
    case 'member':
      return 'own';
    case 'viewer':
      return 'none';
    default:
      return unreachable(role);
  }
}

/**
 * What a project's Resources section offers a role (`wbs-resources` R8a, 1.7),
 * as be-01 permits it: `admin` (admin, super-admin) every write and Remove;
 * `writer` (member) capacity, Add and Edit but no Remove; `reader` (viewer)
 * nothing to change. A drawing hint only: be-01 decides, and on a restricted
 * project it refuses capacity to everyone but the creator and a super-admin,
 * which this hint does not read.
 */
export type ResourceStanding = 'admin' | 'writer' | 'reader';

/**
 * The standing of `role`; see {@link ResourceStanding}.
 *
 * Proof: 2026-10-25, member as admin failed `offers a member every write but
 * Remove…` and 4 more in `resources-panel.test.tsx`; viewer as writer failed
 * `offers a viewer nothing to change…` and 2 more.
 */
export function resourceStanding(role: OrganizationRole): ResourceStanding {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return 'admin';
    case 'member':
      return 'writer';
    case 'viewer':
      return 'reader';
    default:
      return unreachable(role);
  }
}

/**
 * One `GET /api/organization/active` reply, read against the organization
 * the runtime captured: the `role`; access `lost` (a refusal that ends the
 * organization's access, or a reply naming another organization, which is a
 * context change); a `failure` to say, `isTransport` when retrying can help;
 * or `cancelled`, which draws nothing.
 */
export type RoleReading =
  | { readonly kind: 'role'; readonly role: OrganizationRole }
  | { readonly kind: 'lost'; readonly loss: AccessLoss }
  | { readonly kind: 'failure'; readonly message: string; readonly isTransport: boolean }
  | { readonly kind: 'cancelled' };

/**
 * Reads one role reply; see {@link RoleReading}. Shared by every surface that
 * draws by the caller's role, so one reply is never drawn two ways.
 *
 * @throws Through {@link unreachable} on a reply or refusal the contract does not have.
 */
export function readRoleReply(
  reply: ClientReply<typeof readActiveOrganization>,
  captured: string,
): RoleReading {
  switch (reply.kind) {
    case 'success':
      // Proof: 2026-10-22, drawing the role without this comparison failed
      // `gives the page up when the active organization is another one`:
      // the credentials panel rendered for org-b's admin role.
      // Watched again 2026-10-25 with `says the organization changed when the
      // role read names another one` in `resources-panel.test.tsx`.
      return reply.body.organizationId === captured
        ? { kind: 'role', role: reply.body.role }
        : { kind: 'lost', loss: 'no_organization' };
    case 'failure':
      return reply.failure.code === 'cancelled'
        ? { kind: 'cancelled' }
        : { kind: 'failure', message: failureMessage(reply.failure), isTransport: true };
    case 'refusal': {
      const refusal = reply.body;
      switch (refusal.error) {
        case 'onboarding_inactive':
        case 'unauthenticated':
        case 'organization_context_changed':
        case 'no_active_organization':
        case 'not_a_member':
          return lostOf(lostAccess(refusal.error));
        case 'sso_required':
        case 'reauthentication_required':
          return lostOf(lostAccess(refusal));
        case 'insufficient_scope':
          return { kind: 'failure', message: READ_ONLY, isTransport: false };
        case 'invalid_query':
        case 'invalid_body':
          return { kind: 'failure', message: RELOAD, isTransport: false };
        default:
          return unreachable(refusal);
      }
    }
    default:
      return unreachable(reply);
  }
}

/** A shared access outcome that can only be a loss here. */
function lostOf(outcome: ReturnType<typeof lostAccess>): RoleReading {
  if (outcome.kind !== 'lost') throw new Error('Unexpected access outcome');
  return { kind: 'lost', loss: outcome.loss };
}

/** The signed-in account as a credentials surface draws for it. */
export interface CredentialViewer {
  readonly userId: string;
  readonly reach: Exclude<CredentialReach, 'none'>;
}

/**
 * The caller's role in the captured organization, read for drawing:
 * `legacy` when the runtime has no organization (no request is sent), else
 * loading, a rendered failure with `retry`, or the role.
 */
export type RoleView =
  | { readonly kind: 'legacy' | 'loading' | 'withdrawn' }
  | { readonly kind: 'failure'; readonly message: string; readonly retry: () => void }
  | { readonly kind: 'ready'; readonly role: OrganizationRole };

/**
 * Reads the caller's role in the runtime's organization once per mount from
 * `GET /api/organization/active`. A reply naming another organization than
 * the one the runtime captured is a context change, so the page is given up
 * as `no_organization` rather than drawn for the wrong role.
 */
export function useOrganizationRole(onAccessLost: (loss: AccessLoss) => void): RoleView {
  const scope = useResourceScope();
  const client = useResourceClient(ROLE_SHAPES);
  const captured = scope.organization.kind === 'active' ? scope.organization.organizationId : null;
  const [view, setView] = useState<RoleView>(
    captured === null ? { kind: 'legacy' } : { kind: 'loading' },
  );
  const [fault, setFault] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lose = useCallback(
    (loss: AccessLoss) => {
      setView({ kind: 'withdrawn' });
      onAccessLost(loss);
    },
    [onAccessLost],
  );
  useEffect(() => {
    if (captured === null) return;
    let isLive = true;
    setView({ kind: 'loading' });
    const retry = () => {
      setAttempt((count) => count + 1);
    };
    void client
      .getApiOrganizationActive({})
      .then((reply) => {
        if (!isLive) return;
        const reading = readRoleReply(reply, captured);
        switch (reading.kind) {
          case 'role':
            setView({ kind: 'ready', role: reading.role });
            return;
          case 'lost':
            lose(reading.loss);
            return;
          case 'failure':
            setView({ kind: 'failure', message: reading.message, retry });
            return;
          case 'cancelled':
            return;
          default:
            return unreachable(reading);
        }
      })
      .catch((cause: unknown) => {
        if (isLive) setFault(new Error('Unexpected organization role read failure', { cause }));
      });
    return () => {
      isLive = false;
    };
  }, [client, captured, attempt, lose]);
  if (fault !== null) throw fault;
  return view;
}
