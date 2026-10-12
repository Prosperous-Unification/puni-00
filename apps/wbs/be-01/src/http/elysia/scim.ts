import {
  SCIM_ERROR_SCHEMA,
  SCIM_MEDIA,
  SCIM_MOST_BODY_BYTES,
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
 * Reads at most `limit` bytes of `request`'s body as text, or null once a
 * declared length or the bytes actually sent exceed it; it stops reading
 * there, so an oversized body is never buffered whole.
 */
export async function readBoundedText(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > limit) return null;
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Mounts `/scim/v2/*` beside the typed endpoint table. SCIM is a foreign
 * wire protocol (RFC 7644): its own media type, error envelope and bearer
 * credential, none of which the shared endpoint shapes model, so it is
 * neither in the OpenAPI document nor an MCP tool. The body is read, bounded,
 * only when {@link ScimService} asks for it after authentication and
 * admission; an unexpected failure is reported once and
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
          // Proof: reading the body here, before authentication, made mounted
          // `reads no body before the bearer token authenticates` see the
          // unauthenticated request's body consumed; watched 2026-10-12.
          readBody: () => readBoundedText(request, SCIM_MOST_BODY_BYTES),
        });
      } catch (error) {
        // The adapter's error boundary, as `mountEndpoints` has for the
        // typed table: report, then answer without detail.
        // Proof: rethrowing instead made mounted `rolls a deprovision back and
        // answers 500 when its audit row cannot be written` receive
        // Elysia's plain-text error, the failed SQL itself, instead of the
        // SCIM error; watched 2026-10-12.
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
