import {
  listComputeProviders,
  putCapacityReport,
  type readProjectResources,
  registerComputeProvider,
  removeComputeProvider,
  updateComputeProvider,
} from '@wbs/contracts';
import {
  type CapacityReport,
  type CapacityReportRefusal,
  compareCapacity,
  type Permission,
} from '@wbs/domain';

import type { Clock } from '../ports/clock';
import type { CapacityReports, ComputeProviderAdministration } from '../ports/compute-providers';
import type { OrganizationAccess } from '../ports/organization-access';
import { type AuditedAct, isSecretShaped } from '../ports/organization-audit';
import { retainSecurityPrincipal } from '../ports/security-principal';
import { bind, EMPTY, type HttpReply } from './endpoint';
import { sessionOrganizationOf } from './machine-credential.routes';
import { organizationRefusal } from './organization-refusal';

const forbidden = (permission: Permission) =>
  // Proof: dropping the named HTTP permission (provider-route-permission) failed `names manage_directory for a role-only compute-provider list refusal without effects`; restored GREEN.
  // Proof: dropping the named HTTP permission (provider-route-permission) failed `names manage_directory for a role-only compute-provider register refusal without effects`; restored GREEN.
  // Proof: dropping the named HTTP permission (provider-route-permission) failed `names manage_directory for a role-only compute-provider update refusal without effects`; restored GREEN.
  // Proof: dropping the named HTTP permission (provider-route-permission) failed `names manage_directory for a role-only compute-provider remove refusal without effects`; restored GREEN.
  ({ ok: false, status: 403, body: { error: 'forbidden', permission } }) as const;
const unknownProvider = { ok: false, status: 404, body: { error: 'unknown_provider' } } as const;
const invalidBody = { ok: false, status: 400, body: { error: 'invalid_body' } } as const;
const nameTaken = { ok: false, status: 409, body: { error: 'name_taken' } } as const;

/**
 * Provider instance administration (`compute-providers` P2) for the active
 * organization's current manage_directory grant holders, and the capacity report a Dash reporter puts (P5,
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
        // Proof: retaining principal aliases across organization resolution (provider-list-route-principal) failed `retains the compute-provider list route principal before resolution: id`; restored GREEN.
        const actor = retainSecurityPrincipal(principal);
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        const listed = await administration.list(organizationId, actor);
        if (listed === 'inactive') return organizationRefusal('no_active_organization');
        if ('kind' in listed) return forbidden(listed.permission);
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
        // Proof: retaining principal aliases across organization resolution (provider-register-route-principal) failed `retains the compute-provider register route principal before resolution: id`; restored GREEN.
        const actor = retainSecurityPrincipal(principal);
        const draft = {
          id: crypto.randomUUID(),
          kind: body.kind,
          name: body.name,
          locator: body.locator,
        };
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        const registered = await administration.register(
          organizationId,
          actor,
          // Proof: reading caller payload after organization resolution (provider-register-route-payload) failed `retains compute-provider register route payload before its resolver await`; restored GREEN.
          draft,
          act(actor.id),
        );
        switch (registered.kind) {
          case 'forbidden':
            return forbidden(registered.permission);
          case 'inactive':
            return organizationRefusal('no_active_organization');
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
        // Proof: with this check removed, `refuses an empty patch and a
        // secret-shaped name or locator, writing nothing` in
        // `compute-provider.controller.db.test.ts` answered 500; watched
        // 2026-10-22.
        if (
          (body.name !== undefined && isSecretShaped(body.name)) ||
          (body.locator !== undefined && isSecretShaped(body.locator))
        )
          return invalidBody;
        // Proof: retaining principal aliases across organization resolution (provider-update-route-principal) failed `retains the compute-provider update route principal before resolution: id`; restored GREEN.
        const actor = retainSecurityPrincipal(principal);
        const providerId = params.id;
        const patch = {
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.locator === undefined ? {} : { locator: body.locator }),
        };
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        // A patch naming neither field is a client fault, refused after the
        // organization context so a stale context is still answered first.
        // Proof: with this check removed, the same test's `{}` answered 200
        // instead of 400; watched 2026-10-22.
        if (patch.name === undefined && patch.locator === undefined) return invalidBody;
        const updated = await administration.update(
          organizationId,
          actor,
          // Proof: reading the caller target after organization resolution (provider-update-route-target) failed `retains compute-provider update route payload before its resolver await`; restored GREEN.
          providerId,
          // Proof: reading caller payload after organization resolution (provider-update-route-payload) failed `retains compute-provider update route payload before its resolver await`; restored GREEN.
          patch,
          act(actor.id),
        );
        switch (updated.kind) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
          case 'forbidden':
            return forbidden(updated.permission);
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
        // Proof: retaining principal aliases across organization resolution (provider-remove-route-principal) failed `retains the compute-provider remove route principal before resolution: id`; restored GREEN.
        const actor = retainSecurityPrincipal(principal);
        const providerId = params.id;
        const cascade = query.cascade === 'true';
        const organizationId = await sessionOrganizationOf(organizations, principal);
        if (typeof organizationId !== 'string') return organizationId;
        const removed = await administration.remove(
          organizationId,
          actor,
          // Proof: reading the caller target after organization resolution (provider-remove-route-target) failed `retains compute-provider remove route payload before its resolver await`; restored GREEN.
          providerId,
          // Proof: reading caller cascade intent after organization resolution (provider-remove-route-cascade) failed `retains parsed provider cascade intent before the bound resolver await`; restored GREEN.
          cascade,
          act(actor.id),
        );
        if (typeof removed === 'object' && removed.kind === 'forbidden')
          return forbidden(removed.permission);
        if (typeof removed === 'object')
          return {
            ok: false,
            status: 409,
            body: { error: 'in_use', resources: [...removed.resources] },
          };
        switch (removed) {
          case 'inactive':
            return organizationRefusal('no_active_organization');
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
        // Proof: retaining the resolver-held principal alias (report-route-principal-snapshot) failed `retains the mounted capacity reporter before resolver substitution: person`; restored GREEN.
        // Proof: retaining the resolver-held principal alias (report-route-principal-snapshot) failed `retains the mounted capacity reporter before resolver substitution: authentication`; restored GREEN.
        // Proof: retaining the resolver-held principal alias (report-route-principal-snapshot) failed `keeps mounted capacity session refusal despite substituted machine authentication`; restored GREEN.
        // Proof: retaining the resolver-held principal alias (report-route-principal-snapshot) failed `keeps mounted capacity delegation refusal despite substituted machine authentication`; restored GREEN.
        // Proof: shallow-copying authority and retaining nested machine-person aliases (report-route-auth-deep-snapshot) failed `retains the mounted capacity reporter before resolver substitution: person`; restored GREEN.
        const actor = retainSecurityPrincipal(principal);
        const providerId = params.providerId;
        const resourceId = params.resourceId;
        // Proof: retaining the caller report body across resolution (report-route-body-snapshot) failed `retains capacity report measured payload before the bound route resolver await`; restored GREEN.
        // Proof: retaining the caller report body across resolution (report-route-body-snapshot) failed `retains capacity report unreachable payload before the bound route resolver await`; restored GREEN.
        const retainedBody = {
          observedAt: body.observedAt,
          cadenceSeconds: body.cadenceSeconds,
          // Proof: retaining the nested report outcome across resolution (report-route-outcome-snapshot) failed `retains capacity report measured payload before the bound route resolver await`; restored GREEN.
          // Proof: retaining the nested report outcome across resolution (report-route-outcome-snapshot) failed `retains capacity report unreachable payload before the bound route resolver await`; restored GREEN.
          outcome: structuredClone(body.outcome),
        };
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const { authentication } = actor;
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
              authentication: actor.delegation === undefined ? 'session' : 'delegation',
            },
          };
        // A machine principal always carries its credential's organization
        // as a direct context, so legacy access is unreachable here.
        if (resolved.access.kind === 'legacy') return organizationRefusal('no_active_organization');
        // `reservedUnits` mean nothing without the dimension they count (`dash-host-jobs` J10).
        // Proof: without this check, `refuses reserved units without their dimension, and
        // either alone, invalid_body` (compute-provider.controller.db.test.ts) did not answer
        // 400 invalid_body (2026-11-02).
        if (
          retainedBody.outcome.kind === 'measured' &&
          (retainedBody.outcome.reservedUnits === undefined) !==
            (retainedBody.outcome.reservedDimension === undefined)
        )
          return invalidBody;
        const decision = await reports.put({
          organizationId: resolved.access.scope.organizationId,
          personId: authentication.personId,
          // Proof: reading caller providerId after resolution (report-route-providerId-snapshot) failed `retains capacity report targets payload before the bound route resolver await`; restored GREEN.
          providerId,
          // Proof: reading caller resourceId after resolution (report-route-resourceId-snapshot) failed `retains capacity report targets payload before the bound route resolver await`; restored GREEN.
          resourceId,
          body: retainedBody,
          // Proof: reading the completion clock before resolution (report-route-clock) failed `keeps the capacity report clock at post-resolution admission`; restored GREEN.
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
    'providerId' | 'provider' | 'report' | 'measurement'
  >[];
  capacities: ResourcesRead['capacities'];
  demands: ResourcesRead['demands'];
}

/**
 * Adds each resource's provider reference, latest report and declared-versus-
 * measured comparison to the project resources read (`compute-providers` P3,
 * P7), the instance's kind and name for every reader (task 5.3), and the
 * unreturned host jobs of its authority (`dash-host-jobs` J10). The
 * planned read is taken as it was: nothing here feeds back into it. A resource
 * with no instance gets `providerId: null` and nothing else.
 *
 * @throws when a listed resource has no reading: the reports store reads the
 * same rows the directory listed; and as {@link CapacityReports.readingsOf}
 * on a dangling reference or a malformed instance.
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
      if (reading.provider === null) return { ...each, providerId: null };
      const { id, kind, name } = reading.provider;
      return {
        ...each,
        providerId: id,
        provider: { kind, name },
        ...(reading.report === null ? {} : { report: reportWire(reading.report) }),
        measurement: compareCapacity(declared.get(each.id) ?? null, reading.report, now),
        // Absent when there is none, so a read without host jobs is the pre-change one.
        ...(reading.hostJobs.length === 0
          ? {}
          : {
              hostJobs: reading.hostJobs.map((job) => ({
                ...job,
                reservations: job.reservations.map((entry) => ({ ...entry })),
              })),
            }),
      };
    }),
    capacities: planned.capacities,
    demands: planned.demands,
  };
}
