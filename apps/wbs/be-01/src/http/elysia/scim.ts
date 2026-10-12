import {
  SCIM_ERROR_SCHEMA,
  SCIM_MEDIA,
  type ScimReply,
  type ScimService,
} from '@wbs/core/service/scim.feature';
import { Elysia } from 'elysia';

import type { UnexpectedFailureReporter } from './unexpected-failure';

/** A store failure, an unwritable audit row among them: nothing was reported as done. */
const FAILED: ScimReply = {
  status: 500,
  headers: [['content-type', SCIM_MEDIA]],
  body: JSON.stringify({ schemas: [SCIM_ERROR_SCHEMA], status: '500', detail: 'internal_error' }),
};

/**
 * Mounts `/scim/v2/*` beside the typed endpoint table. SCIM is a foreign
 * wire protocol (RFC 7644): its own media type, error envelope and bearer
 * credential, none of which the shared endpoint shapes model, so it is
 * neither in the OpenAPI document nor an MCP tool. The body is read raw and
 * judged by {@link ScimService}; an unexpected failure is reported once and
 * answered as a SCIM `500` that names nothing.
 */
export function scimEndpoints(
  scim: ScimService,
  reportUnexpectedFailure: UnexpectedFailureReporter,
) {
  return new Elysia().all(
    '/scim/v2/*',
    async ({ request }) => {
      let reply: ScimReply;
      try {
        reply = await scim.answer({
          method: request.method,
          url: new URL(request.url),
          authorization: request.headers.get('authorization'),
          contentType: request.headers.get('content-type'),
          body: await request.text(),
        });
      } catch (error) {
        // The adapter's error boundary, as `mountEndpoints` has for the
        // typed table: report, then answer without detail.
        reportUnexpectedFailure(error);
        reply = FAILED;
      }
      return new Response(reply.body, {
        status: reply.status,
        headers: reply.headers.map(([name, value]): [string, string] => [name, value]),
      });
    },
    { parse: 'none' },
  );
}
