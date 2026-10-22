import type { PlanTransactionalStores } from '@wbs/core';
import { clockOf } from '@wbs/core';
import { grantAdmission } from '@wbs/core';
import { createWorkingPlan } from '@wbs/core/module/plan-commands/working-plan.resource';
import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { AnnouncementCollector } from '@wbs/core/ports/announcement-collector';
import { createDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { expect } from 'bun:test';

import { harness, type openFixture, requireOwnerEdit } from './cross-project-dependency-fixture';

/** Explicit active capability for admitted semantic copy tests only; production remains dormant. */
export async function runSemanticCopy<T extends { ok: boolean }>(
  fixture: Awaited<ReturnType<typeof openFixture>>,
  operation: (service: WorkItemService) => Promise<T>,
  configure?: (stores: PlanTransactionalStores) => PlanTransactionalStores,
) {
  const boundary = harness.publicWrites();
  return boundary.uow.run(async (scope) => {
    const resolved = await boundary.commandAccess.resolve({
      kind: 'human',
      principal: fixture.principal,
      expectedAccess: fixture.expectedAccess,
    });
    if (!resolved.ok || resolved.access.kind !== 'scoped')
      throw new Error('fixture current authority refused');
    await requireOwnerEdit(scope.stores, fixture);
    const granted = grantAdmission(fixture.owner.projectId, fixture.principal.id);
    const stores = configure === undefined ? scope.stores : configure(scope.stores);
    const plan = createWorkingPlan({ ...scope, stores }, fixture.owner.projectId);
    const opened = createDependencyContext(
      stores,
      {
        projectId: fixture.owner.projectId,
        actorId: fixture.principal.id,
        access: resolved.access,
        admission: granted.admission,
      },
      () => undefined,
      { kind: 'owner', refresh: plan.refreshRows },
    );
    const broadcast = recordingBroadcaster();
    try {
      const service = new WorkItemService({
        ...plan.stores,
        clock: clockOf({ now: () => Date.now(), newId: () => crypto.randomUUID() }),
        scheduler: fastScheduler,
        admission: granted.admission,
        dependencyContext: { kind: 'bound', context: opened.context },
        externalDependencyAuthoring: { state: 'active' },
        broadcast: new AnnouncementCollector(broadcast),
      });
      const collected = await service.collect(() => operation(service));
      if (collected.result.ok)
        await service.recordCollected(
          fixture.owner.projectId,
          fixture.principal.id,
          collected.recordings,
        );
      return { commit: collected.result.ok, value: collected.result };
    } finally {
      expect(broadcast.published).toEqual([]);
      opened.close();
      plan.close();
      granted.expire();
    }
  });
}
