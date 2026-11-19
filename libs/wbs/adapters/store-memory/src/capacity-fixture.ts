import type { CapacityStore, CapacityWritten, TeamCapacity } from '@wbs/core';

/**
 * A {@link CapacityStore} backed by a Map, for service and controller tests that
 * do not need SQLite.
 *
 * It keeps the two guarantees the real schema enforces, because a fixture laxer
 * than production lets a test pass against behaviour that does not exist: the
 * pair is unique — a second `set` replaces rather than adds — and _unstated_ is
 * the **absence** of an entry rather than a stored `null`, so `slotsFor` can
 * never hand back a key whose value has to be tested for.
 *
 * What it deliberately does **not** keep is the existence check on the two ids.
 * `CapacityRepository.set` reads both inside its own transaction and answers
 * `not_found`; these Maps hold no work packages and no teams, so a fixture that
 * answered anything about an unknown id would be answering a question it cannot
 * know — the shape `inMemoryDirectory`'s own `workPackageIds: []` comment names. That
 * refusal is asserted against real SQLite in `repository/capacity.test.ts`.
 */
export function inMemoryCapacity(
  /**
   * What the store starts holding, as `workPackageId -> teamId -> slots`.
   *
   * Written rather than set through `set`, because most callers want a work package
   * that already states a number and going through the write path to get one puts
   * the setup at the mercy of the thing under test.
   */
  seed: Readonly<Record<string, Readonly<Record<string, number>>>> = {},
  table: MemoryCapacityTable = memoryCapacityTable(seed),
): CapacityStore {
  const { held } = table;
  /**
   * Every stamp this store was handed, in call order, so a service test can
   * assert who wrote and when without a database to read audit columns from.
   */

  return {
    slotsFor(workPackageId) {
      // A copy, not the stored Map: the engine's adapter is handed this and a
      // caller that mutated it would be editing the store from the read side.
      return Promise.resolve(new Map(held.get(workPackageId) ?? []));
    },
    listFor(workPackageId) {
      const teams = [...(held.get(workPackageId) ?? [])];
      // Team-id order, as the repository's `orderBy` gives: a fixture in
      // insertion order would let a payload-order assertion pass against a
      // production read that reshuffles.
      teams.sort(([a], [b]) => a.localeCompare(b));
      const listed: TeamCapacity[] = teams.map(([serviceTeamId, size]) => ({
        serviceTeamId,
        size,
      }));
      return Promise.resolve(listed);
    },
    set(workPackageId, serviceTeamId, size, _stamp) {
      const forWorkPackage = held.get(workPackageId) ?? new Map<string, number>();
      if (size === null) forWorkPackage.delete(serviceTeamId);
      else forWorkPackage.set(serviceTeamId, size);
      held.set(workPackageId, forWorkPackage);
      const written: CapacityWritten = { ok: true };
      return Promise.resolve(written);
    },
  };
}

export interface MemoryCapacityTable {
  readonly held: Map<string, Map<string, number>>;
}
export function memoryCapacityTable(
  seed: Readonly<Record<string, Readonly<Record<string, number>>>> = {},
): MemoryCapacityTable {
  return {
    held: new Map(
      Object.entries(seed).map(([workPackageId, teams]) => [
        workPackageId,
        new Map(Object.entries(teams)),
      ]),
    ),
  };
}
