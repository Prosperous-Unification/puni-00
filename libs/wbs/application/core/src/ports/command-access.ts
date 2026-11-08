import type { AuthenticatedUser } from '@wbs/contracts';

import type { OrganizationAccessResolution, ResourceAccess } from './organization-access';

/** Request evidence retained until the writer admits its transaction. */
export type CommandCaller =
  | {
      readonly kind: 'human';
      readonly principal: AuthenticatedUser;
      readonly expectedAccess: ResourceAccess;
    }
  | { readonly kind: 'legacy'; readonly actorId: string };

/**
 * Revalidates current authority on the process writer inside its admitted turn.
 * Expected access pins kind, organization and identity; its old role grants nothing.
 * Legacy callers are admitted only before durable organization activation.
 * Machine/consent credential rows and person bindings are reread before any write graph:
 * changed credential evidence refuses as `organization_context_changed` (the retained
 * operation's 409 context conflict, separate from initial authentication's 401).
 * Row freshness does not establish verifier/delegation or rotated-secret expiry.
 *
 * @throws when trusted activation, binding, membership, credential or policy state cannot be read or validated.
 */
export interface CommandAccess {
  resolve(caller: CommandCaller): Promise<OrganizationAccessResolution>;
}
