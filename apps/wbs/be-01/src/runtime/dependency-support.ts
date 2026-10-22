import type { DependencyRuntimeCapability } from '@wbs/contracts';

/** Complete connected semantics are still unadvertised; configuration cannot grant support. */
export const BACKEND_DEPENDENCY_CAPABILITY: DependencyRuntimeCapability = Object.freeze({
  protocol: 'wbs-dependency-runtime',
  version: 1,
  role: 'backend',
  semantics: Object.freeze([]),
});
