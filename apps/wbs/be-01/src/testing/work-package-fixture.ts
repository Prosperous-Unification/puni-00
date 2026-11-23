import type { HistoryService } from '@wbs/core/module/plan-history/plan-history.feature';
import type { WorkPackageService } from '@wbs/core/module/work-package/work-package.resource';
import type { CommandCaller } from '@wbs/core/ports/command-access';
import type { WorkPackageObservation } from '@wbs/core/ports/work-package-observation';

export { testWorkPackageService } from '@wbs/store-memory/testing/service-fixtures';
export * from '@wbs/store-memory/work-package-fixture';

/** Explicit unused dependency for fixtures whose behavior never performs ordinary package reads. */
export const refusingWorkPackageObservation: WorkPackageObservation = {
  checkRead: () => Promise.reject(new Error('unexpected package observation admission')),
  list: () => Promise.reject(new Error('unexpected package observation list')),
  read: () => Promise.reject(new Error('unexpected package observation detail')),
  readSolution: () => Promise.reject(new Error('unexpected package observation solution')),
  readHistory: () => Promise.reject(new Error('unexpected package observation history')),
  captureSavedPlan: () =>
    Promise.reject(new Error('unused saved-plan capture in this route model')),
  captureSavedCurrent: () =>
    Promise.reject(new Error('unused current comparison observation in this route model')),
  readSaved: () => Promise.reject(new Error('unused saved byte observation in this route model')),
  listSaved: () => Promise.reject(new Error('unexpected package observation saved shelf')),
};

/**
 * Legacy-only route unit model over its named package/history services, not memory Source authority.
 * History keeps the package precheck before event reading and maps modeled absence to null.
 * The checkRead unit model delegates to named readWithin, not SQLite private-field opacity.
 * A scoped caller is a fixture premise error: this model never invents current grant authority.
 * The surrounding unit fixture supplies preactivation explicitly; no durable-marker parity is claimed.
 */
export function createLegacyWorkPackageObservation(
  workPackages: Pick<WorkPackageService, 'listWithin' | 'readWithin' | 'readBySolutionSlugWithin'>,
  history: Pick<HistoryService, 'read'>,
): WorkPackageObservation {
  const legacyAccess = { kind: 'legacy' } as const;
  function actorOf(caller: CommandCaller): string {
    if (caller.kind === 'legacy') return caller.actorId;
    if (caller.expectedAccess.kind !== 'legacy')
      throw new Error('legacy package observation received scoped evidence');
    return caller.principal.id;
  }
  return {
    captureSavedPlan: () =>
      Promise.reject(new Error('unused saved-plan capture in this route model')),
    captureSavedCurrent: () =>
      Promise.reject(new Error('unused current comparison observation in this route model')),
    readSaved: () => Promise.reject(new Error('unused saved byte observation in this route model')),
    listSaved: () => Promise.reject(new Error('legacy route model has no saved header store')),
    async checkRead(caller, id) {
      actorOf(caller);
      return { ok: true, value: (await workPackages.readWithin(id, legacyAccess)) !== null };
    },
    async list(caller) {
      const actorId = actorOf(caller);
      return { ok: true, value: await workPackages.listWithin(actorId, legacyAccess) };
    },
    async read(caller, id) {
      actorOf(caller);
      return { ok: true, value: await workPackages.readWithin(id, legacyAccess) };
    },
    async readSolution(caller, slug) {
      actorOf(caller);
      return { ok: true, value: await workPackages.readBySolutionSlugWithin(slug, legacyAccess) };
    },
    async readHistory(caller, id, filter) {
      actorOf(caller);
      if ((await workPackages.readWithin(id, legacyAccess)) === null)
        return { ok: true, value: null };
      const observed = await history.read(id, filter);
      return { ok: true, value: observed.ok ? observed.value : null };
    },
  };
}
