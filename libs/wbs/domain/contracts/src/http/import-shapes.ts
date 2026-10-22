import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { planDocumentRequest } from './plan-document-shapes';
import { responseSchema } from './schema-shape';
import { stepBlockageInactiveRefusal } from './step-blockage-refusal';

const createdNames = type({
  teams: 'string[]',
  people: 'string[]',
  tags: 'string[]',
  services: 'string[]',
  types: 'string[]',
  externalSystems: 'string[]',
});

export const importSummary = responseSchema(
  type({
    projectId: 'string',
    rows: 'number.integer >= 0',
    created: createdNames,
    solutionRef: "'kept' | 'left-off' | 'none'",
  }),
);

const malformedImport = responseSchema(
  type({
    error:
      "'invalid_body' | 'invalid_typed_dependency' | 'unsupported_version' | 'unknown_ref' | 'cycle' | 'ancestor' | 'deadline_before_project_start' | 'work_item_takes_one_type'",
    path: 'string',
    detail: 'string | null',
  }),
);

/** Restores one archival plan as a new caller-owned project. */
export const importProject = defineEndpointShape({
  method: 'POST',
  path: '/api/projects/import',
  operationId: 'postApiProjectsImport',
  // Proof: removing write scope made the mounted valid reader import return 201;
  // moving policy admission after parsing made its malformed request return 400 invalid_body.
  policies: [
    { kind: 'organization-resource', operation: 'mutation' },
    { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
    { kind: 'identity', require: 'write-scope' },
  ],
  body: planDocumentRequest,
  bodyMedia: ['application/json'],
  responses: [{ kind: 'json', status: 201, schema: importSummary }],
  refusals: [
    stepBlockageInactiveRefusal,
    { kind: 'import-refusal', status: 400, schema: malformedImport },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    {
      status: 403,
      schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
    },
    organizationRefusal,
    organizationContextRefusal,
    // A viewer, after organization activation: reading is not importing.
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
    {
      kind: 'import-refusal',
      status: 409,
      schema: responseSchema(
        type({
          error:
            "'engine_unavailable' | 'source_refused' | 'abbreviation_taken' | 'abbreviation_exhausted'",
          path: 'string',
          detail: 'string | null',
        }),
      ),
    },
    {
      status: 409,
      schema: responseSchema(
        type({ error: "'external_dependencies_inactive'", detail: 'string | null' }),
      ),
    },
  ],
  document: {
    summary: 'Import an archival plan as a new project.',
    description:
      'Reads plan document versions 1 to 9. Version 9 requires direct stepBlockages facts; earlier versions refuse nonempty blockage facts and normalize empty collections. Versions 1 to 5 import every work item with ' +
      'readiness and hold null. From version 6 every work item must carry both `readiness` ' +
      '(`draft`, `ready` or null) and `hold` (`on_hold`, `blocked` or null); a missing field, ' +
      'a value outside either vocabulary, or either one on a parent is refused `invalid_body` ' +
      'at that field. A hold on done work is accepted.',
  },
});
