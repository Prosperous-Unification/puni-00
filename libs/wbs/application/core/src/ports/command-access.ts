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
 *
 * @throws when trusted activation, binding, membership or policy state cannot be read or validated.
 */
export interface CommandAccess {
  resolve(caller: CommandCaller): Promise<OrganizationAccessResolution>;
}
