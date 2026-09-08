import type { PlanTransactionalStores } from './stores';

export interface ScopeFixture {
  stores: PlanTransactionalStores;
}

export type ProjectStoreInScope = ScopeFixture['stores']['projects'];

// Proof: removing this expectation failed core:typecheck on TS2339:
// PlanTransactionalStores has no property 'savedPlans' (2026-09-09).
// @ts-expect-error A command scope cannot enlist independently durable saved plans.
export type SavedPlanStoreInScope = ScopeFixture['stores']['savedPlans'];
