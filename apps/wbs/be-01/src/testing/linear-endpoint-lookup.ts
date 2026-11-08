import fc from 'fast-check';

import type { BoundEndpoint } from '../http/endpoint';
import { comparePaths, type EndpointLookup, isReachedBy } from '../http/endpoint-index';
import { matchPath } from '../http/route';

/**
 * The lookup `mount.ts` ran before `indexEndpoints` (task 4.5 of `wbs-mcp-agent-surface`):
 * every endpoint filtered by method, matched, stably sorted by precedence, the first taken.
 * The index must select exactly what this selects.
 */
export function linearEndpointLookup(endpoints: readonly BoundEndpoint[]): EndpointLookup {
  return (method, pathname) =>
    endpoints
      .filter((endpoint) => isReachedBy(endpoint, method))
      .flatMap((endpoint) => {
        const params = matchPath(endpoint.shape.path, pathname);
        return params === null ? [] : [{ endpoint, params }];
      })
      .sort((left, right) => comparePaths(left.endpoint.shape.path, right.endpoint.shape.path))
      .at(0);
}

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE'] as const;

/**
 * Requests aimed at `endpoints`: each pattern under its own method (or `HEAD` for `GET`, or any
 * method), its parameters filled with a literal another pattern has at that position (so static
 * and parameter siblings collide), an empty or undecodable segment, or random text, sometimes
 * with a trailing slash; plus random paths.
 */
export function requestsFor(
  endpoints: readonly BoundEndpoint[],
): fc.Arbitrary<{ readonly method: string; readonly pathname: string }> {
  const literalsAt = new Map<number, Set<string>>();
  for (const { shape } of endpoints)
    for (const [index, part] of shape.path.split('/').entries())
      if (!part.startsWith(':'))
        literalsAt.set(index, (literalsAt.get(index) ?? new Set()).add(part));
  const odd = fc.oneof(
    fc.constantFrom('', '%E0%A4%A', 'a%20b', '00000000-0000-4000-8000-000000000001'),
    fc.stringMatching(/^[a-z0-9-]{1,8}$/),
  );
  const segmentAt = (index: number): fc.Arbitrary<string> => {
    const literals = [...(literalsAt.get(index) ?? [])];
    return literals.length === 0
      ? odd
      : fc.oneof(
          { weight: 3, arbitrary: fc.constantFrom(...literals) },
          { weight: 1, arbitrary: odd },
        );
  };
  const aimed = fc.constantFrom(...endpoints).chain(({ shape }) => {
    const parts = shape.path.split('/');
    return fc.record({
      method: fc.oneof(
        { weight: 3, arbitrary: fc.constant(shape.method) },
        { weight: 1, arbitrary: fc.constant(shape.method === 'GET' ? 'HEAD' : shape.method) },
        { weight: 1, arbitrary: fc.constantFrom(...METHODS) },
      ),
      pathname: fc
        .tuple(
          fc.tuple(
            ...parts.map((part, index) =>
              part.startsWith(':') ? segmentAt(index) : fc.constant(part),
            ),
          ),
          fc.boolean(),
        )
        .map(([filled, trailing]) => `${filled.join('/')}${trailing ? '/' : ''}`),
    });
  });
  const random = fc.record({
    method: fc.constantFrom(...METHODS),
    pathname: fc
      .array(fc.integer({ min: 1, max: 7 }), { minLength: 0, maxLength: 7 })
      .chain((indexes) => fc.tuple(...indexes.map((index) => segmentAt(index))))
      .map((parts) => `/${parts.join('/')}`),
  });
  return fc.oneof({ weight: 4, arbitrary: aimed }, { weight: 1, arbitrary: random });
}
