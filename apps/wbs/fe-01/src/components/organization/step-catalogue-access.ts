import type {
  bindCatalogueStep,
  ClientReply,
  patchStepDefinition,
  retireStepDefinition,
} from '@wbs/contracts';

import { unreachable } from '@/lib/http';

import { lostAccess, READ_ONLY, type RefusalOutcome, RELOAD, said } from './organization-access';

/** Expected write failures remain rendered; lost credentials withdraw every organization panel. */
export function resolveStepWriteRefusal(
  refusal: Extract<
    ClientReply<
      typeof bindCatalogueStep | typeof patchStepDefinition | typeof retireStepDefinition
    >,
    { kind: 'refusal' }
  >['body'],
): RefusalOutcome {
  switch (refusal.error) {
    case 'unauthenticated':
    case 'organization_context_changed':
    case 'no_active_organization':
    // Proof: omitting the relocated membership arm again failed the actual definition write owner: no removed callback, then render fault. Grouped codes fall through.
    case 'not_a_member':
      return lostAccess(refusal.error);
    case 'sso_required':
    case 'reauthentication_required':
      return lostAccess(refusal);
    case 'forbidden':
      return said('You do not have permission to manage steps at this scope.');
    case 'insufficient_scope':
      return said(READ_ONLY);
    case 'not_found':
      return said('This step or its scope is no longer available. Refresh steps.');
    case 'name_required':
      return said('Enter a step name.');
    case 'invalid_code':
      return said(
        'Use a lowercase step code beginning with a letter, followed by letters, numbers or hyphens, up to 32 characters.',
      );
    case 'reserved_code':
      return said('This step code is reserved. Choose another code.');
    case 'code_taken':
      return said('This code is already reserved, including by retired steps.');
    case 'name_taken':
      return said('This name is already reserved, including by retired steps.');
    case 'duplicate_binding':
      return said('This step is already bound here. Refresh steps.');
    case 'step_bound':
      return said('This step is still bound. Remove its bindings before retiring it.');
    case 'invalid_query':
    case 'invalid_params':
    case 'invalid_json':
    case 'invalid_body':
    case 'invalid_origin':
      return said(RELOAD);
    default:
      return unreachable(refusal);
  }
}
