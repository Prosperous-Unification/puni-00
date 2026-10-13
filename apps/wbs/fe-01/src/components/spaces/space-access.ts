import { type CredentialRefusal } from '@/components/organization/organization-access';
import { unreachable } from '@/lib/http';

/** Every refusal word a space route answers, as `@wbs/contracts` declares them. */
export type SpaceRefusalCode =
  | 'unauthenticated'
  | 'no_active_organization'
  | 'not_a_member'
  | 'organization_required'
  | 'forbidden'
  | 'not_found'
  | 'name_taken'
  | 'already_in_space'
  | 'virtual_space'
  | 'malformed'
  | 'insufficient_scope'
  | 'invalid_origin'
  | 'invalid_query'
  | 'invalid_body'
  | 'invalid_json'
  | 'invalid_params';

/** A space route's refusal body: a code alone, or a refused credential's whole body. */
export type SpaceRefusal = { error: SpaceRefusalCode } | CredentialRefusal;

/**
 * What a spaces page does with one refusal: replace the page with a state
 * (the page can show nothing of this organization) — a sentence, or a refused
 * credential's sign-in state — or say a sentence in place and keep what it shows.
 */
export type SpaceRefusalOutcome =
  | { kind: 'page'; text: string; detail: string }
  | { kind: 'credential'; refusal: CredentialRefusal }
  | { kind: 'message'; text: string };

/** The copy and the reach of each space refusal. */
export function spaceRefusal(refusal: SpaceRefusal): SpaceRefusalOutcome {
  switch (refusal.error) {
    case 'unauthenticated':
      return {
        kind: 'page',
        text: 'Your session ended. Sign in again.',
        detail: 'Opening the plan asks you to sign in.',
      };
    case 'no_active_organization':
      return {
        kind: 'page',
        text: 'This session has no organization.',
        detail:
          'Spaces group an organization’s projects. This workspace has no organization, so every project is in All projects.',
      };
    case 'not_a_member':
      return {
        kind: 'page',
        text: 'You no longer have access to this organization.',
        detail: 'An administrator of the organization can invite you again.',
      };
    // Proof: 2026-10-12, answering the headline as page text failed `gives the
    // page up to the company sign-in when enforced SSO refuses it` and `gives
    // the space up to a fresh sign-in when the session policy refuses it`.
    case 'sso_required':
    case 'reauthentication_required':
      return { kind: 'credential', refusal };
    case 'organization_required':
      return {
        kind: 'page',
        text: 'Spaces need an organization.',
        // F-014 (UI review 2026-10-13): this said "Until this deployment has
        // one", which is an operator's word for what a reader sees as the app.
        detail:
          'Spaces group an organization’s projects. This workspace has no organization, so every project is in All projects.',
      };
    case 'not_found':
      return { kind: 'message', text: 'That space or project no longer exists.' };
    case 'forbidden':
      return { kind: 'message', text: 'Your role can read spaces but not change them.' };
    case 'name_taken':
      return { kind: 'message', text: 'Another space already has that name.' };
    case 'already_in_space':
      return { kind: 'message', text: 'That project is already in this space.' };
    case 'virtual_space':
      return { kind: 'message', text: 'All projects cannot be changed.' };
    case 'malformed':
      return { kind: 'message', text: 'A space name needs 1 to 120 characters.' };
    case 'insufficient_scope':
      return {
        kind: 'message',
        text: 'This sign-in is read-only here. Sign in to WBS again to make changes.',
      };
    case 'invalid_origin':
    case 'invalid_query':
    case 'invalid_body':
    case 'invalid_json':
    case 'invalid_params':
      return {
        kind: 'message',
        text: 'The request could not be understood. Reload and try again.',
      };
    default:
      return unreachable(refusal);
  }
}

/** What a page shows once a refusal ends or interrupts its read. */
export type RefusedView =
  | { kind: 'refused'; message: string; detail: string }
  | { kind: 'credential'; refusal: CredentialRefusal }
  | { kind: 'failure'; message: string };

/** The view a refusal leaves: the page given up, or a sentence where the content would be. */
export function refusedView(outcome: SpaceRefusalOutcome): RefusedView {
  switch (outcome.kind) {
    case 'page':
      return { kind: 'refused', message: outcome.text, detail: outcome.detail };
    case 'credential':
      return { kind: 'credential', refusal: outcome.refusal };
    case 'message':
      return { kind: 'failure', message: outcome.text };
    default:
      return unreachable(outcome);
  }
}
