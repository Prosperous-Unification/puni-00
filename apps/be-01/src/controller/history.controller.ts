import { Elysia, t } from 'elysia';

import { userFromHeaders } from '../middleware/authenticated';
import type { PlanEventFilter } from '../repository';
import type { AuthService } from '../service/auth.service';
import type { HistoryService } from '../service/history.service';

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
function filterFrom(query: Record<string, string | undefined>): PlanEventFilter {
  const workItemId = query['workItemId'];
  const kinds = (query['kind'] ?? '')
    .split(',')
    .map((each) => each.trim())
    .filter((each) => each !== '');
  return {
    ...(workItemId === undefined || workItemId === '' ? {} : { workItemId }),
    ...(kinds.length === 0 ? {} : { kinds }),
  };
}

/**
 * One plan's history: every command anybody ran on it, newest first.
 *
 * **A route of its own rather than a field on the plan's payload**, which is where
 * the capacities and the ladder ride. The reasoning that put those there is the
 * reasoning that keeps this out: they are read *with* the dates computed from
 * them, and a second request would be a second moment. The history is neither —
 * nothing on screen is stale because somebody's edit was recorded, and a plan
 * edited all week would put a thousand rows nobody asked for into every tree read.
 *
 * Registered beside `capacityController` and `priorityBandController` for their
 * reason: it shares `projectController`'s prefix, `/:id/history` cannot be
 * shadowed by anything that route declares, and adjacency is what makes that
 * checkable at a glance.
 *
 * Open to every authenticated account, like every other read. `HistoryService`
 * owns the absent-project answer so there is one copy of the rule.
 */
export function historyController(auth: AuthService, history: HistoryService) {
  return new Elysia({ prefix: '/api/projects' }).get(
    '/:id/history',
    async ({ params, query, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      const outcome = await history.read(params.id, filterFrom(query));
      if (!outcome.ok) {
        set.status = 404;
        return { error: outcome.reason };
      }
      return { events: outcome.result };
    },
    {
      // Declared as a schema rather than left to the handler's raw `query`, which
      // is how `?cascade=true` is read two controllers over. The reason is the
      // committed document: Elysia derives a route's parameters from the route
      // and from this, and **replaces** anything hand-written in `detail`, so a
      // query string described only in prose would be a document that omits half
      // the contract. Both are optional strings and neither is refused — the
      // parsing that gives them meaning is `filterFrom`, and its readings are
      // deliberately not 400s.
      query: t.Object({
        workItemId: t.Optional(
          t.String({
            description:
              'One work item’s own events. Absent is every item’s, and the plan-wide events with them.',
          }),
        ),
        kind: t.Optional(
          t.String({
            description:
              'Comma-separated kinds to keep — `estimate,clear_estimate` is the history of estimate changes. Absent, or naming nothing, is every kind. An unrecognised kind answers nothing rather than 400.',
          }),
        ),
      }),
      detail: {
        summary: 'One plan’s history — every command run on it, newest first',
        description: `The plan's own record, per **project** and not per account: two people editing one
plan produce two undo stacks and one history. It is append-only, it is not pruned
by anybody's undo, and events older than 365 days are removed by the retention
sweep. Snapshots, when they exist, are the permanent record; this is the recent one.

\`?workItemId=\` narrows to one row's own events. \`?kind=\` takes a comma-separated
list — \`?kind=estimate,clear_estimate\` is "the history of estimate changes".
Both absent is everything. A kind nothing was recorded under answers nothing
rather than 400: the column is a string so that later kinds need no migration.

\`before\` and \`after\` are the compensating and forward commands as they were
journalled, so an \`estimate\` event carries the trio that was stored and the trio
that replaced it. **Undo and redo record nothing**: they flip a journal entry in
place, so an estimate set and then undone leaves the event that set it and no
event taking it back. Every event is true about its own moment; the sequence is
incomplete, deliberately, until that is decided.

A project this account cannot see does not exist to it — \`not_found\`, 404. An
empty \`events\` array is a plan nobody has edited, which is not the same answer.`,
      },
    },
  );
}
