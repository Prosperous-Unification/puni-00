import type { StandardSchemaV1 } from '@ark/schema';
import type {
  AuthenticatedUser,
  EmptyRefusalResponse,
  EmptyResponse,
  EndpointShape,
  ExpectedOrganization,
  ImportRefusal,
  ImportRefusalResponse,
  InternalIdentity,
  JsonResponse,
  ParamsOf,
  Refusal,
  RefusalResponse,
  RefusalStatus,
  RequestPolicy,
  SchemaShape,
  TextResponse,
} from '@wbs/contracts';

/**
 * An absent representation; JSON null remains an ordinary JSON value.
 * Proof: replacing this symbol with null makes endpoint.test.ts's distinct-body
 * runtime case fail on expect(body).not.toBeNull(), receiving null.
 */
export const EMPTY = Symbol('empty-http-body');

/** Ordered repeated headers, including independent Set-Cookie values. */
export type Header = readonly [name: string, value: string];

export type { AuthenticatedUser, InternalIdentity } from '@wbs/contracts';

export type Identity = AuthenticatedUser | InternalIdentity;

export interface RequestMetadata {
  url: URL;
  method: string;
  headers: Headers;
}

export type IdentityResolution =
  | { ok: true; principal: Identity }
  | {
      ok: false;
      status: 401;
      body: { error: 'unauthenticated' | 'unauthorized' | 'unknown_identity' | 'invalid_token' };
    }
  | { ok: false; status: 403; body: { error: 'insufficient_scope' } };

/** Credential failures are modeled; unexpected account-store failures reject. */
export type IdentityResolver = (
  requirement: Extract<RequestPolicy, { kind: 'identity' }>['require'],
  request: RequestMetadata,
) => Promise<IdentityResolution>;

type IdentityPolicy<S extends EndpointShape> = Extract<S['policies'][number], { kind: 'identity' }>;

/**
 * Proof: replacing distributive selection with the former whole-policy condition
 * makes the variable-requirement bind report TS2578 for un-narrowed principal.id.
 */
type PrincipalFor<Requirement> = Requirement extends 'internal'
  ? InternalIdentity
  : AuthenticatedUser;

/**
 * Proof (type boundary): replacing omission with principal: never makes both
 * actual-bind no-identity fixtures report TS2578, including the origin-only policy.
 * Substituting a user for InternalIdentity likewise exposes id and reports TS2578.
 */
type PrincipalInput<S extends EndpointShape> = [IdentityPolicy<S>] extends [never]
  ? Record<never, never>
  : {
      principal: PrincipalFor<IdentityPolicy<S>['require']>;
    };

type QueryOf<S extends EndpointShape> = S extends { query: SchemaShape<infer Q> } ? Q : undefined;
type BodyOf<S extends EndpointShape> = S extends { body: SchemaShape<infer B> } ? B : undefined;

/**
 * A validated request with a principal only when its policy requires identity.
 * Proof (type boundary): widening params to Record<string,string> makes the
 * actual-bind indexed wrong-key fixture report TS2578. Wire binding is tested separately.
 */
export type EndpointInput<S extends EndpointShape> = {
  params: ParamsOf<S['path']>;
  query: QueryOf<S>;
  body: BodyOf<S>;
  request: RequestMetadata;
} & PrincipalInput<S>;

/** Proof (type boundary): removing error?:never makes the successful-refusal bind report TS2578. */
type SuccessfulBody<T> = T extends object ? T & { error?: never } : T;
type SuccessReply<R> = R extends JsonResponse
  ? {
      ok: true;
      status: R['status'];
      body: SuccessfulBody<R['schema'] extends SchemaShape<infer T> ? T : never>;
      headers?: readonly Header[];
    }
  : R extends EmptyResponse
    ? { ok: true; status: R['status']; body: typeof EMPTY; headers?: readonly Header[] }
    : R extends TextResponse
      ? { ok: true; status: R['status']; text: string; headers?: readonly Header[] }
      : never;

/**
 * Proof (type boundary): disabling distribution over R admits the pinned
 * 400/invalid_credentials handler and makes its actual-bind fixture report TS2578.
 */
type RefusalReply<R> = R extends EmptyRefusalResponse
  ? { ok: false; status: R['status']; body: typeof EMPTY; headers?: readonly Header[] }
  : R extends RefusalResponse | ImportRefusalResponse
    ? {
        ok: false;
        status: R['status'];
        body: R['schema'] extends SchemaShape<infer T> ? T : never;
        headers?: readonly Header[];
      }
    : never;

/**
 * Derives each status and body together from its declared response variant.
 * Proof (type boundary): adding undeclared EmptyResponse/TextResponse arms
 * produces TS2578 for the empty, text and redirect actual-bind fixtures.
 * Widening primitive JSON bodies to include EMPTY produces TS2578 for the
 * explicitly typed null-endpoint handler; inference cannot hide it by widening a symbol.
 */
export type HttpReply<S extends EndpointShape> =
  SuccessReply<S['responses'][number]> | RefusalReply<S['refusals'][number]>;

/** The rejected external value and portable validator issues, never an accepted input. */
export type RequestFailure = {
  rejected: unknown;
  issues?: readonly StandardSchemaV1.Issue[];
  request: RequestMetadata;
} & (
  | { part: 'params'; code: 'invalid_params' }
  | { part: 'query'; code: 'invalid_query'; duplicate?: string }
  | { part: 'body'; code: 'invalid_body' | 'invalid_json' }
);

/**
 * Proof: widening to HttpReply makes actual-bind success callbacks report TS2578;
 * widening to the erased refusal makes its mismatched status/body fixture report TS2578.
 */
type DeclaredRefusal<S extends EndpointShape> = Extract<HttpReply<S>, { ok: false }>;

/** Pure request-boundary decisions; neither callback can replace validated input. */
export interface BindingOptions<S extends EndpointShape> {
  classifyRequestFailure?: (
    failure: RequestFailure,
  ) => DeclaredRefusal<S> | Promise<DeclaredRefusal<S>>;
  prevalidate?: (
    request: RequestMetadata,
  ) => DeclaredRefusal<S> | null | Promise<DeclaredRefusal<S> | null>;
}

export interface Endpoint<S extends EndpointShape> extends BindingOptions<S> {
  shape: S;
  handle(input: EndpointInput<S>): Promise<HttpReply<S>>;
}

/** The wire representation after a heterogeneous endpoint table erases its types. */
export type EndpointReply =
  | { ok: true; status: 200 | 201 | 202; body: unknown; headers?: readonly Header[] }
  | { ok: true; status: 204 | 302; body: typeof EMPTY; headers?: readonly Header[] }
  | { ok: true; status: 200 | 500; text: string; headers?: readonly Header[] }
  | { ok: false; status: RefusalStatus; body: Refusal; headers?: readonly Header[] }
  | { ok: false; status: RefusalStatus; body: ImportRefusal; headers?: readonly Header[] }
  | { ok: false; status: RefusalStatus; body: typeof EMPTY; headers?: readonly Header[] };

/**
 * A bound endpoint in a heterogeneous table. The erased input is deliberately
 * uncallable until an adapter validates against this endpoint's exact shape.
 */
export interface BoundEndpoint extends BindingOptions<EndpointShape> {
  shape: EndpointShape;
  handle(input: never): Promise<EndpointReply>;
}

/**
 * Binds the handler to its const shape argument. The actual-bind negative
 * fixtures retain these bounds without a separate NoInfer wrapper (measured).
 */
export function bind<const S extends EndpointShape>(
  shape: S,
  handle: (input: EndpointInput<S>) => Promise<HttpReply<S>>,
  options: BindingOptions<S> = {},
): Endpoint<S> {
  return {
    shape,
    handle: async (input) => {
      // Proof: bypassing this binding made the enabled boot composition write
      // a stale-cookie project (200 instead of 409) in
      // organization-context.boot.db.test.ts; watched 2026-10-13.
      const policy = shape.policies.find((entry) => entry.kind === 'organization-resource');
      if (policy === undefined) return handle(input);
      // Proof: removing this guard reached the mounted project handler after
      // its identity policy was lost; mount.test.ts caught calls=1, watched 2026-10-13.
      if (!('principal' in input) || !('id' in input.principal))
        throw new Error(`Organization resource lacks a user identity: ${shape.operationId}`);
      return handle({
        ...input,
        principal: {
          ...input.principal,
          organizationOperation: {
            kind: policy.operation,
            expected: expectedOrganization(input.request.headers),
          },
        },
      });
    },
    classifyRequestFailure: options.classifyRequestFailure,
    prevalidate: options.prevalidate,
  };
}

/** Parses the singleton HTTP precondition once; repeated physical headers are comma-combined by Fetch. */
function expectedOrganization(headers: Headers): ExpectedOrganization {
  const value = headers.get('X-WBS-Expected-Organization');
  if (value === null) return { kind: 'absent' };
  const organizationId = value.replace(/^[ \t]+|[ \t]+$/g, '');
  // Proof: accepting the first duplicate made the mounted exactly-one test
  // admit duplicate org-a values (200); watched 2026-10-13.
  if (organizationId.length === 0 || organizationId.includes(',')) return { kind: 'invalid' };
  return { kind: 'present', organizationId };
}
