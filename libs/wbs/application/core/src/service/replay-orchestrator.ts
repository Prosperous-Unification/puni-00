/**
 * Compatibility re-export: Realtime moved into its own sealed module.
 *
 * Kept because `service-boundaries.test.ts` lints this path and
 * `gateway-broadcaster.test.ts` deep-imports it by relative path, as does
 * be-01's own `replay-orchestrator.ts` re-export shim through `@wbs/core`. It
 * goes when every importer names the module.
 */
export * from '../module/realtime/replay-orchestrator';
