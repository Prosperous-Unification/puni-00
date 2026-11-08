import { type } from 'arktype';

import { readCPUMilli, readMemoryMiB } from './observability-capacity';

// Proof: Task25b2 fix1 pod-resource-map-kind removal admitted array requirement bodies and request/limit maps.
const ResourceList = type('Record<string,string|number>').narrow(
  (quantities) => !Array.isArray(quantities),
);
const PodResources = type({ 'requests?': ResourceList, 'limits?': ResourceList }).narrow(
  (resources) => !Array.isArray(resources),
);
/** Validate only supplied Pod resource maps and bounds before leaving the policy unsupported.
 * Returns detached validated supplied maps for source inventory. Optional maps stay absent;
 * this derives no Pod charge or default limit. Existing accounting callers discard the maps.
 */
export function assertPodResources(input: unknown) {
  const resources = PodResources(input);
  // Proof: Task25b2 fix1 pod-requirements-shape removal admitted malformed maps and quantity types.
  if (resources instanceof type.errors) refuse('pod-resources-malformed');
  const readAmounts = (quantities: typeof ResourceList.infer | undefined) => {
    const amounts = new Map<string, number>();
    if (quantities === undefined) return amounts;
    // Proof: Task25b2 fix1 pod-cpu/memory-quantity-reader substitutions admitted malformed quantities.
    for (const [name, quantity] of Object.entries(quantities))
      amounts.set(
        name,
        name === 'cpu'
          ? readCPUMilli(String(quantity), refuse)
          : readMemoryMiB(String(quantity), refuse),
      );
    return amounts;
  };
  const limits = readAmounts(resources.limits);
  for (const [name, request] of readAmounts(resources.requests)) {
    const limit = limits.get(name);
    // Proof: Task25b2 fix1 pod-request-limit-bounds removal admitted selected/extra-template contradictions.
    if (limit !== undefined && request > limit) refuse('pod-resources-contradiction');
  }
  // Proof: Task25c2a resource-alias returning the input let returned facts mutate original request/limit maps.
  return {
    ...(resources.requests === undefined ? {} : { requests: { ...resources.requests } }),
    ...(resources.limits === undefined ? {} : { limits: { ...resources.limits } }),
  };
}

function refuse(reason: string): never {
  throw new Error(`Generated capacity ${reason}`);
}

const Quantity = type('string>0|number');
// Proof: Task25c3f required-map optionalization admitted a missing ephemeral request through validatePlatform.
const CandidateBounds = type({
  cpu: Quantity,
  memory: Quantity,
  'ephemeral-storage': Quantity,
  '+': 'reject',
});
const CandidateResources = type({
  requests: CandidateBounds,
  limits: CandidateBounds,
  '+': 'reject',
});
/** Require complete explicit current source budgets; historical supplied-only decoding stays in {@link assertPodResources}.
 * Requests may be zero; every limit must be positive. Shared readers own syntax and request/limit arithmetic.
 */
export function assertCandidatePodResources(input: unknown) {
  const resources = CandidateResources(input);
  if (resources instanceof type.errors)
    throw new Error('common candidate resource maps incomplete');
  // Proof: Task25c3f shared-quantities bypass admitted the above-limit request in the current native negative.
  assertPodResources(resources);
  for (const dimension of ['cpu', 'memory', 'ephemeral-storage'] as const) {
    const read = dimension === 'cpu' ? readCPUMilli : readMemoryMiB;
    // Proof: Task25c3f positive-limits bypass admitted zero CPU, memory and ephemeral limits through validatePlatform.
    if (read(String(resources.limits[dimension]), refuse) <= 0)
      throw new Error(`common candidate ${dimension} limit must be positive`);
  }
  return resources;
}
