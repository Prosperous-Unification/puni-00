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

/**
 * What a spaces page does with one refusal: replace the page with a state
 * (the page can show nothing of this organization), or say a sentence in
 * place and keep what it shows.
 */
export type SpaceRefusalOutcome =
  { kind: 'page'; text: string } | { kind: 'message'; text: string };

/** The copy and the reach of each space refusal. */
export function spaceRefusal(code: SpaceRefusalCode): SpaceRefusalOutcome {
  switch (code) {
    case 'unauthenticated':
      return { kind: 'page', text: 'Your session ended. Sign in again.' };
    case 'no_active_organization':
      return { kind: 'page', text: 'No organization is selected for this session.' };
    case 'not_a_member':
      return { kind: 'page', text: 'You no longer have access to this organization.' };
    case 'organization_required':
      return {
        kind: 'page',
        text: 'Spaces need an organization. Until this deployment has one, only All projects is available.',
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
      return unreachable(code);
  }
}
