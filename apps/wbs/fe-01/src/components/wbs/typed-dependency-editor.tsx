import type { ScopedDependencyEndpoint } from '@wbs/domain/typed-dependency';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type {
  PlanRead,
  StepView,
  TypedDependencyEndpoint,
  TypedDependencyType,
  TypedDependencyView,
} from '@/lib/wbs-api';

import { encodeDependencyEndpoint, serializeDependencyEndpoint } from './dependency-selection';
import type { CommitOutcome } from './live-editing';
import { didLand } from './live-editing';
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

/** One endpoint's compact spelling; captured descendant addresses name the parent, so step/scope words remain explicit. */
export function endpointText(
  endpoint: ReadEndpoint,
  rows: readonly TreeRow[],
  steps: readonly StepView[],
  nodes?: StepNodes,
): string {
  // Proof: bypassing captured endpoint words made the mounted null-reference case throw Unknown dependency work item remote-row (2026-10-22).
  if (endpoint.captured !== undefined) {
    const captured = endpoint.captured;
    // Proof: bypassing this branch failed `preserves non-null captured descendant selector` on desktop and phone (2026-10-22).
    if (endpoint.scope === 'descendant-step')
      return `${captured.qualifiedReference ?? `${captured.projectAbbreviation}.${captured.workItemNumber}`}${captured.step === null ? '' : ` · ${captured.step.name} step`} · all descendant work items`;
    // Proof: returning only a non-null reference failed `keeps captured node step name beside non-null address` on desktop and phone (2026-10-22).
    return `${captured.qualifiedReference ?? `${captured.projectAbbreviation}.${captured.workItemNumber}`}${captured.step === null ? '' : ` · ${captured.step.name} step`}`;
  }
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
  if (
    dependency.predecessor.captured !== undefined ||
    dependency.successor.captured !== undefined
  ) {
    const words = (endpoint: ReadEndpoint) => {
      const captured = endpoint.captured;
      return captured === undefined
        ? `${endpointText(endpoint, rows, steps, nodes)} ${rowOf(rows, endpoint.workItemId).name}`
        : `${endpointText(endpoint, rows, steps, nodes)} ${captured.name}`;
    };
    return {
      chip: `${endpointText(dependency.predecessor, rows, steps, nodes)} ${dependency.type} → ${endpointText(dependency.successor, rows, steps, nodes)}`,
      label: `${words(dependency.predecessor)} to ${words(dependency.successor)}, ${relationshipName(dependency.type)}`,
    };
  }
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

export interface DependencyEndpointChoice {
  key: string;
  endpoint: ScopedDependencyEndpoint;
  label: string;
  description: string;
  step: { id: string; name: string; code?: string | null } | null;
}
export interface DependencyEndpointEditor {
  heading: string;
  preferredKey: string | null;
  choices: readonly DependencyEndpointChoice[];
  unavailable: string;
}

/** Builds local scope choices from the actual hierarchy and this project's own step identities. */
export function buildLocalDependencyEditor(
  projectId: string,
  row: TreeRow,
  rows: readonly TreeRow[],
  steps: readonly StepView[],
  preferredKey = 'whole',
  availableStepIds?: readonly string[],
): DependencyEndpointEditor {
  const parent = rows.some((candidate) => candidate.parentId === row.id);
  return {
    heading: `${row.number} · ${row.name}`,
    preferredKey,
    unavailable: `${steps.find((step) => step.id === preferredKey)?.name ?? preferredKey} step unavailable for ${row.number}`,
    choices: endpointChoices(row, rows, steps, availableStepIds).map((choice) => {
      const step = choice.key === 'whole' ? null : stepOf(steps, choice.key);
      const scope = parent ? `every leaf under ${row.number}` : row.number;
      const endpoint: ScopedDependencyEndpoint =
        step === null
          ? { projectId, scope: 'whole', workItemId: row.id }
          : {
              projectId,
              scope: parent ? 'descendant-step' : 'node',
              workItemId: row.id,
              stepId: step.id,
            };
      return {
        key: choice.key,
        endpoint,
        label: choice.label,
        description:
          step === null
            ? scope
            : parent
              ? `the ${step.name} step of ${scope}`
              : `${scope}.${step.name} step`,
        step,
      };
    }),
  };
}

/** Retains the persisted coordinate exactly, including scope across hierarchy refreshes. */
export function buildPersistedSuccessorEditor(
  projectId: string,
  endpoint: ReadEndpoint,
  rows: readonly TreeRow[],
  steps: readonly StepView[],
): DependencyEndpointEditor {
  const coordinate = endpoint.captured?.endpoint ?? endpoint;
  const row = rows.find((candidate) => candidate.id === coordinate.workItemId);
  let persisted: ScopedDependencyEndpoint;
  if (coordinate.scope === 'whole') {
    persisted = { projectId, scope: 'whole', workItemId: coordinate.workItemId };
  } else {
    // Proof: bypassing this guard failed the missing persisted local successor identity test (2026-10-23).
    if (coordinate.stepId === undefined)
      throw new Error('Missing persisted dependency step identity');
    persisted = {
      projectId,
      scope: coordinate.scope,
      workItemId: coordinate.workItemId,
      stepId: coordinate.stepId,
    };
  }
  const editor =
    row === undefined ? undefined : buildLocalDependencyEditor(projectId, row, rows, steps);
  return {
    heading: editor?.heading ?? coordinate.workItemId,
    // Proof: forcing Whole failed mounted exact node and descendant-step initialization on both surfaces (2026-10-23).
    preferredKey: encodeDependencyEndpoint(persisted),
    unavailable: 'Persisted successor scope unavailable. Choose a current scope.',
    choices:
      editor?.choices.map((choice) => ({
        ...choice,
        // Proof: step-only keys silently rebound stale node drafts to descendant-step; both mounted hierarchy-refresh cases failed (2026-10-23).
        key: encodeDependencyEndpoint(choice.endpoint),
      })) ?? [],
  };
}

/** Compatibility entry for existing local edit targets; the editor itself consumes independent models. */
export function TypedDependencyEditor({
  projectId,
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
  projectId: string;
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
  ) => Promise<CommitOutcome>;
  onRemove?: () => Promise<CommitOutcome>;
}) {
  const initialKey = (endpoint: ReadEndpoint | undefined) =>
    endpoint?.scope === 'whole' ? 'whole' : endpoint?.stepId;
  return (
    <ScopedDependencyEditor
      predecessor={buildLocalDependencyEditor(
        projectId,
        predecessor,
        rows,
        steps,
        initialKey(dependency?.predecessor) ?? preferredStepId ?? 'whole',
        availablePredecessorStepIds,
      )}
      successor={buildLocalDependencyEditor(
        projectId,
        successor,
        rows,
        steps,
        initialKey(dependency?.successor) ?? preferredStepId ?? 'whole',
      )}
      isEditing={dependency !== undefined}
      initialType={dependency?.type ?? 'FS'}
      onCancel={onCancel}
      onSave={(source, target, type) =>
        onSave(
          serializeDependencyEndpoint(source, projectId),
          serializeDependencyEndpoint(target, projectId),
          type,
        )
      }
      onRemove={onRemove}
    />
  );
}

/** Each endpoint owns its identity, choices and unavailable reading; no cross-project row/step lookup occurs. */
export function ScopedDependencyEditor({
  predecessor,
  successor,
  isEditing = false,
  initialType = 'FS',
  onCancel,
  onSave,
  onRemove,
}: {
  predecessor: DependencyEndpointEditor;
  successor: DependencyEndpointEditor;
  isEditing?: boolean;
  initialType?: string;
  onCancel: () => void;
  onSave: (
    source: ScopedDependencyEndpoint,
    target: ScopedDependencyEndpoint,
    type: TypedDependencyType,
  ) => Promise<CommitOutcome>;
  onRemove?: () => Promise<CommitOutcome>;
}) {
  const [manualPredecessorKey, setManualPredecessorKey] = useState<string | null>(null);
  const [manualSuccessorKey, setManualSuccessorKey] = useState<string | null>(null);
  const [relationshipType, setRelationshipType] = useState<TypedDependencyType>(() => {
    return dependencyTypeOf(initialType);
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // Layout cleanup retires this gesture before a pending completion can affect its replacement.
  const retired = useRef(false);
  useLayoutEffect(() => {
    retired.current = false;
    return () => {
      retired.current = true;
    };
  }, []);
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
  const predecessors = predecessor.choices;
  const successors = successor.choices;
  const predecessorKey = manualPredecessorKey ?? predecessor.preferredKey;
  const successorKey = manualSuccessorKey ?? successor.preferredKey;
  const chosenPredecessor = predecessors.find((choice) => choice.key === predecessorKey);
  const chosenSuccessor = successors.find((choice) => choice.key === successorKey);
  const save = async () => {
    if (chosenPredecessor === undefined || chosenSuccessor === undefined) return;
    setBusy(true);
    const outcome = await onSave(
      chosenPredecessor.endpoint,
      chosenSuccessor.endpoint,
      relationshipType,
    );
    // Proof: removing this retired-session fence closed the newer desktop/phone editor and lost its SS choice (mounted round2 tests).
    if (retired.current) return;
    setBusy(false);
    if (didLand(outcome)) onCancel();
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
        {predecessor.heading} → {successor.heading}
      </p>
      <label>
        Predecessor
        <select
          value={predecessorKey ?? ''}
          onChange={(event) => {
            setManualPredecessorKey(event.target.value);
          }}
        >
          {predecessors.map((choice) => (
            <option key={choice.key} value={choice.key}>
              {choice.label}
            </option>
          ))}
          {chosenPredecessor === undefined && (
            <option value={predecessorKey ?? ''} disabled>
              {predecessor.unavailable}
            </option>
          )}
        </select>
      </label>
      <label>
        This work item
        <select
          value={successorKey ?? ''}
          onChange={(event) => {
            setManualSuccessorKey(event.target.value);
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
        {relationshipName(relationshipType)}:{' '}
        {chosenSuccessor?.description ?? successor.unavailable}{' '}
        {relationshipType === 'FF' ? 'finishes' : 'starts'} no earlier than{' '}
        {chosenPredecessor?.description ?? predecessor.unavailable}{' '}
        {relationshipType === 'SS' ? 'starts' : 'finishes'}.
      </p>
      {message !== '' && <p role="alert">{message}</p>}
      <div className="typed-dependency-actions">
        {isEditing && onRemove !== undefined && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                const outcome = await onRemove();
                // Proof: bypassing this fence invoked the old cancellation callback after the removal editor was replaced (scoped editor round2 negative).
                if (retired.current) return;
                setBusy(false);
                if (didLand(outcome)) onCancel();
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
          {!isEditing ? 'Add' : 'Save'}
        </button>
      </div>
    </div>
  );
}
