import type { DependencyRuntimeCapability } from '@wbs/contracts';

/** Immutable binary observation; configuration cannot grant connected dependency semantics. */
export const GATEWAY_DEPENDENCY_CAPABILITY = Object.freeze({
  protocol: 'wbs-dependency-runtime',
  version: 1,
  // Proof: independent wrong-role mutation failed the exact subprocess observation (2026-10-23).
  role: 'gateway',
  // Proof: advertised semantics and removal of either freeze independently failed the observation test.
  semantics: Object.freeze([]),
}) satisfies DependencyRuntimeCapability;
