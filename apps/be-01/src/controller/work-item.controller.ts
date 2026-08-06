import { ThreePointEstimate } from '@wbs/domain';
import { isIsoDate, type IsoDate } from '@wbs/domain';
import { parseOrThrow, ValidationError } from '@wbs/validation';
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

/**
 * A calendar day, `null` to clear the constraint, or absent to leave it.
 *
 * Validated here rather than trusted: the column is text, and a date the
 * scheduler cannot parse would throw on every later read of the project — a
 * 422 on one request beats a plan nobody can open.
 */
function asOptionalDate(value: unknown, field: string): IsoDate | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isIsoDate(value)) throw new BadRequest(`${field}_must_be_a_date`);
  return value;
}

function parsePatch(body: unknown): {
  name?: string;
  notes?: string;
  startNoEarlierThan?: IsoDate | null;
  serviceTeamId?: string | null;
} {
  const raw = asRecord(body);
  refuseDerivedFields(raw);
  return {
    name: asOptionalText(raw['name'], 'name'),
    notes: asOptionalText(raw['notes'], 'notes'),
    startNoEarlierThan: asOptionalDate(raw['startNoEarlierThan'], 'startNoEarlierThan'),
    serviceTeamId:
      'serviceTeamId' in raw ? asIdOrNull(raw['serviceTeamId'], 'serviceTeamId') : undefined,
  };
}

/**
 * `cycle` is 409 rather than 400: the request is well formed and would be legal
 * against a different tree, so it conflicts with the current state rather than
 * being malformed. `strategy_required` is 400 — that request is incomplete.
 */
const statusFor = (reason: WorkItemRefusal): number =>
  reason === 'forbidden'
    ? 403
    : reason === 'not_found'
      ? 404
      : reason === 'cycle' || reason === 'frozen' || reason === 'rolled_up' || reason === 'ancestor'
        ? 409
        : 400;

const isStrategy = (value: string | null): value is DeleteStrategy =>
  value === 'cascade' || value === 'promote';

export function workItemController(auth: AuthService, workItems: WorkItemService) {
  return new Elysia({ prefix: '/api' })
    .onError(({ error, set }) => {
      if (error instanceof BadRequest) {
        set.status = 400;
        return { error: error.reason };
      }
      // The shared schema's refusal is a 400 here rather than a 500: the two
      // tiers validate with the same arktype schema, so this is a client that
      // bypassed fe-01 rather than a fault in either.
      if (error instanceof ValidationError) {
        set.status = 400;
        return { error: 'invalid_estimate' };
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
    .put('/work-items/:id/assignees/:roleId', async ({ params, body, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      // `null` clears the assignment; anything else must be an id. A person
      // who is not in the directory is refused by the foreign key rather than
      // by a lookup here, which two concurrent requests could both pass.
      const raw = asRecord(body);
      const personId = asIdOrNull(raw['personId'], 'personId');
      const outcome = await workItems.assign(params.id, user.id, params.roleId, personId);
      if (!outcome.ok) {
        set.status = statusFor(outcome.reason);
        return { error: outcome.reason };
      }
      return { assigned: true };
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
    .post('/projects/:id/freeze', async ({ params, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      const outcome = await workItems.freeze(params.id, user.id);
      if (!outcome.ok) {
        set.status = statusFor(outcome.reason);
        return { error: outcome.reason };
      }
      return { frozen: true };
    })
    .post('/projects/:id/unfreeze', async ({ params, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      const outcome = await workItems.unfreezeProject(params.id, user.id);
      if (!outcome.ok) {
        set.status = statusFor(outcome.reason);
        return { error: outcome.reason };
      }
      return { unfrozen: true };
    })
    .post('/work-items/:id/dependencies', async ({ params, body, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      // Parsed by hand rather than through Elysia's `body` schema: Elysia strips
      // unknown properties before the handler, so a typo'd field name would
      // arrive as an absent one and the route would answer 200 having done
      // nothing. The same reason the create route parses its own body.
      const parsed: unknown = body;
      const predecessorId =
        typeof parsed === 'object' && parsed !== null && 'predecessorId' in parsed
          ? parsed.predecessorId
          : undefined;
      if (typeof predecessorId !== 'string' || predecessorId === '') {
        set.status = 400;
        return { error: 'predecessor_required' };
      }
      const outcome = await workItems.addDependency(params.id, user.id, predecessorId);
      if (!outcome.ok) {
        set.status = statusFor(outcome.reason);
        return { error: outcome.reason };
      }
      return { ok: true };
    })
    .delete('/work-items/:id/dependencies/:predecessorId', async ({ params, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      const outcome = await workItems.removeDependency(params.id, user.id, params.predecessorId);
      if (!outcome.ok) {
        set.status = statusFor(outcome.reason);
        return { error: outcome.reason };
      }
      return { ok: true };
    })
    .post('/work-items/:id/unfreeze', async ({ params, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      const outcome = await workItems.unfreeze(params.id, user.id);
      if (!outcome.ok) {
        set.status = statusFor(outcome.reason);
        return { error: outcome.reason };
      }
      return { unfrozen: true };
    })
    .put('/work-items/:id/estimates/:roleId', async ({ params, body, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      const days = parseOrThrow(ThreePointEstimate, body);
      const outcome = await workItems.setEstimate(params.id, user.id, params.roleId, days);
      if (!outcome.ok) {
        set.status = statusFor(outcome.reason);
        return { error: outcome.reason };
      }
      return { estimated: true };
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
