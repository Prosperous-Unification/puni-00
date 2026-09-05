import { t } from 'elysia';

/**
 * The query schemas the OpenAPI document is built from, in the framework's own
 * dialect, next to the binder that speaks it.
 *
 * They live here rather than in the route module for one measured reason: a
 * plain JSON Schema object in Elysia's `query` hook does not work. Written out
 * as `{ type: 'object', properties: … }` it failed six history route tests and
 * the committed-document diff — Elysia's validator needs TypeBox's `Kind`
 * symbol, which only `t` attaches, so the "documentation, not validation"
 * reading of these schemas is true of their *content* and not of their type.
 *
 * That makes them a binder concern, which is where a framework dialect belongs.
 * A binder that publishes no document imports none of this, and
 * `apps/be-01/src/controller` stays free of `elysia` — which is the acceptance
 * criterion this file exists to hold.
 */
export const HISTORY_QUERY = t.Object({
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
});
