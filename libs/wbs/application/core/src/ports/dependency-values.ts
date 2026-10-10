// Compatibility export: these records moved to `@wbs/domain` (task 6.1, decision A12) so domain
// rules can read them; ports keep their names for the stores and adapters.
export type { StoredDependency, StoredTypedDependency } from '@wbs/domain';
