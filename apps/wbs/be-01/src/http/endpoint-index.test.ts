import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { linearEndpointLookup, requestsFor } from '../testing/linear-endpoint-lookup';
import type { BoundEndpoint } from './endpoint';
import { indexEndpoints } from './endpoint-index';

/** Only `shape.method` and `shape.path` are read by either lookup. */
function endpoint(method: string, path: string): BoundEndpoint {
  return { shape: { method, path } } as unknown as BoundEndpoint;
}

const AMBIGUOUS = [
  endpoint('GET', '/api/projects/:id'),
  endpoint('GET', '/api/projects/active'),
  endpoint('GET', '/api/:kind/active'),
  endpoint('GET', '/api/:kind/:id'),
  endpoint('GET', '/api/:other/:key'),
  endpoint('POST', '/api/projects/:id'),
  endpoint('GET', '/'),
  endpoint('GET', '/api/projects/:id/'),
  endpoint('DELETE', '/api/projects/:id/steps/:stepId'),
];

describe('indexEndpoints', () => {
  it('prefers a static segment at the first divergence', () => {
    const lookup = indexEndpoints(AMBIGUOUS);
    expect(lookup('GET', '/api/projects/active')?.endpoint).toBe(AMBIGUOUS[1]);
    expect(lookup('GET', '/api/projects/7')?.endpoint).toBe(AMBIGUOUS[0]);
    expect(lookup('GET', '/api/spaces/active')?.endpoint).toBe(AMBIGUOUS[2]);
  });

  it('keeps registration order between equally specific paths', () => {
    expect(indexEndpoints(AMBIGUOUS)('GET', '/api/spaces/7')).toEqual({
      endpoint: AMBIGUOUS[3],
      params: { kind: 'spaces', id: '7' },
    });
  });

  it('lets HEAD reach GET endpoints and keeps other methods apart', () => {
    const lookup = indexEndpoints(AMBIGUOUS);
    expect(lookup('HEAD', '/api/projects/active')?.endpoint).toBe(AMBIGUOUS[1]);
    expect(lookup('POST', '/api/projects/active')?.endpoint).toBe(AMBIGUOUS[5]);
    expect(lookup('PUT', '/api/projects/7')).toBeUndefined();
    expect(lookup('DELETE', '/api/projects/7')).toBeUndefined();
  });

  it('ignores one trailing request slash but never the root', () => {
    const lookup = indexEndpoints(AMBIGUOUS);
    expect(lookup('GET', '/api/projects/active/')?.endpoint).toBe(AMBIGUOUS[1]);
    expect(lookup('GET', '/')?.endpoint).toBe(AMBIGUOUS[6]);
  });

  // Proof: sorting each bucket in reverse precedence (`comparePaths(right, left)`), selecting the
  // last match instead of the first, and dropping `methods.add('HEAD')` each failed this
  // property; counterexamples in verify.md, slice 12 (watched 2026-10-28).
  it('selects what the linear lookup selects, for any request', () => {
    const lookup = indexEndpoints(AMBIGUOUS);
    const linear = linearEndpointLookup(AMBIGUOUS);
    fc.assert(
      fc.property(requestsFor(AMBIGUOUS), ({ method, pathname }) => {
        const indexed = lookup(method, pathname);
        const expected = linear(method, pathname);
        expect(indexed?.endpoint).toBe(expected?.endpoint);
        expect(indexed?.params).toEqual(expected?.params);
      }),
      { numRuns: 2000 },
    );
  });
});
