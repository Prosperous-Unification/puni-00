/**
 * The route shape every controller in this app is written against, and the one
 * type file that names no HTTP framework.
 *
 * A route is `{ method, path, handler }` and a handler is a plain async
 * function from a {@link RouteRequest} to a {@link RouteResponse}. Nothing here
 * imports `elysia`, and the ESLint boundary in `.eslintrc` is what keeps that
 * true — the whole point of the shape is that a second binder over the same
 * route list needs no framework at all, which is what
 * `http/binder.contract.test.ts` runs.
 *
 * What deliberately is **not** here: body validation, and any notion of a
 * plugin. Ten routes in this app parse their bodies by hand because Elysia
 * strips unknown properties before a guard can refuse them
 * (`openapi/hand-parsed-body.ts` says why at length), so a validation hook in
 * the route type would advertise a seam those routes cannot take. A route that
 * wants a schema declares it in {@link Route.documentation}, which is carried
 * to whichever binder can publish it and ignored by the ones that cannot.
 */
export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

/**
 * One request, already decomposed into the four things handlers actually read.
 *
 * `headers` keys are **lowercased** by every binder, because that is the only
 * spelling a handler can rely on across frameworks: HTTP/2 requires lowercase
 * on the wire, Elysia hands them over lowercased, and a handler that reached
 * for `Authorization` would work under one binder and silently fail under
 * another.
 *
 * `body` is the decoded value or `undefined`, never a stream: the two batch
 * routes parse it themselves and the rest read fields off it. A body that is
 * not valid JSON never reaches a handler — the binder answers 400 first, which
 * is the one refusal the route list does not own.
 */
export interface RouteRequest {
  method: HttpMethod;
  /** The pathname as matched, without query string. */
  path: string;
  /** Path parameters by name, from the `:name` segments of {@link Route.path}. */
  params: Record<string, string>;
  /** Query parameters. A repeated key keeps its **last** value, as Elysia does. */
  query: Record<string, string>;
  /** Request headers, keys lowercased. */
  headers: Record<string, string | undefined>;
  body: unknown;
  /**
   * The raw URL, for the two places that need the origin rather than the path
   * (the OIDC redirect builder and the cookie-origin check).
   */
  url: string;
}

/**
 * One answer. `body` is a value, not a serialised string — the binder decides
 * how to put it on the wire, which is exactly the decision a route module must
 * not make.
 *
 * `null` is the body of a 204 and serialises to no body at all.
 */
export interface RouteResponse {
  status: number;
  body: unknown;
  /** Response headers, added as given. Cookies go here, pre-serialised. */
  headers?: Record<string, string>;
}

export type RouteHandler = (req: RouteRequest) => Promise<RouteResponse>;

export interface Route {
  method: HttpMethod;
  /**
   * The full path including any prefix. Prefixes are spelled out rather than
   * inherited from a group, because a route list is read to find out which
   * paths exist and a grouped prefix makes that a two-file question.
   */
  path: string;
  handler: RouteHandler;
  /**
   * Opaque per-route documentation, handed to a binder that can publish an
   * OpenAPI document and ignored by one that cannot. Typed as `unknown` on
   * purpose: naming Elysia's `DocumentDecoration` here would put the framework
   * back into the framework-free file.
   */
  documentation?: unknown;
}

/** A 200 with a JSON body. */
export function ok(body: unknown): RouteResponse {
  return { status: 200, body };
}

/** Any status with a JSON body — the shape handlers use for refusals. */
export function respond(status: number, body: unknown): RouteResponse {
  return { status, body };
}

/** A 204: no body, and the one response whose `body` must be `null`. */
export function noContent(): RouteResponse {
  return { status: 204, body: null };
}

/**
 * Path pattern to a matcher, shared by every binder that has to route by hand.
 *
 * Segment-wise rather than by regular expression, because the patterns in this
 * app are all `/literal/:param` and a regex would have to escape the literals
 * to stay safe against a path segment containing regex syntax.
 *
 * Returns the parameters on a match and `null` on a miss, so a caller cannot
 * confuse "matched with no parameters" with "did not match" — an empty object
 * is truthy and `null` is not.
 */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const expected = pattern.split('/');
  const actual = pathname.split('/');
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (const [index, segment] of expected.entries()) {
    const given = actual[index] ?? '';
    if (segment.startsWith(':')) {
      // An empty segment is not a parameter value: `/api/projects//steps` must
      // 404 rather than resolve to a project whose id is the empty string,
      // which every repository would then look up and answer `not_found` to.
      if (given === '') return null;
      params[segment.slice(1)] = decodeURIComponent(given);
    } else if (segment !== given) {
      return null;
    }
  }
  return params;
}
