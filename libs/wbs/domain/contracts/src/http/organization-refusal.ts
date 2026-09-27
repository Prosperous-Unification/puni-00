import { type } from 'arktype';

import { responseSchema } from './schema-shape';

/**
 * An authenticated caller with no organization authority: no bound active
 * organization, or no current membership in it. Answered before any lookup, so
 * it reveals nothing about the addressed resource.
 */
export const organizationRefusal = {
  status: 403,
  schema: responseSchema(type({ error: "'no_active_organization' | 'not_a_member'" })),
} as const;
