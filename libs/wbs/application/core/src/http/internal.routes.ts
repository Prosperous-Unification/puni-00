import {
  type AuthenticatedUser,
  forwardInternal,
  gatewayBrowserWorkPackageAccess,
  gatewayWorkPackageAccess,
  type InternalResumeResponse,
  resumeInternal,
} from '@wbs/contracts';

import { replayReadable } from '../module/realtime/realtime.feature';
import type { OrganizationAccess } from '../ports/organization-access';
import { workPackageIdOfSubscription } from '../ports/work-package-event';
import type { WorkPackageObservation } from '../ports/work-package-observation';
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
  /** Current authorization-only package purpose for the resume principal's subscription checks. */
  observation: Pick<WorkPackageObservation, 'checkRead'>;
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
      // Proof: U1: aliasing the resume principal captured changed top-level and nested caller fields.
      // Test: direct resume retains nested caller and copied cursor entries before initial resolution waits.
      // Composite caller only; original cursor ID stayed retained and replay equality was unreached.
      const retained = structuredClone(principal);
      // Proof: U2: aliasing cursor entries admitted the injected subscription ID to observation.
      // Test: direct resume retains nested caller and copied cursor entries before initial resolution waits.
      // Injected-key observation only; numeric replay equality was unreached, not a numeric-value proof.
      const resumePoints = Object.fromEntries(Object.entries(body.resume_points));
      const context = contextFrom(request, body.trace_id);
      const readable = await readableWorkPackages(deps.observation, deps.organizations, retained);
      // The following historical Proof records the raw organization-lookup gate; current admission uses checkRead.
      // Proof: admitting every named subscription made `refuses a resume
      // naming a foreign work package` and `replays nothing to a removed member`
      // (gateway-browser.controller.db.test.ts) replay them (2026-10-11).
      const outcome = await replayReadable(
        { replay: (points) => deps.onResume(points, context) },
        resumePoints,
        async (subscription) => {
          const workPackageId = workPackageIdOfSubscription(subscription);
          return workPackageId !== null && (await readable(workPackageId));
        },
      );
      return { ok: true, status: 200, body: outcome };
    }),
  ] as const;
}

/**
 * Resolves initial membership, then checks each addressed package with the retained caller.
 * Each check owns its committed observation; no shared subscription/replay-log epoch is promised.
 * Refused initial or later context denies the subscription; unexpected check failures propagate.
 * The historical Proof below records the former raw membership/organization-lookup flow.
 */
async function readableWorkPackages(
  observation: Pick<WorkPackageObservation, 'checkRead'>,
  organizations: OrganizationAccess,
  principal: AuthenticatedUser,
): Promise<(workPackageId: string) => Promise<boolean>> {
  const resolved = await organizations.resolve(principal);
  // Proof: reading with legacy access after a refused resolution made
  // `replays nothing to a removed member` (gateway-browser.controller.db.test.ts)
  // replay the work package (2026-10-11).
  if (!resolved.ok) return () => Promise.resolve(false);
  return async (workPackageId) => {
    const observed = await observation.checkRead(
      // Proof: U3: forwarding legacy expected access captured legacy for both resume checks instead of the
      // resolved scope.
      // Test: direct resume checks only valid namespaces and replays only currently readable cursor entries.
      // Argument forwarding only; reply passed, replay-map equality was unreached; no parser/SQL proof.
      { kind: 'human', principal, expectedAccess: resolved.access },
      workPackageId,
    );
    // Proof: U4: replacing the whole observed-result gate with true lost the hidden subscription's DENIED
    // entry.
    // Test: direct resume checks only valid namespaces and replays only currently readable cursor entries.
    // One composite gate only; visible replay/invalid denials remained, later calls/replay assertions were
    // unreached.
    return observed.ok && observed.value;
  };
}

/**
 * Checks current package.read without projecting private fields for either gateway identity path.
 * Historical Proof paragraphs below describe the former raw membership/organization lookups;
 * they do not independently establish the current observation admission.
 */
export function gatewayAccessRoutes(
  observation: Pick<WorkPackageObservation, 'checkRead'>,
  organizations: OrganizationAccess,
) {
  return [
    // The forwarded-browser variant gw-01 calls today; the delegation variant
    // below is the post-activation path.
    bind(gatewayBrowserWorkPackageAccess, async ({ principal, params }) => {
      // Proof: B1: aliasing the browser principal captured its changed top-level and nested fields.
      // Test: direct browser gateway retains nested caller and primitive package ID before initial resolution
      // waits.
      // Composite caller only; 204/resolver capture passed, ID stayed original; no SQL/transport proof.
      const retained = structuredClone(principal);
      // Proof: B2: reading browser package ID after initial await captured changed-package instead of
      // original-package.
      // Test: direct browser gateway retains nested caller and primitive package ID before initial resolution
      // waits.
      // Primitive ID timing only; complete caller stayed retained; no SQL/transport proof.
      const id = params.workPackageId;
      const resolved = await organizations.resolve(retained);
      // Proof: bypassing this membership resolution admitted a removed member
      // in `refuses a removed member` (gateway-browser.controller.db.test.ts).
      if (!resolved.ok) return organizationRefusal(resolved);
      // Proof: replacing readWithin with an unscoped lookup answered 204 for a
      // foreign work package in `refuses a foreign workPackage as not found`
      // (gateway-browser.controller.db.test.ts).
      const observed = await observation.checkRead(
        // Proof: B3: forwarding legacy expected access captured legacy instead of the browser's resolved scope.
        // Test: direct browser gateway maps current read admission and absence without a raw package read.
        // Argument forwarding only; controlled true204/false404 passed, no provider/SQL proof.
        { kind: 'human', principal: retained, expectedAccess: resolved.access },
        id,
      );
      // Proof: B4: omitting browser late-refusal forwarding returned404 instead of the current-context409.
      // Test: direct browser gateway skips observation on initial refusal and forwards later current refusals
      // exactly.
      // Direct late-reply mapping only; initial403/zero calls passed, final count was unreached.
      if (!observed.ok) return organizationRefusal(observed);
      // Proof: B5: omitting browser false-admission concealment returned204 instead of404.
      // Test: direct browser gateway maps current read admission and absence without a raw package read.
      // Direct false-to404 mapping only; true204 passed, final captured calls were unreached.
      if (!observed.value) return { ok: false, status: 404, body: { error: 'not_found' } } as const;
      return { ok: true, status: 204, body: EMPTY } as const;
    }),
    bind(gatewayWorkPackageAccess, async ({ principal, params }) => {
      // Proof: D1: aliasing the delegation principal captured its changed top-level and nested fields.
      // Test: direct delegation gateway retains nested caller and primitive package ID before initial
      // resolution waits.
      // Composite caller only; 204/resolver capture passed and ID stayed original; no SQL/transport proof.
      const retained = structuredClone(principal);
      // Proof: D2: reading delegation package ID after initial await captured changed-package instead of
      // original-package.
      // Test: direct delegation gateway retains nested caller and primitive package ID before initial
      // resolution waits.
      // Primitive ID timing only; complete caller stayed retained; no SQL/transport proof.
      const id = params.workPackageId;
      // Proof: selecting the organization from x-wbs-organization made the
      // mounted foreign-work-package test answer 204 instead of 404 (2026-09-28).
      const resolved = await organizations.resolve(retained);
      // Proof: bypassing this membership resolution admitted a removed member in
      // the mounted gateway access test (2026-09-28).
      if (!resolved.ok) return organizationRefusal(resolved);
      // Proof: replacing readWithin with an unscoped lookup answered 204 for a
      // foreign work package in the mounted gateway access test (2026-09-28).
      const observed = await observation.checkRead(
        // Proof: D3: forwarding legacy expected access captured legacy instead of the delegation's resolved
        // scope.
        // Test: direct delegation gateway maps current read admission and absence without a raw package read.
        // Argument forwarding only; controlled true204/false404 passed, no provider/SQL proof.
        { kind: 'human', principal: retained, expectedAccess: resolved.access },
        id,
      );
      // Proof: D4: omitting delegation late-refusal forwarding returned404 instead of the current-context409.
      // Test: direct delegation gateway skips observation on initial refusal and forwards later current
      // refusals exactly.
      // Direct late-reply mapping only; initial403/zero calls passed, final count was unreached.
      if (!observed.ok) return organizationRefusal(observed);
      // Proof: D5: omitting delegation false-admission concealment returned204 instead of404.
      // Test: direct delegation gateway maps current read admission and absence without a raw package read.
      // Direct false-to404 mapping only; true204 passed, final captured calls were unreached.
      if (!observed.value) return { ok: false, status: 404, body: { error: 'not_found' } } as const;
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
