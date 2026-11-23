import type { Broadcaster, WorkPackageEvent } from '../ports/work-package-event';

export type OptimizationInputChanged = (workPackageId: string) => void;

/**
 * Whether `event` may move the schedule's input. An allowlist: an event left
 * out, such as the heartbeat's `claims_changed` (`wbs-claim-display` C4),
 * schedules nothing.
 */
function changesScheduleInput(event: WorkPackageEvent): boolean {
  // Proof: with `claims_changed` added to the list, `schedules no optimization
  // for claims_changed` (optimizer-trigger-broadcaster.test.ts) saw a trigger
  // (3 pass, 1 fail); watched 2026-10-23.
  return (
    // Proof: removing this predicate made held committed delivery notify no
    // recipient even though its recorded event reached transport.
    event.type === 'elsewhere_changed' ||
    event.type === 'tree_replaced' ||
    event.type === 'step_added' ||
    event.type === 'step_catalogue_changed' ||
    event.type === 'step_removed' ||
    // Proof: with this line removed, `starts the optimizer debounce after a
    // step allowance edit` saw no trigger (2026-09-27).
    event.type === 'step_updated' ||
    event.type === 'directory_changed' ||
    event.type === 'capacity_changed' ||
    event.type === 'work_package_settings_changed'
  );
}

/** One optimizer reaction policy for ordinary publication and already committed fan-out. */
export function reactToWorkPackageEvent(
  workPackageId: string,
  event: WorkPackageEvent,
  inputChanged: OptimizationInputChanged,
): void {
  if (changesScheduleInput(event)) inputChanged(workPackageId);
}

/**
 * Starts the optimizer's edit debounce only after the corresponding work package
 * event has been durably published. Name-only events may reach this boundary;
 * the canonical input hash suppresses them without spending another child.
 */
export class OptimizerTriggerBroadcaster implements Broadcaster {
  constructor(
    private readonly inner: Broadcaster,
    private readonly inputChanged: OptimizationInputChanged,
  ) {}

  async publish(workPackageId: string, event: WorkPackageEvent): Promise<void> {
    await this.inner.publish(workPackageId, event);
    reactToWorkPackageEvent(workPackageId, event, this.inputChanged);
  }

  latestSeq(workPackageId: string): Promise<number> {
    return this.inner.latestSeq(workPackageId);
  }
}
