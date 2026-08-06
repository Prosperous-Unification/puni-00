import {
  InternalForwardRequest,
  InternalResumeRequest,
  type InternalResumeResponse,
} from '@wbs/contracts';
import { parseOrThrow, ValidationError } from '@wbs/validation';
import { Elysia } from 'elysia';

import { requireInternalAuth } from '../middleware/internal-auth';

export interface InternalCallContext {
  clientId: string | null;
  connectionId: string | null;
  traceId: string;
}

export interface InternalDeps {
  secret: string;
  onForward: (
    message: unknown,
    ctx: InternalCallContext,
  ) => Promise<{ push_responses?: unknown[] }>;
  onResume: (
    resumePoints: Record<string, number>,
    ctx: InternalCallContext,
  ) => Promise<InternalResumeResponse>;
}

export function internalController(deps: InternalDeps) {
  return new Elysia({ prefix: '/internal' })
    .post('/forward', async ({ body, request, set }) => {
      const deny = requireInternalAuth(request, deps.secret);
      if (deny) return deny;
      try {
        const req = parseOrThrow(InternalForwardRequest, body);
        const res = await deps.onForward(req.message, {
          clientId: request.headers.get('x-client-id'),
          connectionId: request.headers.get('x-connection-id'),
          traceId: req.trace_id,
        });
        return { ack: true as const, push_responses: res.push_responses };
      } catch (err) {
        if (err instanceof ValidationError) {
          set.status = 400;
          return { error: err.message };
        }
        throw err;
      }
    })
    .post('/resume', async ({ body, request, set }) => {
      const deny = requireInternalAuth(request, deps.secret);
      if (deny) return deny;
      try {
        const req = parseOrThrow(InternalResumeRequest, body);
        return await deps.onResume(req.resume_points, {
          clientId: request.headers.get('x-client-id'),
          connectionId: request.headers.get('x-connection-id'),
          traceId: req.trace_id,
        });
      } catch (err) {
        if (err instanceof ValidationError) {
          set.status = 400;
          return { error: err.message };
        }
        throw err;
      }
    });
}
