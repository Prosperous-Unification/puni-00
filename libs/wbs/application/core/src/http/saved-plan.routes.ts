import {
  compareSavedPlans,
  deleteSavedPlan,
  listSavedPlans,
  readSavedPlan,
  renameSavedPlan,
  savePlan as savePlanShape,
} from '@wbs/contracts';
import type { Permission } from '@wbs/domain';
import type { PlanSide } from '@wbs/domain';

import { SavedPlanWriteError, saveObservedPlan } from '../module/saved-plans/save-plan';
import { projectSavedPlanList } from '../module/saved-plans/saved-plan.resource';
import { UnknownSavedPlanBodyVersionError } from '../module/saved-plans/saved-plan-integrity';
import type { SavedPlanCompareOutcome } from '../module/saved-plans/saved-plan-values';
import type { WorkPackageService } from '../module/work-package/work-package.resource';
import type {
  OrganizationAccess,
  OrganizationPrincipal,
  ResourceAccess,
} from '../ports/organization-access';
import type { Broadcaster } from '../ports/work-package-event';
import type { WorkPackageObservation } from '../ports/work-package-observation';
import type {
  SavedPlanService,
  SavedPlanSideRef,
  SavedPlanTouchResult,
} from '../service/saved-plan.service';
import { bind, EMPTY, type HttpReply, type RequestFailure } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/**
 * The reserved current sentinel names the live plan in the addressed work package.
 * Proof: using live sent kind:saved/savedPlanId:current instead of kind:current
 * to compare in the mounted compare case (saved-plan.controller.db.test.ts).
 */
function sideRef(side: string): SavedPlanSideRef {
  return side === 'current' ? { kind: 'current' } : { kind: 'saved', savedPlanId: side };
}

/**
 * Unsupported stored versions require a newer build; unknown failures still throw.
 * Proof: changing501 to400 or dropping supported returned500 instead of501;
 * catching unknown errors as not_found returned404 instead of500, all in the
 * mounted known-version case (saved-plan.controller.db.test.ts).
 */
function versionRefusal(error: unknown) {
  if (!(error instanceof UnknownSavedPlanBodyVersionError)) throw error;
  const supported = [...error.supported];
  return {
    ok: false,
    status: 501,
    body: {
      error: 'unsupported_body_version',
      savedPlanId: error.savedPlanId,
      body: error.body,
      version: error.version,
      supported,
    },
  } as const;
}

/**
 * Classifies only the named service operation; work package lookups and announcements
 * are outside this catch because their failures say nothing about stored plan versions.
 * Proof: broad handler catches returned501 instead of500 independently for work package
 * and announcement errors in saved-plan.controller.db.test.ts's version-shaped cases.
 */
async function callSavedPlan<T>(operation: () => Promise<T>) {
  try {
    return { ok: true, value: await operation() } as const;
  } catch (error) {
    return versionRefusal(error);
  }
}

/**
 * Name bodies retain structural 422; malformed JSON and other request parts use 400.
 * Proof: mapping structural bodies to400 returned500 instead of422 in the
 * mounted name-admission case (saved-plan.controller.db.test.ts).
 */
function classifyNameFailure(failure: RequestFailure) {
  switch (failure.code) {
    case 'invalid_body':
      return { ok: false, status: 422, body: { error: 'invalid_body' } } as const;
    case 'invalid_json':
      return { ok: false, status: 400, body: { error: 'invalid_json' } } as const;
    case 'invalid_params':
      return { ok: false, status: 400, body: { error: 'invalid_params' } } as const;
    case 'invalid_query':
      return { ok: false, status: 400, body: { error: 'invalid_query' } } as const;
  }
}

/**
 * Lock contention is retryable 503; permission and missing-record refusals retain their own status.
 * Proof: changing503 to400 returned500 instead of503 in the mounted contention
 * case (saved-plan.controller.db.test.ts).
 */
function touchRefusal(
  outcome: Exclude<SavedPlanTouchResult['outcome'], 'touched'>,
  permission?: Permission,
) {
  switch (outcome) {
    case 'forbidden':
      return {
        ok: false,
        status: 403,
        body: { error: outcome, ...(permission === undefined ? {} : { permission }) },
      } as const;
    case 'no_active_organization':
    case 'organization_context_changed':
      return organizationRefusal({ ok: false, refusal: outcome });
    case 'not_found':
      return { ok: false, status: 404, body: { error: outcome } } as const;
    case 'snapshot_busy':
      return { ok: false, status: 503, body: { error: outcome } } as const;
  }
}

/**
 * Six saved-plan operations. Saves use work package write access; rename/delete use
 * the actual saved author before activation, or current package.write plus
 * saved authorship or package.manage_settings under scoped access. Actor identity comes
 * from policy admission.
 * Successful mutations announce only after the service commits and releases its
 * turn, through the process's own broadcaster — a saved plan is never part of
 * a batch, so nothing collects its event. Refusals publish nothing.
 */
/**
 * Every saved-plan route resolves organization access before any lookup. A
 * route addressed by a work package reads it through the caller's access; one
 * addressed by a saved plan checks the plan's work package the same way, so a
 * foreign plan answers exactly as an absent one. Under scoped access only a
 * writing role may rename or delete. The shelf resolves current package.read and header rows
 * through one required observation before projecting detached headers. Saved detail and
 * saved comparison observes each side through its required data-only purpose. Current/current
 * reuses one completed current capture; saved history never calls the current capture owner.
 *
 * Proof: bypassing the resolution in the save route made `refuses an unbound
 * session and a removed member before any lookup` in
 * `saved-plan-organization.controller.db.test.ts` answer 201; watched
 * 2026-09-27.
 */
export function savedPlanRoutes(
  plans: SavedPlanService,
  workPackages: WorkPackageService,
  announcements: Broadcaster,
  organizations: OrganizationAccess,
  observation: Pick<
    WorkPackageObservation,
    'listSaved' | 'readSaved' | 'captureSavedCurrent' | 'captureSavedPlan'
  >,
) {
  /**
   * Whether the caller's access reaches the saved plan's work package; false alike
   * for an absent plan and a foreign one. This helper remains on touch paths; the
   * historical read evidence below predates the required data-only readSaved purpose.
   *
   * Proof: answering true without the work package check made `answers a foreign
   * saved plan exactly as an absent one` in
   * `saved-plan-organization.controller.db.test.ts` read B's plan; watched
   * 2026-09-27.
   */
  const reachesPlan = async (savedPlanId: string, access: ResourceAccess): Promise<boolean> => {
    if (access.kind === 'legacy') return true;
    const workPackageId = await plans.workPackageOf(savedPlanId);
    return (
      workPackageId !== null && (await workPackages.readWithin(workPackageId, access)) !== null
    );
  };
  /**
   * Why the caller may not rename or delete a saved plan at all: no
   * organization authority, a plan the organization does not own (the same 404
   * as an absent one), or the actual principal's missing current permission.
   *
   * Proof: skipping the role check made `refuses a viewer every saved-plan
   * write and lets the viewer read` in
   * `saved-plan-organization.controller.db.test.ts` answer 200 for the
   * viewer's rename of a plan the viewer created; watched 2026-09-27.
   */
  const refuseTouch = async (savedPlanId: string, principal: OrganizationPrincipal) => {
    const resolved = await organizations.resolve(principal);
    if (!resolved.ok) return organizationRefusal(resolved);
    if (!(await reachesPlan(savedPlanId, resolved.access)))
      return { ok: false, status: 404, body: { error: 'not_found' } } as const;
    if (resolved.access.kind === 'scoped') {
      const workPackageId = await plans.workPackageOf(savedPlanId);
      if (workPackageId === null)
        return { ok: false, status: 404, body: { error: 'not_found' } } as const;
      const decision = await workPackages.authorizeWrite(
        workPackageId,
        principal.id,
        resolved.access,
      );
      if (!decision.ok)
        return decision.reason === 'not_found'
          ? ({ ok: false, status: 404, body: { error: 'not_found' } } as const)
          : ({
              ok: false,
              status: 403,
              body: { error: 'forbidden', permission: decision.permission },
            } as const);
    }
    return null;
  };
  return [
    bind(
      savePlanShape,
      async ({ params, body, principal }): Promise<HttpReply<typeof savePlanShape>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        let outcome;
        try {
          outcome = await saveObservedPlan(
            { plans, observation, announcements },
            {
              workPackageId: params.id,
              actor: principal,
              name: body.name,
              access: resolved.access,
            },
          );
        } catch (error) {
          if (!(error instanceof SavedPlanWriteError)) throw error;
          return versionRefusal(error.writeCause);
        }
        switch (outcome.outcome) {
          case 'saved':
            return { ok: true, status: 201, body: { savedPlan: outcome.record } };
          case 'no_work_package':
          case 'not_found':
            return { ok: false, status: 404, body: { error: 'not_found' } };
          case 'forbidden':
            return {
              ok: false,
              status: 403,
              body: {
                error: 'forbidden',
                ...('permission' in outcome && outcome.permission !== undefined
                  ? { permission: outcome.permission }
                  : {}),
              },
            };
          case 'access_refused':
            return organizationRefusal(outcome.refusal);
          case 'insufficient_scope':
            return { ok: false, status: 403, body: { error: 'insufficient_scope' } };
          case 'snapshot_busy':
            return { ok: false, status: 503, body: { error: 'snapshot_busy' } };
          case 'refused':
            // Proof: dropping quota detail returned500 instead of409 in the
            // mounted quota case (saved-plan.controller.db.test.ts).
            return { ok: false, status: 409, body: { error: 'quota', refusal: outcome.refusal } };
        }
      },
      {
        classifyRequestFailure: classifyNameFailure,
      },
    ),
    bind(
      listSavedPlans,
      async ({ params, principal }): Promise<HttpReply<typeof listSavedPlans>> => {
        // Proof: R1 A shallow principal copy changed nested observer caller fields after held resolution.
        // core shelf owner:325; top-level ID already retained; canonical/fault/restored exits 0/1/0.
        const retained = structuredClone(principal);
        // Proof: R2 Reading params after held resolution changed the observed package ID.
        // core shelf owner:325; canonical/fault/restored exits 0/1/0.
        const id = params.id;
        // Proof: R4 Resolving the original principal changed the captured nested resolver input.
        // core shelf owner:329; retained observer caller passed first; canonical/fault/restored exits 0/1/0.
        const resolved = await organizations.resolve(retained);
        // Proof: R3 Removing initial refusal handling changed 403/not_a_member to late 409.
        // core shelf owner:234; canonical/fault/restored exits 0/1/0.
        if (!resolved.ok) return organizationRefusal(resolved);
        // Proof: reading the work package unscoped here, and separately in the
        // compare route, made `answers 404 alike for a foreign and an absent
        // work package on every saved-plan and history route` in
        // `saved-plan-organization.controller.db.test.ts` answer 200 with B's
        // plans; watched 2026-09-27.
        // Historical proof above describes the former raw lookup; shelf admission and headers share one observation.
        const observed = await observation.listSaved(
          // Proof: R5 Forwarding legacy access replaced the actual scoped observer context.
          // core shelf owner:325; expectedAccess is not current grant authority; canonical/fault/restored exits 0/1/0.
          { kind: 'human', principal: retained, expectedAccess: resolved.access },
          id,
        );
        // Proof: R6 Removing late refusal handling threw while projecting rows instead of returning 409.
        // core shelf owner; late reply assertion unreached; canonical/fault/restored exits 0/1/0.
        if (!observed.ok) return organizationRefusal(observed);
        // Proof: R7 Removing hidden-null handling threw on rows.map instead of returning 404.
        // core shelf owner; 404 and later captures/noninvocation unreached; canonical/fault/restored exits 0/1/0.
        if (observed.value === null)
          return { ok: false, status: 404, body: { error: 'not_found' } };
        return {
          ok: true,
          status: 200,
          body: { savedPlans: projectSavedPlanList(observed.value) },
        };
      },
    ),
    bind(
      compareSavedPlans,
      async ({ params, query, principal }): Promise<HttpReply<typeof compareSavedPlans>> => {
        const retained = structuredClone(principal);
        const id = params.id;
        const left = sideRef(query.left);
        const right = sideRef(query.right);
        const resolved = await organizations.resolve(retained);
        if (!resolved.ok) return organizationRefusal(resolved);
        type Side =
          | { readonly kind: 'side'; readonly side: PlanSide }
          | { readonly kind: 'reply'; readonly reply: HttpReply<typeof compareSavedPlans> }
          | {
              readonly kind: 'refused';
              readonly outcome: Exclude<SavedPlanCompareOutcome, { readonly outcome: 'compared' }>;
            };
        const readSide = async (ref: SavedPlanSideRef): Promise<Side> => {
          const caller = {
            kind: 'human' as const,
            principal: retained,
            expectedAccess: resolved.access,
          };
          // Proof: C15 — Putting current capture inside the stored-version classifier made the first
          // version-shaped capture resolve after undefined/Error controls. The rejection flag failed;
          // no reply body or later version-shaped projection was observed. Observed in
          // saved-plan.routes.test.ts, "direct current capture and pure projection retain unknown
          // including undefined outside stored-version classification" (2026-11-15).
          if (ref.kind === 'current') {
            const observed = await observation.captureSavedCurrent(caller, id);
            // Proof: C16a — Replacing late refusal forwarding with generic404 returned not_found
            // instead of organization_context_changed/409 after the initial refusal controls. This
            // local forwarding decision only. Observed in saved-plan.routes.test.ts, "direct current
            // denial and initial or later refusal do not inspect the right saved side" (2026-11-15).
            if (!observed.ok) return { kind: 'reply', reply: organizationRefusal(observed) };
            // Proof: C16b — Omitting current-null handling invoked the deliberately rejecting right
            // saved observer before the opaque404 equality. An ordering witness, not an actual private
            // saved-byte read. Observed in saved-plan.routes.test.ts, "direct current denial and
            // initial or later refusal do not inspect the right saved side" (2026-11-15).
            if (observed.value === null)
              return { kind: 'refused', outcome: { outcome: 'no_work_package' } };
            return { kind: 'side', side: plans.projectCapturedCurrent(observed.value, id) };
          }
          const savedPlanId = ref.savedPlanId;
          const observed = await observation.readSaved(caller, {
            kind: 'comparison',
            workPackageId: id,
            savedPlanId,
          });
          if (!observed.ok) return { kind: 'reply', reply: organizationRefusal(observed) };
          switch (observed.value.kind) {
            case 'package_not_found':
              return { kind: 'refused', outcome: { outcome: 'no_work_package' } };
            case 'saved_plan_not_found':
              return { kind: 'refused', outcome: { outcome: 'not_found', savedPlanId } };
            case 'stored': {
              const stored = observed.value.stored;
              const called = await callSavedPlan(() => plans.readStoredSide(stored));
              if (!called.ok) return { kind: 'reply', reply: called };
              return called.value.outcome === 'side'
                ? { kind: 'side', side: called.value.side }
                : { kind: 'refused', outcome: called.value };
            }
          }
        };
        let outcome: SavedPlanCompareOutcome;
        // Proof: C14 — Reversing the completed-side awaits still returned200 but recorded
        // current-read/project before saved-read/verify for saved/current. Left-first sequencing only;
        // current/current reuse was retained. Observed in saved-plan.routes.test.ts, "direct
        // saved/current fully completes each original side in left-first order" (2026-11-15).
        const leftSide = await readSide(left);
        if (leftSide.kind === 'reply') return leftSide.reply;
        if (leftSide.kind === 'refused') outcome = leftSide.outcome;
        else {
          // Proof: C13 — Reading the right current side again produced two captured calls after a
          // healthy 200, failing the exact call array. Completed-side reuse only; later
          // projection/reuse assertions were unreached. Observed in saved-plan.routes.test.ts, "direct
          // current/current observes and projects once then reuses the exact completed side without raw
          // reads" (2026-11-15).
          const rightSide =
            left.kind === 'current' && right.kind === 'current' ? leftSide : await readSide(right);
          if (rightSide.kind === 'reply') return rightSide.reply;
          outcome =
            rightSide.kind === 'refused'
              ? rightSide.outcome
              : plans.compareSides(left, leftSide.side, right, rightSide.side);
        }
        switch (outcome.outcome) {
          case 'compared':
            return {
              ok: true,
              status: 200,
              body: {
                // Proof: omitting left failed the mounted equal-history comparison with an empty diff.
                left: outcome.left,
                right: outcome.right,
                diff: {
                  // A removed field is undefined in the domain diff; JSON requires both sides.
                  // Proof: upstream assignment removal made mounted saved/current compare return
                  // 500 until the absent elsewhereHolder and waitingElsewhere sides were encoded.
                  // Proof: omitting input normalization made removed target assignment compare 500.
                  input: outcome.diff.input.map((difference) => ({
                    ...difference,
                    left: difference.left === undefined ? null : difference.left,
                    right: difference.right === undefined ? null : difference.right,
                  })),
                  // Proof: omitting schedule normalization made upstream booking removal compare 500.
                  schedule: outcome.diff.schedule.map((difference) => ({
                    ...difference,
                    left: difference.left === undefined ? null : difference.left,
                    right: difference.right === undefined ? null : difference.right,
                  })),
                },
              },
            };
          case 'corrupt':
            // Proof: dropping the corrupt side id returned500 instead of422
            // in the mounted compare case (saved-plan.controller.db.test.ts).
            return {
              ok: false,
              status: 422,
              body: {
                error: 'corrupt',
                savedPlanId: outcome.savedPlanId,
                refusal: outcome.refusal,
              },
            };
          case 'no_work_package':
            return { ok: false, status: 404, body: { error: 'not_found' } };
          case 'not_found':
            return {
              ok: false,
              status: 404,
              body: { error: 'not_found', savedPlanId: outcome.savedPlanId },
            };
        }
      },
      {
        classifyRequestFailure: (failure) =>
          failure.code === 'invalid_query'
            ? { ok: false, status: 422, body: { error: 'invalid_query' } }
            : failure.part === 'params'
              ? { ok: false, status: 400, body: { error: 'invalid_params' } }
              : { ok: false, status: 400, body: { error: 'invalid_body' } },
      },
    ),
    bind(readSavedPlan, async ({ params, principal }): Promise<HttpReply<typeof readSavedPlan>> => {
      const retained = structuredClone(principal);
      const id = params.id;
      const resolved = await organizations.resolve(retained);
      if (!resolved.ok) return organizationRefusal(resolved);
      const observed = await observation.readSaved(
        { kind: 'human', principal: retained, expectedAccess: resolved.access },
        { kind: 'detail', savedPlanId: id },
      );
      if (!observed.ok) return organizationRefusal(observed);
      if (observed.value.kind !== 'stored')
        return { ok: false, status: 404, body: { error: 'not_found' } };
      const stored = observed.value.stored;
      const called = await callSavedPlan(() => plans.readStoredPlan(stored));
      if (!called.ok) return called;
      const outcome = called.value;
      switch (outcome.outcome) {
        case 'read':
          return { ok: true, status: 200, body: { savedPlan: outcome.plan } };
        case 'corrupt':
          return { ok: false, status: 422, body: { error: 'corrupt', refusal: outcome.refusal } };
      }
    }),
    bind(
      renameSavedPlan,
      async ({ params, body, principal }): Promise<HttpReply<typeof renameSavedPlan>> => {
        const refused = await refuseTouch(params.id, principal);
        if (refused !== null) return refused;
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const scoped =
          resolved.access.kind === 'scoped'
            ? {
                organizationId: resolved.access.scope.organizationId,
                actorId: principal.id,
                principal: resolved.access.principal,
                operation: 'rename' as const,
              }
            : {
                kind: 'legacy' as const,
                actorId: principal.id,
                source: 'human' as const,
                operation: 'rename' as const,
              };
        const called = await callSavedPlan(() =>
          plans.rename(params.id, principal.id, body.name, scoped),
        );
        if (!called.ok) return called;
        const outcome = called.value;
        if (outcome.outcome !== 'touched')
          return touchRefusal(
            outcome.outcome,
            outcome.outcome === 'forbidden' ? outcome.permission : undefined,
          );
        await announcements.publish(outcome.workPackageId, { type: 'saved_plans_changed' });
        return { ok: true, status: 200, body: { savedPlanId: params.id, name: body.name } };
      },
      {
        classifyRequestFailure: classifyNameFailure,
      },
    ),
    bind(
      deleteSavedPlan,
      async ({ params, principal }): Promise<HttpReply<typeof deleteSavedPlan>> => {
        const refused = await refuseTouch(params.id, principal);
        if (refused !== null) return refused;
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        const scoped =
          resolved.access.kind === 'scoped'
            ? {
                organizationId: resolved.access.scope.organizationId,
                actorId: principal.id,
                principal: resolved.access.principal,
                operation: 'delete' as const,
              }
            : {
                kind: 'legacy' as const,
                actorId: principal.id,
                source: 'human' as const,
                operation: 'delete' as const,
              };
        const called = await callSavedPlan(() => plans.delete(params.id, principal.id, scoped));
        if (!called.ok) return called;
        const outcome = called.value;
        if (outcome.outcome !== 'touched')
          return touchRefusal(
            outcome.outcome,
            outcome.outcome === 'forbidden' ? outcome.permission : undefined,
          );
        await announcements.publish(outcome.workPackageId, { type: 'saved_plans_changed' });
        return { ok: true, status: 204, body: EMPTY };
      },
    ),
  ] as const;
}
