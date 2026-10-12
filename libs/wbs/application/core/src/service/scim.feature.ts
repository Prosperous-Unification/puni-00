import type { Clock } from '../ports/clock';
import type { AuditedAct } from '../ports/organization-audit';
import type { AuthenticatedProvisioning, ProvisioningTokens } from '../ports/provisioning-tokens';
import type {
  ScimRefusal,
  ScimUser,
  ScimUserChange,
  ScimUserFilter,
  ScimUsers,
} from '../ports/scim-users';
import { digestProvisioningSecret, PROVISIONING_SECRET } from './provisioning-secret';
import type { ScimAdmission } from './scim-admission';

export const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const SCIM_PATCH_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
export const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

/** The media type of every SCIM response body (RFC 7644 §3.1). */
export const SCIM_MEDIA = 'application/scim+json';

/** The most body bytes a SCIM request may carry; a Users resource is a few hundred. */
export const SCIM_MOST_BODY_BYTES = 64 * 1024;

/**
 * One SCIM request as the HTTP adapter presents it. The body is read only
 * through `readBody`, which the service calls after the bearer token and its
 * admission passed, so an unauthenticated caller can make the server buffer
 * nothing. It answers the raw text, or null when it exceeded
 * {@link SCIM_MOST_BODY_BYTES} (read no further).
 */
export interface ScimRequest {
  readonly method: string;
  readonly url: URL;
  readonly authorization: string | null;
  readonly contentType: string | null;
  readonly readBody: () => Promise<string | null>;
}

/** One SCIM answer: a JSON text body, or null for 204. */
export interface ScimReply {
  readonly status: number;
  readonly headers: readonly (readonly [string, string])[];
  readonly body: string | null;
}

/** What {@link ScimService} answers through. */
export interface ScimDependencies {
  readonly tokens: Pick<ProvisioningTokens, 'authenticate'>;
  readonly users: ScimUsers;
  readonly admission: Pick<ScimAdmission, 'admit'>;
  readonly clock: Pick<Clock, 'now'>;
  /** Lowercase local part and lowercase ASCII IDNA domain, or null for a non-address. */
  readonly canonicalUserName: (raw: string) => string | null;
  readonly newId: () => string;
  /** The public origin a resource's `meta.location` is built on. */
  readonly origin: string;
}

type ScimType =
  'invalidFilter' | 'invalidSyntax' | 'invalidPath' | 'invalidValue' | 'mutability' | 'uniqueness';

const headers = [
  ['content-type', SCIM_MEDIA],
  ['cache-control', 'no-store'],
] as const;

function scimError(status: number, scimType: ScimType | null, detail: string): ScimReply {
  return {
    status,
    headers,
    body: JSON.stringify({
      schemas: [SCIM_ERROR_SCHEMA],
      status: String(status),
      ...(scimType === null ? {} : { scimType }),
      detail,
    }),
  };
}

function json(status: number, body: unknown, extra: readonly (readonly [string, string])[] = []) {
  return { status, headers: [...headers, ...extra], body: JSON.stringify(body) };
}

/**
 * The one answer for a missing, malformed, unknown, expired or revoked token
 * and for a deployment before activation: the same bytes for all of them, and
 * no organization named.
 */
const UNAUTHENTICATED: ScimReply = {
  ...scimError(401, null, 'unauthenticated'),
  headers: [...headers, ['www-authenticate', 'Bearer']],
};

const LAST_SUPER_ADMIN =
  'last_super_admin: this user is the organization’s only super-admin, so deprovisioning would ' +
  'leave it without an owner. Make another member a super-admin first; an organization whose ' +
  'owner is gone is recovered through the ownerless-organization path in ' +
  'organization-ownership-and-access design.md ("Ownership and roles").';

const NOT_FOUND = scimError(404, null, 'not_found');
const UNSUPPORTED = scimError(501, null, 'not_implemented');

const USER_ATTRIBUTE_PREFIX = `${SCIM_USER_SCHEMA.toLowerCase()}:`;

/** A filter this subset answers; anything else is `501`. */
const FILTER = /^\s*(userName|externalId)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i;

/**
 * The SCIM 2.0 Users subset (`organization-scim`): RFC 7644 resources,
 * list responses, PATCH and errors over {@link ScimUsers}, for the
 * organization a provisioning token alone selects.
 *
 * Order per request: authenticate (one {@link UNAUTHENTICATED} answer for
 * every failure), then per-token admission (`429` with `Retry-After`, no
 * effect), then the operation. PUT, any other method, filter, query
 * parameter or resource answers `501`. Every write is audited as
 * `scim:<token id>` and stamped by the token's issuing super-admin.
 *
 * Interoperability choices: request bodies are accepted as
 * `application/scim+json` or `application/json`; `active` absent on POST is
 * true (RFC 7643 §4.1.1); a PATCH `active` value of `"true"`/`"false"` (any
 * case) is read as the boolean, as Microsoft Entra sends it; a pathless
 * replace may repeat the target's own `id`.
 */
export class ScimService {
  constructor(private readonly deps: ScimDependencies) {}

  /** @throws when a store throws; the adapter answers that as a SCIM `500`. */
  async answer(request: ScimRequest): Promise<ScimReply> {
    const token = await this.authenticate(request.authorization);
    if (token === null) return UNAUTHENTICATED;
    const admitted = this.deps.admission.admit(token.tokenId);
    // Proof: skipping this refusal made mounted `answers the 301st request in
    // a rolling minute 429 with Retry-After and applies nothing` apply the
    // PATCH; watched 2026-10-12.
    if (!admitted.admitted)
      return {
        ...scimError(429, null, 'too_many_requests'),
        headers: [...headers, ['retry-after', String(admitted.retryAfterSeconds)]],
      };
    const route = /^\/scim\/v2\/Users(?:\/([^/]+))?$/.exec(request.url.pathname);
    if (route === null) return UNSUPPORTED;
    const segment = route.at(1);
    if (segment === undefined) {
      if (request.method === 'GET') return this.listUsers(token, request.url.searchParams);
      if (request.method === 'POST') return this.createUser(token, request);
      return UNSUPPORTED;
    }
    // Proof: decoding with a bare decodeURIComponent made mounted `reads one
    // user and answers an absent identifier 404` answer `%E0%A4%A` 500;
    // watched 2026-10-12.
    const id = decodedId(segment);
    if (id === null) return NOT_FOUND;
    if (request.url.search !== '') return UNSUPPORTED;
    if (request.method === 'GET') return this.readUser(token, id);
    // Proof: routing PUT to the PATCH handler made mounted `answers PUT,
    // other methods and other resources 501, changing nothing` answer 400
    // instead of 501; watched 2026-10-12.
    if (request.method === 'PATCH') return this.patchUser(token, id, request);
    if (request.method === 'DELETE') return this.deleteUser(token, id);
    return UNSUPPORTED;
  }

  private async authenticate(
    authorization: string | null,
  ): Promise<AuthenticatedProvisioning | null> {
    const presented = /^Bearer ([^\s]+)$/i.exec(authorization ?? '')?.[1];
    if (presented === undefined || !PROVISIONING_SECRET.test(presented)) return null;
    return this.deps.tokens.authenticate(
      await digestProvisioningSecret(presented),
      this.deps.clock.now(),
    );
  }

  private act(token: AuthenticatedProvisioning): AuditedAct {
    return {
      stamp: { at: this.deps.clock.now(), by: token.issuedBy },
      actor: `scim:${token.tokenId}`,
      auditId: crypto.randomUUID(),
    };
  }

  private resource(user: ScimUser) {
    return {
      schemas: [SCIM_USER_SCHEMA],
      id: user.id,
      userName: user.userName,
      ...(user.externalId === null ? {} : { externalId: user.externalId }),
      active: user.active,
      meta: {
        resourceType: 'User',
        created: new Date(user.createdAt).toISOString(),
        lastModified: new Date(user.updatedAt).toISOString(),
        location: this.location(user.id),
      },
    };
  }

  private location(id: string): string {
    return `${this.deps.origin}/scim/v2/Users/${encodeURIComponent(id)}`;
  }

  private async listUsers(
    token: AuthenticatedProvisioning,
    query: URLSearchParams,
  ): Promise<ScimReply> {
    const names = [...query.keys()];
    if (
      names.some((name) => !['filter', 'startIndex', 'count'].includes(name)) ||
      new Set(names).size !== names.length
    )
      return UNSUPPORTED;
    const rawFilter = query.get('filter');
    let filter: ScimUserFilter | null = null;
    if (rawFilter !== null) {
      const matched = FILTER.exec(rawFilter);
      // Proof: listing everyone for an unsupported filter made mounted
      // `answers any other filter or query parameter 501` answer 200;
      // watched 2026-10-12.
      if (matched === null) return UNSUPPORTED;
      const [, attribute = '', quoted = ''] = matched;
      let value: unknown;
      try {
        value = JSON.parse(`"${quoted}"`);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return scimError(400, 'invalidFilter', 'filter value is not a valid string');
      }
      if (typeof value !== 'string')
        throw new Error('a parsed JSON string literal was not a string');
      if (attribute.toLowerCase() === 'username') {
        // userName is case-insensitive (RFC 7643 §4.1.1): compare canonical forms.
        const userName = this.deps.canonicalUserName(value);
        if (userName === null) return json(200, listResponse([], 1));
        filter = { attribute: 'userName', value: userName };
      } else filter = { attribute: 'externalId', value };
    }
    const startIndex = whole(query.get('startIndex'));
    const count = whole(query.get('count'));
    if (startIndex === 'malformed' || count === 'malformed')
      return scimError(400, 'invalidValue', 'startIndex and count must be integers');
    const start = Math.max(1, startIndex ?? 1);
    const users = await this.deps.users.list(token.organizationId, filter);
    const page = users.slice(
      start - 1,
      count === null ? undefined : start - 1 + Math.max(0, count),
    );
    return json(200, {
      ...listResponse(
        page.map((user) => this.resource(user)),
        start,
      ),
      totalResults: users.length,
    });
  }

  private async createUser(
    token: AuthenticatedProvisioning,
    request: ScimRequest,
  ): Promise<ScimReply> {
    const parsed = await parseBody(request, SCIM_USER_SCHEMA);
    if (!parsed.ok) return parsed.reply;
    const { userName, externalId, active } = parsed.body;
    if (typeof userName !== 'string') return scimError(400, 'invalidValue', 'userName is required');
    const canonical = this.deps.canonicalUserName(userName);
    if (canonical === null)
      return scimError(400, 'invalidValue', 'userName is not an email address');
    if (externalId !== undefined && externalId !== null && typeof externalId !== 'string')
      return scimError(400, 'invalidValue', 'externalId must be a string');
    if (active !== undefined && typeof active !== 'boolean')
      return scimError(400, 'invalidValue', 'active must be a boolean');
    const provisioned = await this.deps.users.provision(
      token.organizationId,
      this.deps.newId(),
      { userName: canonical, externalId: externalId ?? null, active: active ?? true },
      this.act(token),
    );
    switch (provisioned.kind) {
      case 'invalid_value':
        return scimError(
          400,
          'invalidValue',
          'userName’s domain has no enterprise connection in this organization',
        );
      case 'uniqueness':
        return scimError(409, 'uniqueness', 'userName is already provisioned');
      case 'provisioned':
        return json(201, this.resource(provisioned.user), [
          ['location', this.location(provisioned.user.id)],
        ]);
    }
  }

  private async readUser(token: AuthenticatedProvisioning, id: string): Promise<ScimReply> {
    const user = await this.deps.users.find(token.organizationId, id);
    return user === null ? NOT_FOUND : json(200, this.resource(user));
  }

  private async patchUser(
    token: AuthenticatedProvisioning,
    id: string,
    request: ScimRequest,
  ): Promise<ScimReply> {
    const parsed = await parseBody(request, SCIM_PATCH_SCHEMA);
    if (!parsed.ok) return parsed.reply;
    const operations = parsed.body['Operations'] ?? parsed.body['operations'];
    if (!Array.isArray(operations) || operations.length === 0)
      return scimError(400, 'invalidSyntax', 'Operations must be a non-empty array');
    const change: { active?: boolean; externalId?: string | null; userName?: string } = {};
    for (const operation of operations) {
      const applied = this.applyOperation(change, operation, id);
      if (applied !== null) return applied;
    }
    const updated = await this.deps.users.update(
      token.organizationId,
      id,
      change satisfies ScimUserChange,
      this.act(token),
    );
    if (updated.kind === 'updated') return json(200, this.resource(updated.user));
    return refusal(updated.kind);
  }

  /** Folds one `replace` into `change`; a refusal reply when it is not one WBS supports. */
  private applyOperation(
    change: { active?: boolean; externalId?: string | null; userName?: string },
    operation: unknown,
    id: string,
  ): ScimReply | null {
    if (!isRecord(operation) || typeof operation['op'] !== 'string')
      return scimError(400, 'invalidSyntax', 'each operation needs an op');
    if (operation['op'].toLowerCase() !== 'replace')
      return scimError(400, 'invalidSyntax', `op ${operation['op']} is not supported`);
    const { path, value } = operation;
    if (path === undefined) {
      if (!isRecord(value))
        return scimError(400, 'invalidSyntax', 'a replace without a path needs an object value');
      for (const [key, entry] of Object.entries(value)) {
        if (key.toLowerCase() === 'id') {
          if (entry !== id) return scimError(400, 'mutability', 'id is read-only');
          continue;
        }
        const refused = this.assign(change, key, entry);
        if (refused !== null) return refused;
      }
      return null;
    }
    if (typeof path !== 'string') return scimError(400, 'invalidPath', 'path must be a string');
    return this.assign(change, path, value);
  }

  private assign(
    change: { active?: boolean; externalId?: string | null; userName?: string },
    path: string,
    value: unknown,
  ): ScimReply | null {
    const lowered = path.toLowerCase();
    const attribute = lowered.startsWith(USER_ATTRIBUTE_PREFIX)
      ? lowered.slice(USER_ATTRIBUTE_PREFIX.length)
      : lowered;
    switch (attribute) {
      case 'active': {
        const active =
          typeof value === 'boolean'
            ? value
            : typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())
              ? value.toLowerCase() === 'true'
              : null;
        if (active === null) return scimError(400, 'invalidValue', 'active must be a boolean');
        change.active = active;
        return null;
      }
      case 'externalid':
        if (value !== null && typeof value !== 'string')
          return scimError(400, 'invalidValue', 'externalId must be a string');
        change.externalId = value;
        return null;
      case 'username': {
        const userName = typeof value === 'string' ? this.deps.canonicalUserName(value) : null;
        if (userName === null)
          return scimError(400, 'invalidValue', 'userName is not an email address');
        change.userName = userName;
        return null;
      }
      default:
        return scimError(400, 'invalidPath', `path ${path} is not supported`);
    }
  }

  private async deleteUser(token: AuthenticatedProvisioning, id: string): Promise<ScimReply> {
    const removed = await this.deps.users.remove(token.organizationId, id, this.act(token));
    if (removed === 'deleted') return { status: 204, headers: [], body: null };
    return refusal(removed);
  }
}

function refusal(kind: ScimRefusal): ScimReply {
  switch (kind) {
    case 'not_found':
      return NOT_FOUND;
    case 'invalid_value':
      return scimError(
        400,
        'invalidValue',
        'userName’s domain has no enterprise connection in this organization',
      );
    case 'uniqueness':
      return scimError(409, 'uniqueness', 'userName is already provisioned');
    case 'mutability':
      return scimError(400, 'mutability', 'userName of a bound user cannot change');
    case 'last_super_admin':
      return scimError(409, 'mutability', LAST_SUPER_ADMIN);
  }
}

function listResponse(resources: readonly unknown[], startIndex: number) {
  return {
    schemas: [SCIM_LIST_SCHEMA],
    totalResults: resources.length,
    Resources: resources,
    startIndex,
    itemsPerPage: resources.length,
  };
}

/** An integer query value, absent as null; anything else is malformed. */
function whole(raw: string | null): number | null | 'malformed' {
  if (raw === null) return null;
  return /^-?\d{1,9}$/.test(raw) ? Number(raw) : 'malformed';
}

/** A path identifier, or null for percent-encoding no resource can carry. */
function decodedId(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The request body as a JSON object declaring `schema`, validated once at
 * this boundary; a SCIM `400 invalidSyntax` otherwise.
 */
async function parseBody(
  request: ScimRequest,
  schema: string,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; reply: ScimReply }> {
  const media = (request.contentType ?? '').split(';')[0]?.trim().toLowerCase();
  if (media !== SCIM_MEDIA && media !== 'application/json')
    return { ok: false, reply: scimError(400, 'invalidSyntax', 'unsupported media type') };
  const text = await request.readBody();
  if (text === null) return { ok: false, reply: scimError(413, null, 'body_too_large') };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { ok: false, reply: scimError(400, 'invalidSyntax', 'body is not JSON') };
  }
  if (!isRecord(body))
    return { ok: false, reply: scimError(400, 'invalidSyntax', 'body must be an object') };
  const schemas = body['schemas'];
  if (!Array.isArray(schemas) || !schemas.includes(schema))
    return { ok: false, reply: scimError(400, 'invalidSyntax', `schemas must include ${schema}`) };
  return { ok: true, body };
}
