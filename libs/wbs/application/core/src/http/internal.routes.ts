import {
  type AuthenticatedUser,
  forwardInternal,
  gatewayBrowserProjectAccess,
  gatewayProjectAccess,
  type InternalResumeResponse,
  resumeInternal,
} from '@wbs/contracts';

import type { ProjectService } from '../module/project/project.resource';
import { replayReadable } from '../module/realtime/realtime.feature';
import type { OrganizationAccess } from '../ports/organization-access';
import { projectIdOfSubscription } from '../ports/project-event';
import { EMPTY } from './endpoint';
import { bind, type RequestMetadata } from './endpoint';
import { organizationRefusal } from './organization-refusal';

export interface InternalCallContext {
  clientId: string | null;
  connectionId: string | null;
  traceId: string;
}

export interface InternalDeps {
  onForward: (
    message: unknown,
    ctx: InternalCallContext,
  ) => Promise<{ push_responses?: unknown[] }>;
  onResume: (
    resumePoints: Record<string, number>,
    ctx: InternalCallContext,
  ) => Promise<InternalResumeResponse>;
  /** Projects and membership, for the resume principal's per-subscription check. */
  projects: ProjectService;
  organizations: OrganizationAccess;
}

/**
 * Binds the gateway's capability surface. Mounted internal identity runs before
 * parsing; callback failures propagate rather than masquerading as invalid input.
 * Proof: catching any callback error, and separately only ValidationError,
 * returned200 instead of500 in the mounted callback-failure case. Removing the
 * resume binding returned404 instead of200 in the recorded-replay integration case.
 */
export function internalRoutes(deps: InternalDeps) {
  return [
    bind(forwardInternal, async ({ body, request }) => {
      const forwarded = await deps.onForward(body.message, contextFrom(request, body.trace_id));
      return {
        ok: true,
        status: 200,
        body: {
          ack: true as const,
          ...(forwarded.push_responses === undefined
            ? {}
            : { push_responses: forwarded.push_responses }),
        },
      };
    }),
    bind(resumeInternal, async ({ body, request, principal }) => {
      const context = contextFrom(request, body.trace_id);
      const readable = await readableProjects(deps.projects, deps.organizations, principal);
      // Proof: admitting every named subscription made `refuses a resume
      // naming a foreign project` and `replays nothing to a removed member`
      // (gateway-browser.controller.db.test.ts) replay them (2026-10-11).
      const outcome = await replayReadable(
        { replay: (points) => deps.onResume(points, context) },
        Object.fromEntries(Object.entries(body.resume_points)),
        async (subscription) => {
          const projectId = projectIdOfSubscription(subscription);
          return projectId !== null && (await readable(projectId));
        },
      );
      return { ok: true, status: 200, body: outcome };
    }),
  ] as const;
}

/**
 * Whether `principal` may read each project now: one membership resolution,
 * then an organization-scoped lookup per project. A refused membership reads
 * nothing; a foreign project is false exactly like an absent one.
 */
async function readableProjects(
  projects: ProjectService,
  organizations: OrganizationAccess,
  principal: AuthenticatedUser,
): Promise<(projectId: string) => Promise<boolean>> {
  const resolved = await organizations.resolve(principal);
  // Proof: reading with legacy access after a refused resolution made
  // `replays nothing to a removed member` (gateway-browser.controller.db.test.ts)
  // replay the project (2026-10-11).
  if (!resolved.ok) return () => Promise.resolve(false);
  return async (projectId) => (await projects.readWithin(projectId, resolved.access)) !== null;
}

/** Checks current membership and an organization-scoped project for one gateway request. */
export function gatewayAccessRoutes(projects: ProjectService, organizations: OrganizationAccess) {
  return [
    // The forwarded-browser variant gw-01 calls today; the delegation variant
    // below is the post-activation path.
    bind(gatewayBrowserProjectAccess, async ({ principal, params }) => {
      const resolved = await organizations.resolve(principal);
      // Proof: bypassing this membership resolution admitted a removed member
      // in `refuses a removed member` (gateway-browser.controller.db.test.ts).
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      // Proof: replacing readWithin with an unscoped lookup answered 204 for a
      // foreign project in `refuses a foreign project as not found`
      // (gateway-browser.controller.db.test.ts).
      const found = await projects.readWithin(params.projectId, resolved.access);
      if (found === null) return { ok: false, status: 404, body: { error: 'not_found' } } as const;
      return { ok: true, status: 204, body: EMPTY } as const;
    }),
    bind(gatewayProjectAccess, async ({ principal, params }) => {
      // Proof: selecting the organization from x-wbs-organization made the
      // mounted foreign-project test answer 204 instead of 404 (2026-09-28).
      const resolved = await organizations.resolve(principal);
      // Proof: bypassing this membership resolution admitted a removed member in
      // the mounted gateway access test (2026-09-28).
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      // Proof: replacing readWithin with an unscoped lookup answered 204 for a
      // foreign project in the mounted gateway access test (2026-09-28).
      const found = await projects.readWithin(params.projectId, resolved.access);
      if (found === null) return { ok: false, status: 404, body: { error: 'not_found' } } as const;
      return { ok: true, status: 204, body: EMPTY } as const;
    }),
  ] as const;
}

/**
 * Missing context headers become null; explicit empty header values stay empty.
 * Proof: nulling clientId or blanking traceId separately changed the captured
 * context in the mounted forms case (http/elysia/internal.test.ts).
 */
function contextFrom(request: RequestMetadata, traceId: string): InternalCallContext {
  return {
    clientId: request.headers.get('x-client-id'),
    connectionId: request.headers.get('x-connection-id'),
    traceId,
  };
}
