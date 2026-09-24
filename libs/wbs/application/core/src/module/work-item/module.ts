import { DiBag } from 'di-bag';

import type { ActualStore } from '../../ports/actual-store';
import type { CapacityStore } from '../../ports/capacity-store';
import type { Clock } from '../../ports/clock';
import type { CommandJournalStore } from '../../ports/command-journal-store';
import type { DependencyStore } from '../../ports/dependency-store';
import type { DirectoryStore } from '../../ports/directory-store';
import type { EstimateStore } from '../../ports/estimate-store';
import type { MeasureStore } from '../../ports/measure-store';
import type { PriorityBandStore } from '../../ports/priority-band-store';
import type { StepProgressStore } from '../../ports/progress-store';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';
import type { Scheduler } from '../../ports/scheduler';
import type { SubtreeStore } from '../../ports/subtree-store';
import type { WorkItemStore } from '../../ports/work-item-store';
import { WORK_ITEM_LABEL } from './contract';
import { WorkItemService, type WorkItemServiceOptions } from './work-item.resource';

/**
 * Work item as a sealed DI Bag module.
 *
 * Only `workItems` is exported. `workItemOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.work-item/workItemOptions` rather than against
 * an anonymous binding. Every store is required under a `<name>Store` host key
 * because five of them (`workItems`, `projects`, `directory`, `capacity`,
 * `priorityBands`) share their `servicesOver` name with a writing service, and
 * one host graph cannot hold a store and a service under one key.
 *
 * The module registers no disposer: `WorkItemService` holds the borrowed
 * stores of one scope, a broadcaster, a scheduler and a clock, and no handle
 * of its own.
 */
export const workItemModule = DiBag.createBuilder()
  .register({
    workItemOptions: DiBag.fromSyncFactory(
      ({
        workItemStore,
        projectStore,
        estimateStore,
        actualStore,
        measureStore,
        progressStore,
        directoryStore,
        capacityStore,
        priorityBandStore,
        dependencyStore,
        subtreeStore,
        journalStore,
        broadcast,
        scheduler,
        clock,
      }: {
        workItemStore: WorkItemStore;
        projectStore: ProjectStore;
        estimateStore: EstimateStore;
        actualStore: ActualStore;
        measureStore: MeasureStore;
        progressStore: StepProgressStore;
        directoryStore: DirectoryStore;
        capacityStore: CapacityStore;
        priorityBandStore: PriorityBandStore;
        dependencyStore: DependencyStore;
        subtreeStore: SubtreeStore;
        journalStore: CommandJournalStore;
        broadcast: Broadcaster;
        scheduler: Scheduler;
        clock: Clock;
      }): WorkItemServiceOptions => ({
        workItems: workItemStore,
        projects: projectStore,
        estimates: estimateStore,
        actuals: actualStore,
        measures: measureStore,
        progress: progressStore,
        directory: directoryStore,
        capacity: capacityStore,
        priorityBands: priorityBandStore,
        dependencies: dependencyStore,
        subtrees: subtreeStore,
        journal: journalStore,
        // Proof (2026-09-24): handing the resource
        // `{ ...broadcast, publish: () => Promise.resolve() }` instead of the supplied
        // broadcaster left `announces a created work item through the broadcaster installWorkItem
        // wires` failing (4 pass, 1 fail): it received `[]`.
        broadcast,
        scheduler,
        clock,
      }),
    ),
  })
  .register({
    workItems: DiBag.fromSyncFactory(
      ({ workItemOptions }: { workItemOptions: WorkItemServiceOptions }): WorkItemService =>
        new WorkItemService(workItemOptions),
    ),
  })
  // Proof (2026-09-24): widening the key tuple to `['workItems', 'workItemOptions']` left the
  // private-binding, graph-label and missing-requirement assertions failing (2 pass, 3 fail):
  // `resolve('workItemOptions')` did not throw, `inspectGraph()` reported bare `workItemOptions`,
  // and the DI failure named that bare key instead of the module label.
  // Proof (2026-09-24): dropping `{ label: WORK_ITEM_LABEL }` left only the two label assertions
  // failing (3 pass, 2 fail): `inspectGraph()` reported `workItemOptions` unlabelled, and the
  // missing-requirement message named `workItemOptions` instead of
  // `application.work-item/workItemOptions`.
  .buildModule(['workItems'], { label: WORK_ITEM_LABEL });
