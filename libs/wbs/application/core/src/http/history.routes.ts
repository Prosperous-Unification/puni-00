import { readHistory } from '@wbs/contracts';

import type { OrganizationAccess } from '../ports/organization-access';
import type { PlanEventFilter } from '../ports/plan-event-store';
import type { WorkPackageObservation } from '../ports/work-package-observation';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/**
 * What the query string narrows the history to.
 *
 * Both parameters are optional and their absence is "everything", which is the
 * only reading a history route can have: a client that has not chosen a filter is
 * asking for the plan's history.
 *
 * `?kind=` takes a comma-separated list, so "the history of estimate changes" is
 * one request — `?kind=estimate,clear_estimate` — rather than two the client has
 * to merge and re-sort. Blank segments are dropped, and a list that names nothing
 * at all (`?kind=`) is therefore no filter rather than a filter nothing satisfies:
 * a request with an empty parameter must not answer as though the plan had no
 * history.
 *
 * An unrecognised kind is **not** refused. `plan_event.kind` is a string and not
 * an enumeration so that H2's `actual` needs no migration, so there is no closed
 * set here to check a name against; a kind nothing was recorded under answers
 * nothing, which is literally true of the history.
 */
function filterFrom(query: { workItemId?: string; kind?: string }): PlanEventFilter {
  const workItemId = query.workItemId;
  const kinds = (query.kind ?? '')
    .split(',')
    .map((each) => each.trim())
    .filter((each) => each !== '');
  return {
    ...(workItemId === undefined || workItemId === '' ? {} : { workItemId }),
    ...(kinds.length === 0 ? {} : { kinds }),
  };
}

/**
 * Projects current history admission and events from one committed observation.
 * Empty readable history succeeds; an absent or invisible package answers the same 404.
 * Complete caller evidence and the parsed filter are retained before initial admission.
 * The following Proof notes record the earlier raw-service route controls; current authority
 * and event decoding now belong to WorkPackageObservation.readHistory.
 *
 * Proof: returning an empty success for not_found makes history.routes.test.ts's
 * literal request receive200/events instead of404/error.
 *
 * Proof: reading the history without the work package check made `answers 404
 * alike for a foreign and an absent workPackage on every saved-plan and history
 * route` in `saved-plan-organization.controller.db.test.ts` answer 200 with
 * B's events; watched 2026-09-27.
 * @throws on unknown observation or trusted-history failures; modeled context refusals remain typed.
 */
export function historyRoutes(
  observation: WorkPackageObservation,
  organizations: OrganizationAccess,
) {
  return [
    bind(
      readHistory,
      async ({ params, query, principal }): Promise<HttpReply<typeof readHistory>> => {
        // Proof: R1, aliasing the route principal changed the held capture’s nested authentication, scopes and binding (2/2/2).
        // `retains the nested history caller and parsed filter before initial organization resolution waits`.
        // Composite nested retention only; bind masks top-level ID mutation. No per-field, shared binding or HTTP transport proof. Watched 2026-11-14.
        const retained = structuredClone(principal);
        // Proof: R2, moving filter parsing after initial resolution captured the changed query instead of its original values (2/2/2).
        // `retains the nested history caller and parsed filter before initial organization resolution waits`.
        // Local declaration timing only; parser internals, independent fields, shared binding and current authority are uncredited. Watched 2026-11-14.
        const filter = filterFrom(query);
        const resolved = await organizations.resolve(retained);
        if (!resolved.ok) return organizationRefusal(resolved);
        const observed = await observation.readHistory(
          // Proof: R3, replacing resolved expected access with legacy changed the held route capture to legacy (2/2/2).
          // `retains the nested history caller and parsed filter before initial organization resolution waits`.
          // Local expected-access forwarding only; no fresh authority, shared resolver or HTTP serialization proof. Watched 2026-11-14.
          { kind: 'human', principal: retained, expectedAccess: resolved.access },
          params.id,
          filter,
        );
        // Proof: R4, omitting later refusal forwarding returned direct 200/events undefined instead of the typed 409 refusal (4/3/4).
        // `forwards initial history refusal without observing and the later current refusal exactly`.
        // Direct collaborator reply only; initial403/zero-call controls passed, final call count was unreached. No HTTP/compiler-negative proof. Watched 2026-11-14.
        if (!observed.ok) return organizationRefusal(observed);
        // Proof: R5, omitting observed-null mapping returned direct 200/events null instead of modeled404 (1/1/1).
        // `returns the modeled missing-work-package refusal from a literal history request`.
        // Local protocol-double reply mapping only; no repository, historical raw-service or HTTP serialization proof. Watched 2026-11-14.
        if (observed.value === null)
          return { ok: false, status: 404, body: { error: 'not_found' } };
        return { ok: true, status: 200, body: { events: observed.value } };
      },
    ),
  ] as const;
}
