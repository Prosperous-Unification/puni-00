import type { KeyboardEvent } from 'react';

import type { NodeReadingView, PlanRead, StepView } from '@/lib/wbs-api';

import type { TreeRow } from './wbs-rows';

/** Direct fact and progress stay independent of the derived node reading. */
export interface StepBlockageReading {
  isBlocked: boolean;
  isDone: boolean;
  progress: string;
  reading: NodeReadingView;
  causes: readonly string[];
}

/**
 * Resolves trusted root identities into names. Null explicitly means older server metadata.
 * @throws Error for incomplete supported metadata or a root outside the retained plan.
 */
export function stepBlockageOf(
  row: TreeRow,
  stepId: string,
  labels: ReadonlyMap<string, string>,
): StepBlockageReading | null {
  if (row.rolledUp || (row.blockages === undefined && row.blockageCauses === undefined))
    return null;
  // Proof: omitting this guard made `rejects incomplete supported metadata` report a TypeError instead of its contextual error (2026-10-14).
  if (row.blockages === undefined || row.blockageCauses === undefined)
    throw new Error(`Incomplete step blockage metadata for ${row.id}`);
  const reading = row.nodeReadings?.[stepId];
  // Proof: guard omitted, `rejects incomplete supported metadata and a missing node reading` did not throw (2026-10-14).
  if (reading === undefined) throw new Error(`Missing node reading for ${row.id} and ${stepId}`);
  const roots = row.blockageCauses[stepId];
  // Proof: guard omitted, `rejects a missing supported cause entry` did not throw; empty-root acceptance also made `rejects an empty blocked cause collection` fail (2026-10-14).
  if (
    (roots === undefined || roots.length === 0) &&
    (reading === 'blocked' || reading === 'blocked_by_proxy')
  )
    throw new Error(`Missing blockage causes for ${row.id} and ${stepId}`);
  const causes = (roots ?? []).map((root) => {
    const identity = root.kind === 'step' ? root.nodeId : root.workItemId;
    const label = labels.get(identity);
    // Proof: guard omitted, `rejects a missing supported cause entry and an unknown cause identity` did not throw (2026-10-14).
    if (label === undefined) throw new Error(`Unknown blockage cause ${identity}`);
    return label;
  });
  const progress = Object.hasOwn(row.progress, stepId) ? row.progress[stepId] : undefined;
  return {
    isBlocked: row.blockages[stepId] !== undefined,
    isDone: progress === 'done',
    progress: progress === 'done' ? 'Done' : progress === 'in_progress' ? 'In progress' : 'Unknown',
    reading,
    causes,
  };
}

/** The same visible explanation and step scoped action on desktop and phone. */
export function StepBlockageSection({
  blockage,
  label,
  setBlocked,
  onActionKeyDown,
  tapSized = false,
}: {
  blockage: StepBlockageReading | null;
  label: string;
  setBlocked?: (isBlocked: boolean) => void;
  tapSized?: boolean;
  onActionKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  if (blockage === null)
    return <div>Step blockage unknown — this server omits blockage details.</div>;
  return (
    // Proof: replacing both distinction words with “Step blockage” failed the preview browser direct/proxy assertion (2026-10-14).
    <section aria-label={`Step blockage on ${label}`}>
      <div>
        {blockage.isBlocked
          ? 'Direct step blockage'
          : blockage.reading === 'blocked_by_proxy'
            ? 'Blocked by dependency'
            : blockage.reading === 'blocked' || blockage.reading === 'on_hold'
              ? 'Blocked by work-item hold'
              : 'No direct step blockage'}
      </div>
      <div>Progress: {blockage.progress}</div>
      {blockage.isBlocked && blockage.isDone && (
        <div>Done takes precedence; the direct blockage is retained.</div>
      )}
      {/* Proof: omitting Cause text failed the preview browser exact named root assertion (2026-10-14). */}
      {blockage.causes.map((cause) => (
        <div key={cause}>Cause: {cause}</div>
      ))}
      {setBlocked !== undefined && (
        <button
          type="button"
          data-card-action
          className={tapSized ? 'min-h-11 min-w-11' : undefined}
          onKeyDown={onActionKeyDown}
          // Proof: disabling omitted, `allows clearing a retained done fact and refuses a new done fact` found an enabled new-block button (2026-10-14).
          disabled={blockage.isDone && !blockage.isBlocked}
          onClick={() => {
            setBlocked(!blockage.isBlocked);
          }}
          aria-label={
            blockage.isBlocked ? `Clear step blockage on ${label}` : `Block step ${label}`
          }
        >
          {blockage.isBlocked ? 'Clear step blockage' : 'Block step'}
        </button>
      )}
    </section>
  );
}

/** Names retained local nodes and captured foreign roots; unresolved roots throw in {@link stepBlockageOf}. */
export function blockageLabelsOf(
  rows: readonly TreeRow[],
  steps: readonly StepView[],
  nodes: PlanRead['stepNodes'],
  remote?: PlanRead['remoteBlockageLabels'],
): ReadonlyMap<string, string> {
  const labels = new Map(rows.map((row) => [row.id, `${row.number} · ${row.name}`]));
  const owners = new Map(rows.map((row) => [row.id, row]));
  const projectSteps = new Map(steps.map((step) => [step.id, step]));
  for (const node of nodes ?? []) {
    const row = owners.get(node.workItemId);
    const step = projectSteps.get(node.stepId);
    if (row !== undefined && step !== undefined)
      labels.set(node.id, `${node.reference ?? row.number} · ${row.name} · ${step.name}`);
  }
  // Proof: omitting this insertion failed unavailable hold/step and both rename/clear mounted layouts (2026-10-23).
  for (const { root, label } of remote ?? [])
    labels.set(root.kind === 'step' ? root.nodeId : root.workItemId, label);
  return labels;
}
