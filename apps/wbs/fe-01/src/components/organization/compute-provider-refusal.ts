import {
  type ClientReply,
  type listComputeProviders,
  type registerComputeProvider,
  type removeComputeProvider,
  type updateComputeProvider,
} from '@wbs/contracts';

import { inUseSentence } from '@/lib/compute-provider-words';
import { unreachable } from '@/lib/http';

import { lostAccess, READ_ONLY, type RefusalOutcome, RELOAD, said } from './organization-access';

/** Every refusal the four compute provider routes model (`compute-providers` P2). */
export type ComputeProviderRefusal = Extract<
  ClientReply<
    | typeof listComputeProviders
    | typeof registerComputeProvider
    | typeof updateComputeProvider
    | typeof removeComputeProvider
  >,
  { kind: 'refusal' }
>['body'];

/** The act a compute provider refusal answers. */
export type ComputeProviderOperation = 'read' | 'register' | 'update' | 'remove';

/**
 * What a compute provider refusal says, or the page-level loss it is.
 * `provider` names the instance a write was about, for `in_use`; a removal
 * the panel confirms with cascade is drawn by the panel before this is read.
 *
 * Proof: 2026-10-23, answering `name_taken` with the `unknown_provider` copy
 * failed `renders name_taken on register and keeps the draft, never as success` in
 * `compute-providers-panel.test.tsx`.
 */
export function computeProviderRefusal(
  refusal: ComputeProviderRefusal,
  operation: ComputeProviderOperation,
  provider: string,
): RefusalOutcome {
  switch (refusal.error) {
    case 'unauthenticated':
    case 'organization_context_changed':
    case 'no_active_organization':
    case 'not_a_member':
      return lostAccess(refusal.error);
    case 'sso_required':
    case 'reauthentication_required':
      return lostAccess(refusal);
    case 'forbidden':
      return said(
        operation === 'read'
          ? 'Your role cannot view compute providers.'
          : 'Only an admin can manage compute providers. Nothing was changed.',
      );
    case 'insufficient_scope':
      return said(READ_ONLY);
    case 'invalid_body':
      switch (operation) {
        case 'register':
        case 'update':
          return said(
            'Choose a plain name of at most 80 characters and a locator of at most 256, neither looking like a key or token.',
          );
        case 'read':
        case 'remove':
          return said(RELOAD);
        default:
          return unreachable(operation);
      }
    case 'invalid_json':
    case 'invalid_params':
    case 'invalid_query':
    case 'invalid_origin':
      return said(RELOAD);
    case 'name_taken':
      return said('Another compute provider here already has this name. Choose another name.');
    case 'unknown_provider':
      return said('This compute provider is no longer registered. Refresh the list.');
    case 'in_use':
      return said(inUseSentence(provider, refusal.resources));
    default:
      return unreachable(refusal);
  }
}
