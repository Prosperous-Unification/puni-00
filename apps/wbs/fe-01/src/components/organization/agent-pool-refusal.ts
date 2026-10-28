import {
  type ClientReply,
  type createAgentPool,
  type listAgentPools,
  type readOrganizationLimits,
  type rekeyAgentPool,
  type revokeAgentPool,
} from '@wbs/contracts';

import { unreachable } from '@/lib/http';

import { lostAccess, READ_ONLY, type RefusalOutcome, RELOAD, said } from './organization-access';

/**
 * Every refusal the agent pools panel reads: the four pool routes
 * (`wbs-mcp-agent-surface` M7) and the limits read its counts come from.
 */
export type AgentPoolRefusal = Extract<
  ClientReply<
    | typeof listAgentPools
    | typeof readOrganizationLimits
    | typeof createAgentPool
    | typeof rekeyAgentPool
    | typeof revokeAgentPool
  >,
  { kind: 'refusal' }
>['body'];

/** The act an agent pool refusal answers; `read` covers both the pool list and the limits. */
export type AgentPoolOperation = 'read' | 'create' | 'rekey' | 'revoke';

/** How many agent persons fit under `cap` beside `current`; none when already over. */
export function agentHeadroom(cap: number, current: number): number {
  return Math.max(0, cap - current);
}

/**
 * What an agent pool refusal says, or the page-level loss it is. The panel
 * draws `pool_expired` and `persons_not_removed` as states of their own before
 * this is read; their sentences here are what those states say.
 *
 * Proof: 2026-10-28, answering `name_taken` with the `not_found` copy failed
 * `renders name_taken on create and keeps the draft, never as success` in
 * `agent-pools-panel.test.tsx`.
 */
export function agentPoolRefusal(
  refusal: AgentPoolRefusal,
  operation: AgentPoolOperation,
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
          ? 'Your role cannot view agent pools.'
          : 'Only an admin can manage agent pools. Nothing was changed.',
      );
    case 'insufficient_scope':
      return said(READ_ONLY);
    case 'invalid_body':
      switch (operation) {
        case 'create':
          return said(
            'Choose a plain name of at most 60 characters that does not look like a key, from 1 to 100 agents, and an expiry up to 90 days ahead. Nothing was created.',
          );
        case 'rekey':
          return said('Choose an expiry up to 90 days ahead. No key was replaced.');
        case 'read':
        case 'revoke':
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
      return said(
        'A live pool, a person or a credential here already has this name. Choose another name.',
      );
    case 'agent_person_limit': {
      const room = agentHeadroom(refusal.cap, refusal.current);
      return said(
        `This pool needs ${String(refusal.added)} agent persons, and the organization holds ${String(refusal.current)} of its ${String(refusal.cap)}. ${room === 0 ? 'No agent person fits' : `At most ${String(room)} fit`}; remove agent persons or ask an operator to raise the limit. Nothing was created.`,
      );
    }
    case 'not_found':
      return said('This pool is revoked or no longer exists. Refresh the list.');
    case 'pool_changed':
      return said(
        'An agent of this pool was removed while its keys were being issued. No key was replaced; refresh and re-key again.',
      );
    case 'pool_expired':
      return said('This pool has expired. Choose a new expiry to re-key it.');
    case 'persons_not_removed':
      return said(
        `Its ${String(refusal.revokedCredentials)} live ${refusal.revokedCredentials === 1 ? 'key no longer works' : 'keys no longer work'}, but removing its agent persons was refused, so they stay and still count toward the agent-person limit. Remove them from the Directory to release it.`,
      );
    default:
      return unreachable(refusal);
  }
}
