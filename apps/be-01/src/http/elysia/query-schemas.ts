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
/**
 * The compare route's two sides — and the **one** query schema in this app that
 * does refuse, which is why it needs a paragraph of its own.
 *
 * `left` and `right` are required non-empty strings, and Elysia validated them
 * before the handler ran. Everywhere else on this branch a refusal the
 * framework performed was moved into the handler, because a refusal the
 * framework performs is a refusal that vanishes with the framework
 * (`step.routes.ts`, and the body check that inverted to 17/0 green). This one
 * could not be moved, and the attempt is worth recording rather than repeating:
 *
 * **Hand-written `detail.parameters` do not survive.** Writing the two out as
 * an OpenAPI parameter array on the route's `documentation.detail` — the
 * `handParsedBody` move, one level up — and regenerating produced a compare
 * operation carrying **only the derived `id` path parameter**. Elysia replaces
 * the array wholesale, so the document would have lost both query parameters,
 * which is an API description that lies. Measured on h2puni, 2026-09-05.
 *
 * So the schema stays, byte-identical to what the old instance's `query` hook
 * produced, and `saved-plan.routes.ts` **also** checks the two by hand. That
 * second check is not redundant: under `bindElysia` the framework refuses first
 * and the handler's check never runs — deleting it left the suite at 29 pass /
 * 0 fail, which is how that was established rather than assumed — and under any
 * binder that ignores this schema it is the only thing between an absent `left`
 * and a lookup for a saved plan whose id is `undefined`. The two answer the same
 * 422 with different bodies. That divergence is real, it is the same class as
 * the trailing slash the branch already owes a decision on, and it is written
 * down here rather than closed by keeping only one of the two.
 */
export const COMPARE_QUERY = t.Object({
  left: t.String({ minLength: 1 }),
  right: t.String({ minLength: 1 }),
});

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
