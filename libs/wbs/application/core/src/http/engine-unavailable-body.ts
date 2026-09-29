import type { EngineUnavailable } from '../ports/scheduler';

/**
 * The 409 body of a plan read whose engine is not installed here: the
 * project's own, or under shared people an influencer's, which `projectId`
 * names so the refusal says whose solver is missing.
 *
 * Proof: the `projectId` spread left out made `refuses to read below an
 * influencer whose engine is missing` (`shared-people.controller.db.test.ts`) receive
 * a body naming no project; watched 2026-09-29.
 */
export function engineUnavailableBody(refusal: EngineUnavailable): {
  error: 'engine_unavailable';
  engine: 'optimized';
  projectId?: string;
} {
  return {
    error: refusal.error,
    engine: refusal.engine,
    ...(refusal.projectId === undefined ? {} : { projectId: refusal.projectId }),
  };
}
