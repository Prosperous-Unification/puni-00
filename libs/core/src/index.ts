/**
 * `@wbs/core` — the application ring: what be-01 does, with nothing about how.
 *
 * Ports and services live here and adapters do not: a file in this project may
 * import `@wbs/domain`, `@wbs/contracts` and its own peers, and nothing else
 * (`eslint.config.js`'s ring constraints, watched in this change's `verify.md`).
 * What that buys is the composition `compose.test.ts` will make — this graph
 * over the in-memory source and the portable runtime, with no Bun, no SQLite
 * and no HTTP in it.
 *
 * It is being filled a slice at a time, and what is here is what has no adapter
 * in its signature. The store ports follow once two of them stop naming
 * drizzle's own types — `EventLogStore.recordEventIn(tx)` and
 * `SavedPlanStore.holdingOf(db)` — which is `tasks.md` 2.2's first job rather
 * than a move.
 */
export { type Clock, clockOf } from './ports/clock';
export type { EventLogStore, RecordedEvent } from './ports/event-log-store';
export type { Digest, PasswordHasher, SessionClaims, TokenCodec } from './ports/runtime';
export type { PlanInputReads, SavedPlanCaptureStore } from './ports/saved-plan-capture-store';
export type {
  SavedPlanBodyWrite,
  SavedPlanHoldingRow,
  SavedPlanPrincipals,
  SavedPlanRow,
  SavedPlanScheduleWrite,
  SavedPlanStore,
  SavedPlanTouchOutcome,
  SavedPlanWrite,
  SavedPlanWriteOutcome,
  StoredSavedPlan,
} from './ports/saved-plan-store';
export * from './ports/stores';
export type { WriteStamp } from './ports/write-stamp';
export { bodyByteLength } from './service/saved-plan-integrity';
