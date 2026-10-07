import { readHistory } from '@wbs/contracts';

import type { HistoryService } from '../module/plan-history/plan-history.feature';
import type { ProjectService } from '../module/project/project.resource';
import type { OrganizationAccess } from '../ports/organization-access';
import type { PlanEventFilter } from '../ports/plan-event-store';
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
 * Binds authenticated history reads while the service owns absent-project semantics.
 * Proof: returning an empty success for not_found makes history.routes.test.ts's
 * literal request receive200/events instead of404/error.
 */
/**
 * A project's history through the caller's access: a foreign project answers
 * the same 404 as an absent one, before any event is read.
 * Proof: reading the history without the project check made `answers 404
 * alike for a foreign and an absent project on every saved-plan and history
 * route` in `saved-plan-organization.controller.db.test.ts` answer 200 with
 * B's events; watched 2026-09-27.
 */
export function historyRoutes(
  history: HistoryService,
  projects: ProjectService,
  organizations: OrganizationAccess,
) {
  return [
    bind(
      readHistory,
      async ({ params, query, principal }): Promise<HttpReply<typeof readHistory>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        if ((await projects.readWithin(params.id, resolved.access)) === null)
          return { ok: false, status: 404, body: { error: 'not_found' } };
        const outcome = await history.read(params.id, filterFrom(query));
        return outcome.ok
          ? { ok: true, status: 200, body: { events: outcome.value } }
          : { ok: false, status: 404, body: { error: outcome.reason } };
      },
    ),
  ] as const;
}
