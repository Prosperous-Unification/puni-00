/**
 * Compatibility re-export: Realtime moved into its own sealed module.
 *
 * Kept because `service-boundaries.test.ts` lints this path and
 * `replay-buffer.test.ts`, `replay-buffer.property.test.ts` and
 * `gateway-broadcaster.test.ts` deep-import it by relative path, as does
 * be-01's own `replay-buffer.ts` re-export shim through `@wbs/core`. It goes
 * when every importer names the module.
 */
export * from '../module/realtime/replay-buffer';
