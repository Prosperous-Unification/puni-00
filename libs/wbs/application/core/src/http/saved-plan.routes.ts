import {
  compareSavedPlans,
  deleteSavedPlan,
  listSavedPlans,
  readSavedPlan,
  renameSavedPlan,
  savePlan as savePlanShape,
} from '@wbs/contracts';
import { canWriteInOrganization } from '@wbs/domain';

import type {
  OrganizationAccess,
  OrganizationPrincipal,
  ResourceAccess,
} from '../ports/organization-access';
import type { Broadcaster } from '../ports/project-event';
import type { ProjectService } from '../service/project.service';
import type {
  SavedPlanService,
  SavedPlanSideRef,
  SavedPlanTouchResult,
} from '../service/saved-plan.service';
import { UnknownSavedPlanBodyVersionError } from '../service/saved-plan-integrity';
import { SavedPlanWriteError, savePlan } from '../use-cases/save-plan';
import { bind, EMPTY, type HttpReply, type RequestFailure } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/**
 * The reserved current sentinel names the live plan in the addressed project.
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
 * Classifies only the named service operation; project lookups and announcements
 * are outside this catch because their failures say nothing about stored plan versions.
 * Proof: broad handler catches returned501 instead of500 independently for project
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
function touchRefusal(outcome: Exclude<SavedPlanTouchResult['outcome'], 'touched'>) {
  switch (outcome) {
    case 'forbidden':
      return { ok: false, status: 403, body: { error: outcome } } as const;
    case 'not_found':
      return { ok: false, status: 404, body: { error: outcome } } as const;
    case 'snapshot_busy':
      return { ok: false, status: 503, body: { error: outcome } } as const;
  }
}

/**
 * Six saved-plan operations. Saves use project write access; rename/delete defer
 * to the service's creator-or-owner rule. Actor identity comes from policy admission.
 * Successful mutations announce only after the service commits and releases its
 * turn, through the process's own broadcaster — a saved plan is never part of
 * a batch, so nothing collects its event. Refusals publish nothing.
 */
/**
 * Every saved-plan route resolves organization access before any lookup. A
 * route addressed by a project reads it through the caller's access; one
 * addressed by a saved plan checks the plan's project the same way, so a
 * foreign plan answers exactly as an absent one. Under scoped access only a
 * writing role may rename or delete.
 *
 * Proof: bypassing the resolution in the save route made `refuses an unbound
 * session and a removed member before any lookup` in
 * `saved-plan-organization.controller.db.test.ts` answer 201; watched
 * 2026-09-27.
 */
export function savedPlanRoutes(
  plans: SavedPlanService,
  projects: ProjectService,
  announcements: Broadcaster,
  organizations: OrganizationAccess,
) {
  /**
   * Whether the caller's access reaches the saved plan's project; false alike
   * for an absent plan and a foreign one.
   *
   * Proof: answering true without the project check made `answers a foreign
   * saved plan exactly as an absent one` in
   * `saved-plan-organization.controller.db.test.ts` read B's plan; watched
   * 2026-09-27.
   */
  const reachesPlan = async (savedPlanId: string, access: ResourceAccess): Promise<boolean> => {
    if (access.kind === 'legacy') return true;
    const projectId = await plans.projectOf(savedPlanId);
    return projectId !== null && (await projects.readWithin(projectId, access)) !== null;
  };
  /**
   * Why the caller may not rename or delete a saved plan at all: no
   * organization authority, a plan the organization does not own (the same 404
   * as an absent one), or a viewer's role.
   *
   * Proof: skipping the role check made `refuses a viewer every saved-plan
   * write and lets the viewer read` in
   * `saved-plan-organization.controller.db.test.ts` answer 200 for the
   * viewer's rename of a plan the viewer created; watched 2026-09-27.
   */
  const refuseTouch = async (savedPlanId: string, principal: OrganizationPrincipal) => {
    const resolved = await organizations.resolve(principal);
    if (!resolved.ok) return organizationRefusal(resolved.refusal);
    if (!(await reachesPlan(savedPlanId, resolved.access)))
      return { ok: false, status: 404, body: { error: 'not_found' } } as const;
    if (resolved.access.kind === 'scoped' && !canWriteInOrganization(resolved.access.scope.role))
      return { ok: false, status: 403, body: { error: 'forbidden' } } as const;
    return null;
  };
  return [
    bind(
      savePlanShape,
      async ({ params, body, principal }): Promise<HttpReply<typeof savePlanShape>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        let outcome;
        try {
          outcome = await savePlan(
            { plans, projects, announcements },
            { projectId: params.id, actor: principal, name: body.name, access: resolved.access },
          );
        } catch (error) {
          if (!(error instanceof SavedPlanWriteError)) throw error;
          return versionRefusal(error.writeCause);
        }
        switch (outcome.outcome) {
          case 'saved':
            return { ok: true, status: 201, body: { savedPlan: outcome.record } };
          case 'no_project':
          case 'not_found':
            return { ok: false, status: 404, body: { error: 'not_found' } };
          case 'forbidden':
            return { ok: false, status: 403, body: { error: 'forbidden' } };
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
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        // Proof: reading the project unscoped here, and separately in the
        // compare route, made `answers 404 alike for a foreign and an absent
        // project on every saved-plan and history route` in
        // `saved-plan-organization.controller.db.test.ts` answer 200 with B's
        // plans; watched 2026-09-27.
        if ((await projects.readWithin(params.id, resolved.access)) === null)
          return { ok: false, status: 404, body: { error: 'not_found' } };
        const called = await callSavedPlan(() => plans.list(params.id));
        if (!called.ok) return called;
        return { ok: true, status: 200, body: { savedPlans: [...called.value] } };
      },
    ),
    bind(
      compareSavedPlans,
      async ({ params, query, principal }): Promise<HttpReply<typeof compareSavedPlans>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        if ((await projects.readWithin(params.id, resolved.access)) === null)
          return { ok: false, status: 404, body: { error: 'not_found' } };
        const called = await callSavedPlan(() =>
          plans.compare(params.id, sideRef(query.left), sideRef(query.right)),
        );
        if (!called.ok) return called;
        const outcome = called.value;
        switch (outcome.outcome) {
          case 'compared':
            return {
              ok: true,
              status: 200,
              body: {
                diff: {
                  input: [...outcome.diff.input],
                  schedule: [...outcome.diff.schedule],
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
          case 'no_project':
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
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      if (!(await reachesPlan(params.id, resolved.access)))
        return { ok: false, status: 404, body: { error: 'not_found' } };
      const called = await callSavedPlan(() => plans.read(params.id));
      if (!called.ok) return called;
      const outcome = called.value;
      switch (outcome.outcome) {
        case 'read':
          return { ok: true, status: 200, body: { savedPlan: outcome.plan } };
        case 'not_found':
          return { ok: false, status: 404, body: { error: 'not_found' } };
        case 'corrupt':
          return { ok: false, status: 422, body: { error: 'corrupt', refusal: outcome.refusal } };
      }
    }),
    bind(
      renameSavedPlan,
      async ({ params, body, principal }): Promise<HttpReply<typeof renameSavedPlan>> => {
        const refused = await refuseTouch(params.id, principal);
        if (refused !== null) return refused;
        const called = await callSavedPlan(() => plans.rename(params.id, principal.id, body.name));
        if (!called.ok) return called;
        const outcome = called.value;
        if (outcome.outcome !== 'touched') return touchRefusal(outcome.outcome);
        await announcements.publish(outcome.projectId, { type: 'saved_plans_changed' });
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
        const called = await callSavedPlan(() => plans.delete(params.id, principal.id));
        if (!called.ok) return called;
        const outcome = called.value;
        if (outcome.outcome !== 'touched') return touchRefusal(outcome.outcome);
        await announcements.publish(outcome.projectId, { type: 'saved_plans_changed' });
        return { ok: true, status: 204, body: EMPTY };
      },
    ),
  ] as const;
}
