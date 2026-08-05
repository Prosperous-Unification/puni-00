import { Elysia } from 'elysia';

import { userFromHeaders } from '../middleware/authenticated';
import type { AuthService } from '../service/auth.service';
import type {
  CreateWorkItem,
  DeleteStrategy,
  MoveWorkItem,
  WorkItemRefusal,
  WorkItemService,
} from '../service/work-item.service';

/**
 * These routes validate their bodies by hand rather than with an Elysia schema.
 *
 * The reason is a rule the schema cannot express here: a request that carries a
 * `number` must be *refused*, and Elysia strips unknown properties before the
 * handler runs — so the same check written after `{ body: t.Object(...) }` never
 * fires and reads as though it works. Numbers are derived, and a client sending
 * one is working from an assumption this API does not hold; accepting and
 * ignoring it would let that assumption survive until the number silently moved.
 */
class BadRequest extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null) throw new BadRequest('expected_object');
  return body as Record<string, unknown>;
}

function refuseDerivedFields(body: Record<string, unknown>): void {
  if ('number' in body || 'frozenNumber' in body) throw new BadRequest('number_is_derived');
}

function asIdOrNull(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new BadRequest(`${field}_must_be_id_or_null`);
  return value;
}

function asOptionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new BadRequest(`${field}_must_be_text`);
  return value;
}

function parseCreate(body: unknown): CreateWorkItem {
  const raw = asRecord(body);
  refuseDerivedFields(raw);
  return {
    parentId: asIdOrNull(raw['parentId'], 'parentId'),
    afterId: asIdOrNull(raw['afterId'], 'afterId'),
    name: asOptionalText(raw['name'], 'name'),
    notes: asOptionalText(raw['notes'], 'notes'),
  };
}

function parseMove(body: unknown): MoveWorkItem {
  const raw = asRecord(body);
  return {
    parentId: asIdOrNull(raw['parentId'], 'parentId'),
    afterId: asIdOrNull(raw['afterId'], 'afterId'),
  };
}

function parsePatch(body: unknown): { name?: string; notes?: string } {
  const raw = asRecord(body);
  refuseDerivedFields(raw);
  return {
    name: asOptionalText(raw['name'], 'name'),
    notes: asOptionalText(raw['notes'], 'notes'),
  };
}

/**
 * `cycle` is 409 rather than 400: the request is well formed and would be legal
 * against a different tree, so it conflicts with the current state rather than
 * being malformed. `strategy_required` is 400 — that request is incomplete.
 */
const statusFor = (reason: WorkItemRefusal): number =>
  reason === 'forbidden' ? 403 : reason === 'not_found' ? 404 : reason === 'cycle' ? 409 : 400;

const isStrategy = (value: string | null): value is DeleteStrategy =>
  value === 'cascade' || value === 'promote';

export function workItemController(auth: AuthService, workItems: WorkItemService) {
  return new Elysia({ prefix: '/api' })
    .onError(({ error, set }) => {
      if (error instanceof BadRequest) {
        set.status = 400;
        return { error: error.reason };
      }
      return undefined;
    })
    .get('/projects/:id/work-items', async ({ params, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      const tree = await workItems.tree(params.id);
      if (tree === null) {
        set.status = 404;
        return { error: 'not_found' };
      }
      return tree;
    })
    .post('/projects/:id/work-items', async ({ params, body, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      const outcome = await workItems.create(params.id, user.id, parseCreate(body));
      if (!outcome.ok) {
        set.status = statusFor(outcome.reason);
        return { error: outcome.reason };
      }
      return outcome.result;
    })
    .patch('/work-items/:id', async ({ params, body, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      const outcome = await workItems.patch(params.id, user.id, parsePatch(body));
      if (!outcome.ok) {
        set.status = statusFor(outcome.reason);
        return { error: outcome.reason };
      }
      return outcome.result;
    })
    .post('/work-items/:id/move', async ({ params, body, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      const outcome = await workItems.move(params.id, user.id, parseMove(body));
      if (!outcome.ok) {
        set.status = statusFor(outcome.reason);
        return { error: outcome.reason };
      }
      return { moved: true };
    })
    .delete('/work-items/:id', async ({ params, request, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      // Read from the URL rather than Elysia's `query`, which types every value
      // as present — a request without `?strategy=` genuinely has none, and that
      // absence is what `strategy_required` exists to catch.
      const requested = new URL(request.url).searchParams.get('strategy');
      // An unrecognised strategy is refused rather than read as absent: the
      // caller asked for something specific, and cascade and promote destroy
      // different work.
      if (requested !== null && !isStrategy(requested)) {
        set.status = 400;
        return { error: 'unknown_strategy' };
      }
      const outcome = await workItems.remove(
        params.id,
        user.id,
        isStrategy(requested) ? requested : null,
      );
      if (!outcome.ok) {
        set.status = statusFor(outcome.reason);
        return { error: outcome.reason };
      }
      return { deleted: true };
    });
}
