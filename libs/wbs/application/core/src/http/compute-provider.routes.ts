import {
  listComputeProviders,
  putCapacityReport,
  type readProjectResources,
  registerComputeProvider,
  removeComputeProvider,
  updateComputeProvider,
} from '@wbs/contracts';
import { type CapacityReport, type CapacityReportRefusal, compareCapacity } from '@wbs/domain';

import type { Clock } from '../ports/clock';
import type { CapacityReports, ComputeProviderAdministration } from '../ports/compute-providers';
import type { OrganizationAccess } from '../ports/organization-access';
import { type AuditedAct, isSecretShaped } from '../ports/organization-audit';
import { bind, EMPTY, type HttpReply } from './endpoint';
import { sessionOrganizationOf } from './machine-credential.routes';
import { organizationRefusal } from './organization-refusal';

const forbidden = { ok: false, status: 403, body: { error: 'forbidden' } } as const;
const unknownProvider = { ok: false, status: 404, body: { error: 'unknown_provider' } } as const;
const invalidBody = { ok: false, status: 400, body: { error: 'invalid_body' } } as const;
const nameTaken = { ok: false, status: 409, body: { error: 'name_taken' } } as const;

/**
 * Provider instance administration (`compute-providers` P2) for the active
 * organization's admins, and the capacity report a Dash reporter puts (P5,
 * P6). Administration refuses a delegation or a machine credential
 * `insufficient_scope`, as every `/api/organization/*` administration route
 * does; the report admits nothing but a machine credential.
 */
export function computeProviderRoutes(
  organizations: OrganizationAccess,
  administration: ComputeProviderAdministration,
  reports: CapacityReports,
  clock: Pick<Clock, 'now'>,
) {
  const act = (actorId: string): AuditedAct => ({
    stamp: { at: clock.now(), by: actorId },
    actor: actorId,
    auditId: crypto.randomUUID(),
  });
  return [
    bind(
      listComputeProviders,
      async ({ principal }): Promise<HttpReply<typeof listComputeProviders>> => {
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        const listed = await administration.list(organizationId, principal.id);
        if (listed === 'inactive') return organizationRefusal('no_active_organization');
        if (listed === 'forbidden') return forbidden;
        return { ok: true, status: 200, body: { computeProviders: [...listed] } };
      },
    ),
    bind(
      registerComputeProvider,
      async ({ principal, body }): Promise<HttpReply<typeof registerComputeProvider>> => {
        // The name and locator are written to the audit detail, so one shaped
        // like a secret is refused here rather than as the audit writer's 500.
        // Proof: with this check removed, `refuses a name or locator shaped
        // like a secret, storing nothing` in
        // `compute-provider.controller.db.test.ts` answered 500; watched
        // 2026-10-22.
        if (isSecretShaped(body.name) || isSecretShaped(body.locator)) return invalidBody;
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        const registered = await administration.register(
          organizationId,
          principal.id,
          { id: crypto.randomUUID(), kind: body.kind, name: body.name, locator: body.locator },
          act(principal.id),
        );
        switch (registered.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden;
          case 'name_taken':
            return nameTaken;
          case 'registered':
            return { ok: true, status: 201, body: registered.provider };
        }
      },
    ),
    bind(
      updateComputeProvider,
      async ({ principal, params, body }): Promise<HttpReply<typeof updateComputeProvider>> => {
        if (
          (body.name !== undefined && isSecretShaped(body.name)) ||
          (body.locator !== undefined && isSecretShaped(body.locator))
        )
          return invalidBody;
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        // A patch naming neither field is a client fault, refused after the
        // organization context so a stale context is still answered first.
        if (body.name === undefined && body.locator === undefined) return invalidBody;
        const updated = await administration.update(
          organizationId,
          principal.id,
          params.id,
          {
            ...(body.name === undefined ? {} : { name: body.name }),
            ...(body.locator === undefined ? {} : { locator: body.locator }),
          },
          act(principal.id),
        );
        switch (updated.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden;
          case 'unknown_provider':
            return unknownProvider;
          case 'name_taken':
            return nameTaken;
          case 'updated':
            return { ok: true, status: 200, body: updated.provider };
        }
      },
    ),
    bind(
      removeComputeProvider,
      async ({ principal, params, query }): Promise<HttpReply<typeof removeComputeProvider>> => {
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        const removed = await administration.remove(
          organizationId,
          principal.id,
          params.id,
          query.cascade === 'true',
          act(principal.id),
        );
        if (typeof removed === 'object')
          return {
            ok: false,
            status: 409,
            body: { error: 'in_use', resources: [...removed.resources] },
          };
        switch (removed) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden;
          case 'unknown_provider':
            return unknownProvider;
          case 'removed':
            return { ok: true, status: 204, body: EMPTY };
        }
      },
    ),
    bind(
      putCapacityReport,
      async ({ principal, params, body }): Promise<HttpReply<typeof putCapacityReport>> => {
        // The organization context is answered first, as on every
        // organization mutation, so a stale browser expectation reads 409.
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const { authentication } = principal;
        // Proof: with this check removed, `refuses a browser session and an
        // MCP delegation, storing nothing` in
        // `compute-provider.controller.db.test.ts` answered the session 500
        // instead of 403; watched 2026-10-22.
        if (authentication?.kind !== 'machine')
          return {
            ok: false,
            status: 403,
            body: {
              error: 'not_an_agent_principal',
              authentication: principal.delegation === undefined ? 'session' : 'delegation',
            },
          };
        // A machine principal always carries its credential's organization
        // as a direct context, so legacy access is unreachable here.
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        const decision = await reports.put({
          organizationId: resolved.access.scope.organizationId,
          personId: authentication.personId,
          providerId: params.providerId,
          resourceId: params.resourceId,
          body,
          now: clock.now(),
        });
        if (decision.kind === 'refused') return reportRefusal(decision.refusal);
        return { ok: true, status: 200, body: reportWire(decision.report) };
      },
    ),
  ] as const;
}

function reportWire(report: CapacityReport) {
  return { ...report, outcome: { ...report.outcome } };
}

function reportRefusal(refusal: CapacityReportRefusal): HttpReply<typeof putCapacityReport> {
  switch (refusal.kind) {
    case 'not_an_agent_principal':
      return {
        ok: false,
        status: 403,
        body: { error: refusal.kind, personKind: refusal.personKind },
      };
    case 'observedAt_in_future':
      return { ok: false, status: 400, body: { error: refusal.kind, skewMs: refusal.skewMs } };
    case 'unknown_provider':
      return unknownProvider;
    case 'not_found':
      return { ok: false, status: 404, body: { error: 'not_found' } };
    case 'provider_mismatch':
      return {
        ok: false,
        status: 409,
        body: { error: refusal.kind, providerId: refusal.providerId },
      };
    case 'report_superseded':
      return {
        ok: false,
        status: 409,
        body: { error: refusal.kind, storedObservedAt: refusal.storedObservedAt },
      };
  }
}

/** The project resources read's body, as the work-item service answers it. */
type ResourcesRead = Extract<HttpReply<typeof readProjectResources>, { ok: true }>['body'];

/** The resources read before {@link withProviderReadings} adds the provider columns. */
export interface PlannedResources {
  resources: readonly Omit<
    ResourcesRead['resources'][number],
    'providerId' | 'report' | 'measurement'
  >[];
  capacities: ResourcesRead['capacities'];
  demands: ResourcesRead['demands'];
}

/**
 * Adds each resource's provider reference, latest report and declared-versus-
 * measured comparison to the project resources read (`compute-providers` P3,
 * P7). The planned read is taken as it was: nothing here feeds back into it.
 * A resource with no instance gets `providerId: null` and nothing else.
 *
 * @throws when a listed resource has no reading: the reports store reads the
 * same rows the directory listed.
 */
export async function withProviderReadings(
  planned: PlannedResources,
  reports: Pick<CapacityReports, 'readingsOf'>,
  now: number,
): Promise<ResourcesRead> {
  const readings = await reports.readingsOf(planned.resources.map((each) => each.id));
  const declared = new Map(planned.capacities.map((each) => [each.resourceId, each.units]));
  return {
    resources: planned.resources.map((each) => {
      const reading = readings.get(each.id);
      if (reading === undefined) throw new Error(`resource ${each.id} has no provider reading`);
      if (reading.providerId === null) return { ...each, providerId: null };
      return {
        ...each,
        providerId: reading.providerId,
        ...(reading.report === null ? {} : { report: reportWire(reading.report) }),
        measurement: compareCapacity(declared.get(each.id) ?? null, reading.report, now),
      };
    }),
    capacities: planned.capacities,
    demands: planned.demands,
  };
}
