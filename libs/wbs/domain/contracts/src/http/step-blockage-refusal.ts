import { type } from 'arktype';

import { responseSchema } from './schema-shape';

/** Durable writer admission is disabled; the owning transaction has rolled back. */
// Proof: inactive discriminator replaced; all five production endpoint schema/OpenAPI negatives found no accepting 409 (2026-10-14).
export const stepBlockageInactiveRefusal = {
  status: 409,
  schema: responseSchema(type({ error: "'step_blockage_inactive'" })),
} as const;
