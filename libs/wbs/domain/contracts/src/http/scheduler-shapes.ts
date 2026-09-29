import { type } from 'arktype';

import { responseSchema } from './schema-shape';

/**
 * A live schedule read cannot use the engine selected by the stored project,
 * or, under shared people, the engine of a project ranked above it, which
 * `projectId` then names.
 */
export const engineUnavailableRefusal = {
  status: 409,
  schema: responseSchema(
    type({ error: "'engine_unavailable'", engine: "'optimized'", 'projectId?': 'string' }),
  ),
} as const;
