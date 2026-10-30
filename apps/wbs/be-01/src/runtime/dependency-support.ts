import type { DependencyRuntimeCapability } from '@wbs/contracts';

/** Immutable backend support; durable activation and participant proof remain separate authority. */
export const BACKEND_DEPENDENCY_CAPABILITY = Object.freeze({
  protocol: 'wbs-dependency-runtime',
  version: 1,
  role: 'backend',
  // Proof: removing V1 support made the real enabled backend refuse the exact resource claim.
  semantics: Object.freeze(['cross-project-dependencies-v1'] as const),
}) satisfies DependencyRuntimeCapability;
