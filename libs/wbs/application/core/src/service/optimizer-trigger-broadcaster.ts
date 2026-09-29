import type { Broadcaster, ProjectEvent } from '../ports/project-event';

export type OptimizationInputChanged = (projectId: string) => void;

/**
 * Whether `event` can change a project's canonical schedule input: what
 * starts the optimizer's debounce, and what makes `ElsewhereFanOut` compare
 * the project's bookings.
 */
export function changesScheduleInput(event: ProjectEvent): boolean {
  return (
    event.type === 'tree_replaced' ||
    event.type === 'step_added' ||
    event.type === 'step_removed' ||
    // Proof: with this line removed, `starts the optimizer debounce after a
    // step allowance edit` saw no trigger (2026-09-27).
    event.type === 'step_updated' ||
    event.type === 'directory_changed' ||
    event.type === 'capacity_changed' ||
    event.type === 'project_settings_changed' ||
    // Proof: this line removed made `re-solves a project below when the one
    // above moves` (`optimizer-trigger-broadcaster.test.ts`) see no trigger;
    // watched 2026-09-29.
    event.type === 'elsewhere_changed'
  );
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
    if (changesScheduleInput(event)) this.inputChanged(projectId);
  }

  latestSeq(projectId: string): Promise<number> {
    return this.inner.latestSeq(projectId);
  }
}
