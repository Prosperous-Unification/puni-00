import { type ClientReply, type listMembers } from '@wbs/contracts';

import { unreachable } from '@/lib/http';

/**
 * A credential the active organization's rules refuse, as the shared
 * organization refusal carries it: enforced SSO (`sso_required`) or its
 * session policy (`reauthentication_required`). The body is kept whole,
 * because its `login` path is the only sign-in route the page may offer.
 */
export type CredentialRefusal = Extract<
  Extract<ClientReply<typeof listMembers>, { kind: 'refusal' }>['body'],
  { error: 'sso_required' | 'reauthentication_required' }
>;

/**
 * Why the organization page can no longer show any organization data. Each
 * one replaces the whole page, so no panel keeps rows it read before the loss.
 * A credential refusal carries its body to the state that renders it.
 */
export type AccessLoss =
  'inactive' | 'signed_out' | 'no_organization' | 'removed' | CredentialRefusal;

/** The refusal codes every organization route shares that end the page's access. */
export type LossCode =
  'onboarding_inactive' | 'unauthenticated' | 'no_active_organization' | 'not_a_member';

/** What a panel does with one refusal: give the page up, or say a sentence in place. */
export type RefusalOutcome = { kind: 'lost'; loss: AccessLoss } | { kind: 'message'; text: string };

/** The page-level state a shared refusal code, or a refused credential's body, stands for. */
export function lostAccess(refusal: LossCode | CredentialRefusal): RefusalOutcome {
  if (typeof refusal !== 'string') return { kind: 'lost', loss: refusal };
  switch (refusal) {
    case 'onboarding_inactive':
      return { kind: 'lost', loss: 'inactive' };
    case 'unauthenticated':
      return { kind: 'lost', loss: 'signed_out' };
    case 'no_active_organization':
      return { kind: 'lost', loss: 'no_organization' };
    case 'not_a_member':
      return { kind: 'lost', loss: 'removed' };
    default:
      return unreachable(refusal);
  }
}

/** A panel's in-place sentence. */
export function said(text: string): RefusalOutcome {
  return { kind: 'message', text };
}

/** The copy for each page-level loss a sentence says; a credential refusal has its own state. */
export function lossCopy(loss: Exclude<AccessLoss, CredentialRefusal>): string {
  switch (loss) {
    case 'inactive':
      return 'Organization administration is not active yet.';
    case 'signed_out':
      return 'Your session ended. Sign in again.';
    case 'no_organization':
      return 'No organization is selected for this session.';
    case 'removed':
      return 'You no longer have access to this organization.';
    default:
      return unreachable(loss);
  }
}

export const RELOAD = 'The request could not be understood. Reload and try again.';
export const READ_ONLY = 'This sign-in is read-only here. Sign in to WBS again to make changes.';
