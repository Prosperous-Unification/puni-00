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
        switch (reply.kind) {
          case 'success':
            // Proof: 2026-10-22, drawing the role without this comparison failed
            // `gives the page up when the active organization is another one`:
            // the credentials panel rendered for org-b's admin role.
            if (reply.body.organizationId !== captured) {
              lose('no_organization');
              return;
            }
            setView({ kind: 'ready', role: reply.body.role });
            return;
          case 'failure':
            if (reply.failure.code !== 'cancelled')
              setView({ kind: 'failure', message: failureMessage(reply.failure), retry });
            return;
          case 'refusal': {
            const refusal = reply.body;
            switch (refusal.error) {
              case 'onboarding_inactive':
              case 'unauthenticated':
              case 'organization_context_changed':
              case 'no_active_organization':
              case 'not_a_member': {
                const outcome = lostAccess(refusal.error);
                if (outcome.kind !== 'lost') throw new Error('Unexpected access outcome');
                lose(outcome.loss);
                return;
              }
              case 'sso_required':
              case 'reauthentication_required': {
                const outcome = lostAccess(refusal);
                if (outcome.kind !== 'lost') throw new Error('Unexpected credential outcome');
                lose(outcome.loss);
                return;
              }
              case 'insufficient_scope':
                setView({ kind: 'failure', message: READ_ONLY, retry });
                return;
              case 'invalid_query':
              case 'invalid_body':
                setView({ kind: 'failure', message: RELOAD, retry });
                return;
              default:
                return unreachable(refusal);
            }
          }
          default:
            return unreachable(reply);
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
