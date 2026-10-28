import type { BoundEndpoint } from './endpoint';
import { matchPath } from './route';

/** The endpoint a request selects, and the parameters its path supplied. */
export interface EndpointMatch {
  readonly endpoint: BoundEndpoint;
  readonly params: Record<string, string>;
}

/** Selects the endpoint whose policies govern a request; see {@link indexEndpoints}. */
export type EndpointLookup = (method: string, pathname: string) => EndpointMatch | undefined;

/**
 * Indexes `endpoints` once so a request is matched only against the endpoints of its method
 * and segment count, in precedence order.
 *
 * It selects exactly what filtering every endpoint by method (a `HEAD` request also reaches
 * `GET` endpoints), matching each path, stably sorting the matches by {@link comparePaths} and
 * taking the first would select. That holds because {@link comparePaths} is a total preorder
 * over paths with equal segment counts, only such paths can match one pathname, and a stable
 * sort of a filtered list is the filter of the stably sorted list. `app.routes.test.ts` checks
 * the equivalence over the production table.
 */
export function indexEndpoints(endpoints: readonly BoundEndpoint[]): EndpointLookup {
  const methods = new Set<string>(endpoints.map(({ shape }) => shape.method));
  methods.add('HEAD');
  const table = new Map<string, Map<number, BoundEndpoint[]>>();
  for (const method of methods) {
    const bySegments = new Map<number, BoundEndpoint[]>();
    for (const endpoint of endpoints) {
      if (!isReachedBy(endpoint, method)) continue;
      const segments = endpoint.shape.path.split('/').length;
      const bucket = bySegments.get(segments) ?? [];
      bucket.push(endpoint);
      bySegments.set(segments, bucket);
    }
    for (const bucket of bySegments.values())
      bucket.sort((left, right) => comparePaths(left.shape.path, right.shape.path));
    table.set(method, bySegments);
  }
  return (method, pathname) => {
    const segments = trimTrailingSlash(pathname).split('/').length;
    for (const endpoint of table.get(method)?.get(segments) ?? []) {
      const params = matchPath(endpoint.shape.path, pathname);
      if (params !== null) return { endpoint, params };
    }
    return undefined;
  };
}

/** Whether a request with `method` reaches `endpoint`: its own method, or `HEAD` for `GET`. */
export function isReachedBy(endpoint: BoundEndpoint, method: string): boolean {
  return endpoint.shape.method === method || (method === 'HEAD' && endpoint.shape.method === 'GET');
}

/** The pathname as {@link matchPath} splits it: one trailing slash dropped, except on `/`. */
function trimTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/**
 * Elysia gives a static segment precedence over a parameter at the first divergence.
 * Proof: omitting this ordering applies the protected parameter route's policy
 * to its public static sibling, and the sibling test receives 401 instead of 200.
 */
export function comparePaths(left: string, right: string): number {
  const rightSegments = right.split('/');
  for (const [index, segment] of left.split('/').entries()) {
    const difference =
      Number(segment.startsWith(':')) - Number(rightSegments[index]?.startsWith(':'));
    if (difference !== 0) return difference;
  }
  return 0;
}
