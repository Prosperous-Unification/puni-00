import { checkPlanEventLimit, holdsCommand, type PlanEvent, type PlanEventStore } from '@wbs/core';

/**
 * A {@link PlanEventStore} backed by an array, for service and controller tests
 * that do not need SQLite.
 *
 * It keeps the three guarantees a reader depends on, because a fixture laxer than
 * production lets a test pass against behaviour that does not exist: **newest
 * first** with the id breaking a tie, a `workItemId` filter that excludes the
 * plan-wide events rather than including them, and a `kinds` list that names
 * nothing being no filter at all.
 *
 * What it deliberately does not model is the JSON round trip — `before` and
 * `after` are held as the values they were given. A caller that cares about the
 * parse runs against the real store, exactly as `inMemoryCommandJournal` says of
 * the journal's three columns.
 */
export interface MemoryPlanEventTable {
  readonly held: PlanEvent[];
}
export function memoryPlanEventTable(seed: readonly PlanEvent[] = []): MemoryPlanEventTable {
  return { held: structuredClone([...seed]) };
}

export function inMemoryPlanEvents(
  seed: readonly PlanEvent[] = [],
  table: MemoryPlanEventTable = memoryPlanEventTable(seed),
): PlanEventStore & {
  readonly held: PlanEvent[];
} {
  const { held } = table;
  return {
    held,
    listFor(projectId, filter) {
      // Proof: with this check removed, the memory certification failed
      // `planEvents.listFor:batches-limit` (conformance), whose `limit` 0, -1
      // and 1.5 must be refused; watched 2026-10-24.
      checkPlanEventLimit(filter.limit);
      const kinds = filter.kinds ?? [];
      const holding = filter.batchesHolding ?? [];
      // Proof: with the batch clause removed, the memory certification failed
      // `planEvents.listFor:batches-limit` (conformance); watched 2026-10-24.
      const kept = (each: PlanEvent): boolean =>
        kinds.includes(each.kind) ||
        (holding.length > 0 && each.kind === 'batch' && holdsCommand(each.after, holding));
      return Promise.resolve(
        held
          .filter((each) => each.projectId === projectId)
          .filter(
            (each) => filter.workItemId === undefined || each.workItemId === filter.workItemId,
          )
          .filter((each) => kinds.length === 0 || kept(each))
          .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
          // Proof: with the limit ignored, `answers the newest events up to the
          // limit` (claim-history.test.ts) read all 120; watched 2026-10-24.
          .slice(0, filter.limit),
      );
    },
    pruneOlderThan(cutoff) {
      const doomed = held.filter((each) => each.createdAt < cutoff);
      for (const each of doomed) held.splice(held.indexOf(each), 1);
      return Promise.resolve(doomed.length);
    },
  };
}
