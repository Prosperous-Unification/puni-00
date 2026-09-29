import { useEffect, useRef, useState } from 'react';

import type {
  PlanRead,
  StepView,
  TypedDependencyEndpoint,
  TypedDependencyType,
  TypedDependencyView,
} from '@/lib/wbs-api';

import type { TreeRow } from './wbs-rows';

type ReadEndpoint = TypedDependencyView['predecessor'];
type StepNodes = NonNullable<PlanRead['stepNodes']>;

function nodeCode(endpoint: ReadEndpoint, row: TreeRow, step: StepView, nodes?: StepNodes): string {
  const node = nodes?.find(
    (candidate) =>
      candidate.id === endpoint.stepNodeId ||
      (candidate.workItemId === row.id && candidate.stepId === step.id),
  );
  // Proof: removing this read-integrity check made `spells whole, node and descendant scopes` resolve instead of throwing for an absent step node; watched 2026-09-27.
  if (nodes !== undefined && node === undefined)
    throw new Error(`Missing dependency step node for ${row.id} and ${step.id}`);
  // Proof: with the null branch removed, `uses work-item and step words when a server node has no reference` received invented `010.dev`; watched 2026-09-28.
  if (node?.reference === null) return `${row.number} · ${step.name} step`;
  return (
    node?.reference ?? `${row.number}.${step.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`
  );
}

/** The server's node address is opaque to the editor except when making a new selection. */
export function nodeEndpoint(workItemId: string, stepId: string): TypedDependencyEndpoint {
  return { scope: 'node', stepNodeId: `sn1.${workItemId}.${stepId}` };
}

function leavesUnder(rows: readonly TreeRow[], workItemId: string): number {
  const children = rows.filter((row) => row.parentId === workItemId);
  return children.length === 0
    ? 1
    : children.reduce((count, child) => count + leavesUnder(rows, child.id), 0);
}

function stepOf(steps: readonly StepView[], stepId: string | undefined): StepView {
  const step = steps.find((candidate) => candidate.id === stepId);
  if (step === undefined) throw new Error(`Unknown dependency step ${String(stepId)}`);
  return step;
}

function rowOf(rows: readonly TreeRow[], workItemId: string): TreeRow {
  const row = rows.find((candidate) => candidate.id === workItemId);
  if (row === undefined) throw new Error(`Unknown dependency work item ${workItemId}`);
  return row;
}

/** One endpoint's compact spelling, preserving the parent selector's expansion. */
export function endpointText(
  endpoint: ReadEndpoint,
  rows: readonly TreeRow[],
  steps: readonly StepView[],
  nodes?: StepNodes,
): string {
  const row = rowOf(rows, endpoint.workItemId);
  if (endpoint.scope === 'whole') return row.number;
  const step = stepOf(steps, endpoint.stepId);
  if (endpoint.scope === 'descendant-step')
    return `${row.number} · all ${step.name} (${String(leavesUnder(rows, row.id))})`;
  return nodeCode(endpoint, row, step, nodes);
}

/** Compact chip text and a complete spoken relationship. */
export function dependencyWords(
  dependency: TypedDependencyView,
  rows: readonly TreeRow[],
  steps: readonly StepView[],
  nodes?: StepNodes,
) {
  const predecessor = rowOf(rows, dependency.predecessor.workItemId);
  const successor = rowOf(rows, dependency.successor.workItemId);
  const source = endpointText(dependency.predecessor, rows, steps, nodes);
  const target =
    dependency.successor.scope === 'whole'
      ? ''
      : dependency.successor.scope === 'node'
        ? ` → ${(() => {
            const code = nodeCode(
              dependency.successor,
              successor,
              stepOf(steps, dependency.successor.stepId),
              nodes,
            );
            return code.startsWith(`${successor.number}.`)
              ? code.slice(successor.number.length + 1)
              : code;
          })()}`
        : ` → all ${stepOf(steps, dependency.successor.stepId).name} (${String(leavesUnder(rows, successor.id))})`;
  const nameOf = (endpoint: ReadEndpoint, row: TreeRow) =>
    endpoint.scope === 'whole'
      ? `whole work item ${row.number} ${row.name}`
      : endpoint.scope === 'node'
        ? `${stepOf(steps, endpoint.stepId).name} step of ${row.number} ${row.name}`
        : `${stepOf(steps, endpoint.stepId).name} step of all descendant work items under ${row.number} ${row.name}`;
  return {
    chip: `${source} ${dependency.type}${target}`,
    label: `${nameOf(dependency.predecessor, predecessor)} to ${nameOf(dependency.successor, successor)}, ${relationshipName(dependency.type)}`,
  };
}

/** The full relationship name used by chips and the lower-bound explanation. */
export function relationshipName(type: string): string {
  switch (type) {
    case 'FS':
      return 'Finish-to-start';
    case 'SS':
      return 'Start-to-start';
    case 'FF':
      return 'Finish-to-finish';
    default:
      // Proof: treating unknown SF as FS made `refuses an unknown relationship in a read chip and an edit` stop throwing for dependencyWords; watched 2026-09-28.
      throw new Error(`Unknown dependency relationship ${type}`);
  }
}

function dependencyTypeOf(type: string): TypedDependencyType {
  if (type === 'FS' || type === 'SS' || type === 'FF') return type;
  // Proof: coercing an unknown SF edit to FS made `refuses an unknown relationship in a read chip and an edit` stop throwing in the editor; watched 2026-09-28.
  throw new Error(`Unknown dependency relationship ${type}`);
}

/** Scope choices in project step order; a parent expands each step across its leaves. */
export function endpointChoices(
  row: TreeRow,
  rows: readonly TreeRow[],
  steps: readonly StepView[],
  availableStepIds?: readonly string[],
): { key: string; label: string; endpoint: TypedDependencyEndpoint }[] {
  const isParent = rows.some((candidate) => candidate.parentId === row.id);
  return [
    {
      key: 'whole',
      label: isParent
        ? `All descendant work items (${String(leavesUnder(rows, row.id))})`
        : 'Whole work item',
      endpoint: { scope: 'whole', workItemId: row.id },
    },
    ...steps
      .filter(
        (step) => isParent || availableStepIds === undefined || availableStepIds.includes(step.id),
      )
      .map((step) => ({
        key: step.id,
        label: isParent
          ? `All descendant work items · ${step.name} (${String(leavesUnder(rows, row.id))})`
          : `${step.name} step`,
        endpoint: isParent
          ? {
              scope: 'descendant-step' as const,
              workItemId: row.id,
              stepId: step.id,
            }
          : nodeEndpoint(row.id, step.id),
      })),
  ];
}

export function TypedDependencyEditor({
  predecessor,
  successor,
  rows,
  steps,
  dependency,
  preferredStepId,
  availablePredecessorStepIds,
  onCancel,
  onSave,
  onRemove,
}: {
  predecessor: TreeRow;
  successor: TreeRow;
  rows: readonly TreeRow[];
  steps: readonly StepView[];
  dependency?: TypedDependencyView;
  preferredStepId?: string;
  availablePredecessorStepIds?: readonly string[];
  onCancel: () => void;
  onSave: (
    predecessor: TypedDependencyEndpoint,
    successor: TypedDependencyEndpoint,
    type: TypedDependencyType,
  ) => Promise<'landed' | 'refused' | 'unsent'>;
  onRemove?: () => Promise<'landed' | 'refused' | 'unsent'>;
}) {
  const initialKey = (endpoint: ReadEndpoint | undefined) =>
    endpoint?.scope === 'whole' ? 'whole' : endpoint?.stepId;
  // Proof: replacing the preferred step id with its name made `proposes the same step id on both sides` fail with `Unknown dependency step QA`; watched 2026-09-27.
  const [predecessorKey, setPredecessorKey] = useState(
    initialKey(dependency?.predecessor) ?? preferredStepId ?? 'whole',
  );
  const [successorKey, setSuccessorKey] = useState(
    initialKey(dependency?.successor) ?? preferredStepId ?? 'whole',
  );
  const [relationshipType, setRelationshipType] = useState<TypedDependencyType>(() => {
    if (dependency === undefined) return 'FS';
    return dependencyTypeOf(dependency.type);
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const backButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => backButton.current?.focus(), []);
  useEffect(() => {
    const element = dialog.current;
    if (element === null) throw new Error('Missing dependency editor dialog');
    const returnToList = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'ArrowLeft') return;
      // Proof: without the form-control guard, `keeps ArrowLeft inside a scope selector` called onCancel; watched 2026-09-28.
      if (
        event.key === 'ArrowLeft' &&
        event.target instanceof HTMLElement &&
        event.target.closest('input, select, textarea, [contenteditable="true"]') !== null
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      // Proof: without ArrowLeft here, the ›/ArrowLeft keyboard case kept
      // the editor open instead of returning to the list. Watched 2026-09-28.
      onCancel();
    };
    element.addEventListener('keydown', returnToList);
    return () => {
      element.removeEventListener('keydown', returnToList);
    };
  }, [onCancel]);
  const predecessors = endpointChoices(predecessor, rows, steps, availablePredecessorStepIds);
  const successors = endpointChoices(successor, rows, steps);
  // Proof: substituting the available Dev choice for a missing QA node made `marks a missing predecessor step unavailable` fail: the selector no longer held QA; watched 2026-09-27.
  const chosenPredecessor = predecessors.find((choice) => choice.key === predecessorKey);
  const chosenSuccessor = successors.find((choice) => choice.key === successorKey);
  const selectedEndpointWords = (row: TreeRow, key: string): string => {
    const parent = rows.some((candidate) => candidate.parentId === row.id);
    const scope = parent ? `every leaf under ${row.number}` : row.number;
    return key === 'whole'
      ? scope
      : parent
        ? `the ${stepOf(steps, key).name} step of ${scope}`
        : `${scope}.${stepOf(steps, key).name} step`;
  };
  const save = async () => {
    if (chosenPredecessor === undefined || chosenSuccessor === undefined) return;
    setBusy(true);
    const outcome = await onSave(
      chosenPredecessor.endpoint,
      chosenSuccessor.endpoint,
      relationshipType,
    );
    setBusy(false);
    if (outcome === 'landed') onCancel();
    else setMessage('Dependency refused. Review the selected scopes and try again.');
  };
  return (
    <div
      ref={dialog}
      role="dialog"
      aria-label="Customize dependency"
      className="typed-dependency-editor"
    >
      <button
        ref={backButton}
        type="button"
        onClick={onCancel}
        aria-label="Back to dependency picker"
      >
        ← Dependencies
      </button>
      <p>
        {predecessor.number} · {predecessor.name} → {successor.number} · {successor.name}
      </p>
      <label>
        Predecessor
        <select
          value={predecessorKey}
          onChange={(event) => {
            setPredecessorKey(event.target.value);
          }}
        >
          {predecessors.map((choice) => (
            <option key={choice.key} value={choice.key}>
              {choice.label}
            </option>
          ))}
          {chosenPredecessor === undefined && (
            <option value={predecessorKey} disabled>
              {steps.find((step) => step.id === predecessorKey)?.name ?? predecessorKey} step
              unavailable for {predecessor.number}
            </option>
          )}
        </select>
      </label>
      <label>
        This work item
        <select
          value={successorKey}
          onChange={(event) => {
            setSuccessorKey(event.target.value);
          }}
        >
          {successors.map((choice) => (
            <option key={choice.key} value={choice.key}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Relationship
        <select
          value={relationshipType}
          onChange={(event) => {
            setRelationshipType(dependencyTypeOf(event.target.value));
          }}
        >
          <option value="FS">FS · Finish-to-start</option>
          <option value="SS">SS · Start-to-start</option>
          <option value="FF">FF · Finish-to-finish</option>
        </select>
      </label>
      <p>
        {relationshipName(relationshipType)}: {selectedEndpointWords(successor, successorKey)}{' '}
        {relationshipType === 'FF' ? 'finishes' : 'starts'} no earlier than{' '}
        {selectedEndpointWords(predecessor, predecessorKey)}{' '}
        {relationshipType === 'SS' ? 'starts' : 'finishes'}.
      </p>
      {message !== '' && <p role="alert">{message}</p>}
      <div className="typed-dependency-actions">
        {dependency !== undefined && onRemove !== undefined && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                const outcome = await onRemove();
                setBusy(false);
                if (outcome === 'landed') onCancel();
                else setMessage('Dependency removal refused.');
              })();
            }}
          >
            Remove
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || chosenPredecessor === undefined || chosenSuccessor === undefined}
          onClick={() => void save()}
        >
          {dependency === undefined ? 'Add' : 'Save'}
        </button>
      </div>
    </div>
  );
}
