/**
 * Compatibility re-export: Realtime moved into its own sealed module.
 *
 * Kept because `service-boundaries.test.ts` lints this path,
 * `gateway-broadcaster.test.ts` deep-imports it by relative path, and be-01's
 * own `gateway-broadcaster.ts` re-export shim, plus its
 * `gateway-broadcaster-order.db.test.ts`, `gateway-broadcaster-durability.db.test.ts`
 * and `step.service.db.test.ts`, reach it through `@wbs/core`. It goes when
 * every importer names the module.
 */
export * from '../module/realtime/gateway-broadcaster';
