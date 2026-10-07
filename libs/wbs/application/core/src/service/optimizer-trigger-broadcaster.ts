import type { Broadcaster, ProjectEvent } from '../ports/project-event';

export type OptimizationInputChanged = (projectId: string) => void;

function changesScheduleInput(event: ProjectEvent): boolean {
  return (
    // Proof: removing this predicate made held committed delivery notify no
    // recipient even though its recorded event reached transport.
    event.type === 'elsewhere_changed' ||
    event.type === 'tree_replaced' ||
    event.type === 'step_added' ||
    event.type === 'step_removed' ||
    // Proof: with this line removed, `starts the optimizer debounce after a
    // step allowance edit` saw no trigger (2026-09-27).
    event.type === 'step_updated' ||
    event.type === 'directory_changed' ||
    event.type === 'capacity_changed' ||
    event.type === 'project_settings_changed'
  );
}

/** One optimizer reaction policy for ordinary publication and already committed fan-out. */
export function reactToProjectEvent(
  projectId: string,
  event: ProjectEvent,
  inputChanged: OptimizationInputChanged,
): void {
  if (changesScheduleInput(event)) inputChanged(projectId);
}

/**
 * Starts the optimizer's edit debounce only after the corresponding project
 * event has been durably published. Name-only events may reach this boundary;
 * the canonical input hash suppresses them without spending another child.
 */
export class OptimizerTriggerBroadcaster implements Broadcaster {
  constructor(
    private readonly inner: Broadcaster,
    private readonly inputChanged: OptimizationInputChanged,
  ) {}

  async publish(projectId: string, event: ProjectEvent): Promise<void> {
    await this.inner.publish(projectId, event);
    reactToProjectEvent(projectId, event, this.inputChanged);
  }

  latestSeq(projectId: string): Promise<number> {
    return this.inner.latestSeq(projectId);
  }
}
