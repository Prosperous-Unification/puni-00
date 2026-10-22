import type { DependencyRuntimeCapability } from '@wbs/contracts';

/** Complete connected semantics are still unadvertised; configuration cannot grant support. */
export const BACKEND_DEPENDENCY_CAPABILITY = Object.freeze({
  protocol: 'wbs-dependency-runtime',
  version: 1,
  role: 'backend',
  // Proof: advertising cross-project-dependencies-v1 failed mounted CLI equality's explicit empty-semantics assertion.
  semantics: Object.freeze([]),
}) satisfies DependencyRuntimeCapability;
