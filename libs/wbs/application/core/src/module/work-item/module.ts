import { DiBag } from 'di-bag';

import type { ActualStore } from '../../ports/actual-store';
import type { CapacityStore } from '../../ports/capacity-store';
import type { LivePlanStore } from '../../ports/chain-snapshot-store';
import type { ClaimStore } from '../../ports/claim-store';
import type { Clock } from '../../ports/clock';
import type { CommandJournalStore } from '../../ports/command-journal-store';
import type { DemandStore } from '../../ports/demand-store';
import type { DependencyStore } from '../../ports/dependency-store';
import type { DirectoryStore } from '../../ports/directory-store';
import type { EditAdmission } from '../../ports/edit-admission';
import type { EstimateStore } from '../../ports/estimate-store';
import type { MeasureStore } from '../../ports/measure-store';
import type { OrganizationLimitGauge } from '../../ports/organization-limits';
import type { PriorityBandStore } from '../../ports/priority-band-store';
import type { StepProgressStore } from '../../ports/progress-store';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectStore } from '../../ports/project-store';
import type { ResourceCapacityStore } from '../../ports/resource-capacity-store';
import type { Scheduler } from '../../ports/scheduler';
import type { StepBlockageStore } from '../../ports/step-blockage-store';
import type { StepNodeAttemptStore } from '../../ports/step-node-attempt-store';
import type { StepParallelStore } from '../../ports/step-parallel-store';
import type { SubtreeStore } from '../../ports/subtree-store';
import type { TypedDependencyStore } from '../../ports/typed-dependency-store';
import type { WorkItemStore } from '../../ports/work-item-store';
import { WORK_ITEM_LABEL } from './contract';
import { WorkItemService, type WorkItemServiceOptions } from './work-item.resource';

/**
 * Work item as a sealed DI Bag module.
 *
 * Only `workItems` is exported. `workItemOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
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
  .withServices({
    workItemOptions: DiBag.createProvider(
      ({
        livePlans,
        workItemStore,
        stepParallelStore,
        projectStore,
        estimateStore,
        actualStore,
        measureStore,
        progressStore,
        attemptStore,
        blockageStore,
        claimStore,
        organizationLimits,
        demandStore,
        resourceCapacityStore,
        directoryStore,
        capacityStore,
        priorityBandStore,
        dependencyStore,
        typedDependencyStore,
        subtreeStore,
        journalStore,
        broadcast,
        editAdmission,
        dependencyContext,
        externalDependencyAuthoring,
        scheduler,
        schedulerMode,
        admitConnectedOptimization,
        clock,
      }: {
        livePlans: LivePlanStore | undefined;
        workItemStore: WorkItemStore;
        stepParallelStore: Pick<StepParallelStore, 'listByWorkItems'>;
        projectStore: ProjectStore;
        estimateStore: EstimateStore;
        actualStore: ActualStore;
        measureStore: MeasureStore;
        progressStore: StepProgressStore;
        attemptStore: StepNodeAttemptStore;
        blockageStore: StepBlockageStore;
        claimStore: ClaimStore | undefined;
        /** Null where the graph's stores carry no organization limits (public graph, legacy fixtures). */
        organizationLimits: OrganizationLimitGauge | null;
        demandStore: DemandStore;
        resourceCapacityStore: ResourceCapacityStore;
        directoryStore: DirectoryStore;
        capacityStore: CapacityStore;
        priorityBandStore: PriorityBandStore;
        dependencyStore: DependencyStore;
        typedDependencyStore: TypedDependencyStore;
        subtreeStore: SubtreeStore;
        journalStore: CommandJournalStore;
        broadcast: Broadcaster;
        editAdmission: EditAdmission;
        dependencyContext: WorkItemServiceOptions['dependencyContext'];
        externalDependencyAuthoring: WorkItemServiceOptions['externalDependencyAuthoring'];
        scheduler: Scheduler;
        schedulerMode: WorkItemServiceOptions['schedulerMode'];
        admitConnectedOptimization: WorkItemServiceOptions['admitConnectedOptimization'];
        clock: Clock;
      }): WorkItemServiceOptions => ({
        ...(livePlans === undefined ? {} : { livePlans }),
        workItems: workItemStore,
        stepParallels: stepParallelStore,
        projects: projectStore,
        estimates: estimateStore,
        actuals: actualStore,
        measures: measureStore,
        progress: progressStore,
        attempts: attemptStore,
        blockages: blockageStore,
        ...(claimStore === undefined ? {} : { claims: claimStore }),
        ...(organizationLimits === null ? {} : { organizationLimits }),
        demands: demandStore,
        resourceCapacity: resourceCapacityStore,
        directory: directoryStore,
        capacity: capacityStore,
        priorityBands: priorityBandStore,
        dependencies: dependencyStore,
        typedDependencies: typedDependencyStore,
        subtrees: subtreeStore,
        journal: journalStore,
        // Proof (2026-09-24): handing the resource
        // `{ ...broadcast, publish: () => Promise.resolve() }` instead of the supplied
        // broadcaster left `announces a created work item through the broadcaster installWorkItem
        // wires` failing (4 pass, 1 fail): it received `[]`.
        broadcast,
        admission: editAdmission,
        dependencyContext,
        externalDependencyAuthoring,
        scheduler,
        // Proof: omitting this callback forwarding made the cold mounted read answer 500.
        ...(admitConnectedOptimization === undefined ? {} : { admitConnectedOptimization }),
        // Proof: omitting this option made the isolated mounted arrange
        // enter live admission and answer 500 instead of 200.
        ...(schedulerMode === undefined ? {} : { schedulerMode }),
        clock,
      }),
      { factoryReturnKind: 'sync-value' },
    ),
  })
  .withServices({
    workItems: DiBag.createProvider(
      ({ workItemOptions }: { workItemOptions: WorkItemServiceOptions }): WorkItemService =>
        new WorkItemService(workItemOptions),
      { factoryReturnKind: 'sync-value' },
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
  .buildModule({ exportedServiceKeys: ['workItems'], moduleLabel: WORK_ITEM_LABEL });
