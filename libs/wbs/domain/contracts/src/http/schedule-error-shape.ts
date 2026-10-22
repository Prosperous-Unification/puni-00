import { type } from 'arktype';

/**
 * Exact forecast availability evidence shared by trees and project roll-ups.
 *
 * Proof: replacing the roll-up field with unknown failed `space roll-up boundary
 * rejects incomplete or invented connected evidence` with missing/empty projects
 * and malformed engine evidence accepted (2026-10-22). The tree boundary has
 * the same watched unknown-type mutation in `work-item-response.test.ts`.
 */
export const scheduleError = type("'calendar_range' | 'cycle' | null")
  .or(
    type({
      kind: "'dependency_calendar_missing'",
      projects: type({ projectId: 'string', abbreviation: 'string', name: 'string' })
        .array()
        .atLeastLength(1)
        .readonly(),
    }),
  )
  .or(
    type({
      kind: "'engine_unavailable'",
      engine: "'optimized'",
      projects: type('string').array().atLeastLength(1).readonly(),
      reason: "'adapter_missing' | 'connected_optimization_not_supported'",
    }),
  );
