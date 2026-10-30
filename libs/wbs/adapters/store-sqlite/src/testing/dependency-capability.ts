import type { DependencyRuntimeCapability } from '@wbs/contracts/dependency-runtime';

/** An explicit old backend binary for dormant/refusal adapter fixtures. */
export const INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY = Object.freeze({
  protocol: 'wbs-dependency-runtime',
  version: 1,
  role: 'backend',
  semantics: Object.freeze([]),
}) satisfies DependencyRuntimeCapability;

/** Complete backend semantics supplied explicitly by lower-level semantic fixtures. */
export const CAPABLE_BACKEND_DEPENDENCY_CAPABILITY = Object.freeze({
  ...INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
  semantics: Object.freeze(['cross-project-dependencies-v1'] as const),
}) satisfies DependencyRuntimeCapability;
