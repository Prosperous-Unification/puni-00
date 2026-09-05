import type { DocumentDecoration } from 'elysia';

type RequestBodyDoc = NonNullable<DocumentDecoration['requestBody']>;
type BodySchema = NonNullable<
  Extract<RequestBodyDoc, { content: unknown }>['content'][string]['schema']
>;

/**
 * The sentence every hand-parsed body in this API needs, written once.
 *
 * Two routes parse their own bodies: `POST /api/projects/{id}/commands` and
 * `POST /api/directory/commands`. Since `plan-commands` every plan and directory
 * write arrives as a command inside one of them, parsed by the guards the single
 * routes used to hold — this comment named those six work-item writes, the
 * capacity PUT and the priority-band PUT for three releases after the last of
 * them was retired. `openapi-document.test.ts`'s `describes every hand-parsed
 * body without declaring it` is the list that cannot go stale, because it reads
 * the document.
 *
 * The reason is on each parse function and it is the same reason: Elysia strips
 * unknown properties before a handler runs, so a
 * guard written after `{ body: t.Object(...) }` never sees the field it refuses
 * and reads as though it works. `number_is_derived`, the priority floor and the
 * parallelism range are all guards this repo has watched fail under injection;
 * declaring these bodies to Elysia would delete them silently.
 *
 * So the schema in the document is **documentation**. Saying so out loud is the
 * point: a reader who takes it for the validator will send a field this API
 * refuses and read the 400 as a fault in the API.
 *
 * **Under `http/elysia/` and not `openapi/`, because of the one import at the
 * top.** `DocumentDecoration` is a type-only import — it costs nothing at run
 * time — and it still fails the grep acceptance criterion #1 names,
 * `git grep -l "from 'elysia'" apps/be-01/src`. The type is Elysia's shape for
 * a route's `detail`, so the file belongs beside the binder that speaks that
 * dialect, next to `query-schemas.ts`, which moved here for the same reason.
 * The alternative — restating `DocumentDecoration`'s inner shape structurally
 * in a framework-free file — would be a copy of a type this app does not own,
 * silently right until Elysia changes it.
 */
const PARSED_BY_HAND =
  'The schema here is documentation, not validation. This route parses its own ' +
  'body so that a field this API derives is refused rather than quietly ' +
  'dropped, which is what an Elysia body schema would do to it. Fields not ' +
  'named here are ignored; the ones named are checked, and a bad one answers ' +
  '400 with a code from the list above.';

/**
 * A documented request body for a route that validates itself.
 *
 * The prose comes first and the caveat last, because a reader who stops early
 * should still have read what the fields mean.
 */
export function handParsedBody(description: string, schema: BodySchema): RequestBodyDoc {
  return {
    required: true,
    description: `${description}\n\n${PARSED_BY_HAND}`,
    content: { 'application/json': { schema } },
  };
}
