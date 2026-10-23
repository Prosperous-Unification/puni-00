import type { PlanImportSource } from './composition';
import type { ImportService } from './plan-import.feature';

/**
 * What a host must supply to install {@link planImportModule}.
 *
 * `batchServices` is the per-scope `ImportServices` factory the map's Plan
 * import row names: a callback borrowing the Directory and Work item resource
 * contracts over the admitted scope a running import's own unit of work
 * supplies. Composition binds it to the unit of work before constructing the
 * feature, which receives only mapped import resources. The factory is built
 * per admission because staged stores are fresh on every turn.
 * `externalDependencies` is required: production resolves the admitted catalog's
 * lifetime-bound reader inside the import transaction. DISABLED authority stays
 * inactive; ENABLED requires immutable V1 binary support. Only
 * isolated semantic fixtures supply explicit active capability. `commandAccess` revalidates retained principal evidence on the same
 * admitted writer before resources or observations open. Current access, rather
 * than expected access, supplies the callback, private resource and dependency
 * context. Browser binding/revocation, membership/policy and persisted
 * machine/consent bindings are reread. Selected API secret rotation, upstream
 * verifier/delegation expiry and independently current remote MCP family state
 * are not represented by retained evidence. Remaining transfer/rollout debt
 * still bars production activation.
 *
 * **No K3 debt.** `ImportService.import` reaches the repository only through
 * the private `ImportedPlanResource` that `importTransaction` builds over
 * the scope `uow` admits; the feature never holds that scope. WBS 040.11 closed
 * this module's entry in `module-boundaries.test.ts`'s shrink-only debt ledger
 * (task 7.8 of `openspec/changes/adopt-di-composition/tasks.md`).
 */
export type PlanImportRequirements = PlanImportSource;

/** What installing {@link planImportModule} adds to a host graph. */
export interface PlanImportExports {
  readonly imports: ImportService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching `module.application.plan-history`'s,
 * `module.application.bounded-replay-sweep`'s and `module.application.realtime`'s;
 * the wiki module identifier is `module.application.plan-import` and the label
 * drops the `module.` prefix.
 */
export const PLAN_IMPORT_LABEL = 'application.plan-import';
