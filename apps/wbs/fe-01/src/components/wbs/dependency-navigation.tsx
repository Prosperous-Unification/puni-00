import type { ScopedDependencyEndpoint } from '@wbs/domain/typed-dependency';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { TypedDependencyType, TypedDependencyView } from '@/lib/wbs-api';
import type { DependencyLookup } from '@/modules/dependency-lookup/contract';

import { encodeDependencyEndpoint } from './dependency-selection';
import type { CommitOutcome } from './live-editing';
import { didLand } from './live-editing';
import type { DependencyEndpointEditor } from './typed-dependency-editor';
import { endpointText, relationshipName } from './typed-dependency-editor';
import { useDependencySearch } from './use-dependency-search';

/** Links captured endpoints by stable identity; labels never participate in navigation lookup. */
export function DependencyNavigation({ dependency }: { dependency: TypedDependencyView }) {
  return (
    <>
      {[dependency.predecessor, dependency.successor].map((endpoint, index) => {
        const captured = endpoint.captured;
        if (captured === undefined) return null;
        // Proof: substituting the abbreviation for projectId failed both mounted stable-link href assertions (2026-10-22).
        const query = new URLSearchParams({
          project: captured.endpoint.projectId,
          workItem: captured.endpoint.workItemId,
        });
        if (captured.stepNodeId !== null) query.set('stepNode', captured.stepNodeId);
        const label = endpointText(endpoint, [], []);
        return (
          <a key={index} href={`/?${query.toString()}`} aria-label={`Open ${label}`}>
            {label} · {captured.name}
          </a>
        );
      })}
    </>
  );
}

/**
 * Owners edit captured scopes from current evidence and preserve stable relationship identity.
 * Without a writer they remain inspectable without endpoint lookup.
 * Focus enters Back; Escape/ArrowLeft call the owner's picker-focus restoration.
 */
function CapturedDependencyForm({
  dependency,
  onClose,
  onSave,
  successor,
  predecessor,
  editPredecessor,
}: {
  dependency: TypedDependencyView;
  onClose: () => void;
  onSave?: (
    type: TypedDependencyType,
    successor: ScopedDependencyEndpoint,
    predecessor?: ScopedDependencyEndpoint,
  ) => Promise<CommitOutcome>;
  successor?: DependencyEndpointEditor;
  predecessor?: DependencyEndpointEditor;
  editPredecessor?: () => void;
}) {
  const [type, setType] = useState(() => readRelationship(dependency.type));
  const [manualKey, setManualKey] = useState<string | null>(null);
  const successorKey = manualKey ?? successor?.preferredKey;
  const chosenSuccessor = successor?.choices.find((choice) => choice.key === successorKey);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const chosenSource = predecessor?.choices.find(
    (choice) => choice.key === (sourceKey ?? predecessor.preferredKey),
  );
  const sourceUnavailable = predecessor !== undefined && chosenSource === undefined;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const retired = useRef(false);
  useLayoutEffect(() => {
    retired.current = false;
    return () => {
      retired.current = true;
    };
  }, []);
  const backButton = useRef<HTMLButtonElement>(null);
  // Proof: removing this effect failed `focuses captured details on keyboard entry` on desktop and phone (2026-10-22).
  useEffect(() => backButton.current?.focus(), []);
  return (
    <div
      role="dialog"
      aria-label="Captured dependency"
      className="typed-dependency-editor"
      ref={(element) => {
        if (element === null) return;
        const closeForKey = (event: KeyboardEvent) => {
          // Proof: excluding each key independently failed `dismisses captured details with Escape` and `dismisses captured details with ArrowLeft` on both surfaces (2026-10-22).
          if (event.key !== 'Escape' && event.key !== 'ArrowLeft') return;
          // Proof: removing this selector guard failed both mounted captured-selector ArrowLeft cases (2026-10-23).
          if (event.key === 'ArrowLeft' && event.target instanceof HTMLSelectElement) return;
          event.preventDefault();
          event.stopPropagation();
          onClose();
        };
        element.addEventListener('keydown', closeForKey);
        return () => {
          element.removeEventListener('keydown', closeForKey);
        };
      }}
    >
      <DependencyNavigation dependency={dependency} />
      <p>Relationship: {dependency.type}. Captured endpoints retain their stable identities.</p>
      {onSave !== undefined && (
        <>
          {/* Proof: enabling this action during a fixed-endpoint Save failed both mounted pending captured-edit cases (2026-10-23). */}
          {editPredecessor !== undefined && (
            <button type="button" disabled={busy} onClick={editPredecessor}>
              Edit predecessor scope
            </button>
          )}
          {predecessor !== undefined && (
            <label>
              Predecessor scope
              <select
                value={sourceKey ?? predecessor.preferredKey ?? ''}
                // Proof: enabling this selector failed both mounted pending predecessor-scope controls (2026-10-23).
                disabled={busy}
                onChange={(event) => {
                  setSourceKey(event.target.value);
                }}
              >
                {predecessor.choices.map((choice) => (
                  <option key={choice.key} value={choice.key}>
                    {choice.label}
                  </option>
                ))}
                {chosenSource === undefined && (
                  <option value={sourceKey ?? predecessor.preferredKey ?? ''} disabled>
                    {predecessor.unavailable}
                  </option>
                )}
              </select>
            </label>
          )}
          {sourceUnavailable && <p role="alert">{predecessor.unavailable}</p>}
          <label>
            This work item
            <select
              value={successorKey ?? ''}
              // Proof: enabling this select while pending failed both mounted pending-scope assertions (2026-10-23).
              disabled={busy}
              onChange={(event) => {
                setManualKey(event.target.value);
              }}
            >
              {successor?.choices.map((choice) => (
                <option key={choice.key} value={choice.key}>
                  {choice.label}
                </option>
              ))}
              {chosenSuccessor === undefined && (
                <option value={successorKey ?? ''} disabled>
                  {successor?.unavailable}
                </option>
              )}
            </select>
          </label>
          {chosenSuccessor === undefined && <p role="alert">{successor?.unavailable}</p>}
          <label>
            Relationship
            <select
              value={type}
              disabled={busy}
              onChange={(event) => {
                setType(readRelationship(event.target.value));
              }}
            >
              {(['FS', 'SS', 'FF'] as const).map((choice) => (
                <option key={choice} value={choice}>
                  {choice} · {relationshipName(choice)}
                </option>
              ))}
            </select>
          </label>
          {message !== '' && <p role="alert">{message}</p>}
          <button
            type="button"
            // Proof: removing sourceUnavailable enabled Save before fresh exact predecessor selection in all six mounted remote scope cases (2026-10-23).
            // Proof: allowing unavailable scopes enabled Save in both mounted stale hierarchy cases; pending captured edit cases also prove duplicate-Save refusal (2026-10-23).
            disabled={busy || chosenSuccessor === undefined || sourceUnavailable}
            onClick={() => {
              if (chosenSuccessor === undefined || sourceUnavailable) return;
              setBusy(true);
              void onSave(type, chosenSuccessor.endpoint, chosenSource?.endpoint).then(
                (outcome) => {
                  // Proof: removing this fence let a pending completion close the reopened desktop/phone editor (2026-10-23).
                  if (retired.current) return;
                  setBusy(false);
                  if (didLand(outcome)) onClose();
                  else setMessage('Dependency refused. Review the relationship and try again.');
                },
              );
            }}
          >
            Save
          </button>
        </>
      )}
      <button ref={backButton} type="button" onClick={onClose}>
        Back to dependency picker
      </button>
    </div>
  );
}

/** Rejects unknown trusted relationship kinds instead of inventing a writable default. */
function readRelationship(type: string): TypedDependencyType {
  // Proof: returning FS unconditionally failed the rendered unknown captured relationship case (2026-10-23).
  if (type === 'FS' || type === 'SS' || type === 'FF') return type;
  throw new Error(`Unknown dependency relationship ${type}`);
}

/** Owners deliberately open a fresh read observation before changing a remote endpoint scope. */
export function CapturedDependencyDetails(
  props: Parameters<typeof CapturedDependencyForm>[0] & {
    lookup?: DependencyLookup;
    ownerProjectId?: string;
  },
) {
  const captured = props.dependency.predecessor.captured;
  if (props.lookup !== undefined && props.ownerProjectId !== undefined && captured !== undefined)
    return (
      <PersistedPredecessorDetails
        {...props}
        captured={captured}
        lookup={props.lookup}
        ownerProjectId={props.ownerProjectId}
      />
    );
  return <CapturedDependencyForm {...props} />;
}

/** Scope evidence is bound to the captured stable project and row; incomplete observations cannot authorize a save. */
function PersistedPredecessorDetails(
  props: Parameters<typeof CapturedDependencyForm>[0] & {
    lookup: DependencyLookup;
    ownerProjectId: string;
    captured: NonNullable<TypedDependencyView['predecessor']['captured']>;
  },
) {
  const captured = props.captured;
  const [editingSource, setEditingSource] = useState(false);
  const search = useDependencySearch({
    lookup: props.lookup,
    projectId: props.ownerProjectId,
    ownerId: `persisted:${props.dependency.id}`,
    // Proof: eager lookup failed the mounted delayed no-search assertion before the explicit scope action (2026-10-23).
    active: editingSource,
    typed: `${captured.projectAbbreviation}.${captured.workItemNumber}`,
    setTyped: () => {
      throw new Error('Persisted scope editing cannot change project');
    },
    localEntries: [],
    boundProject: {
      projectId: captured.endpoint.projectId,
      abbreviation: captured.projectAbbreviation,
      name: captured.projectAbbreviation,
    },
  });
  // Proof: bypassing completeness enabled Save before More scopes in both mounted paginated predecessor cases (2026-10-23).
  const choices = search.complete
    ? search.options.flatMap((option) => {
        // Proof: removing the work-item predicate exposed Whole work item from a different row on both surfaces (2026-10-23).
        if (
          option.kind !== 'endpoint' ||
          option.selection.kind !== 'remote' ||
          option.selection.endpoint.workItemId !== captured.endpoint.workItemId
        )
          return [];
        const endpoint = option.selection.endpoint;
        const candidate = option.selection.candidate;
        // DependencyLookup validates matching step evidence for every non-whole candidate at its boundary.
        const label =
          endpoint.scope === 'whole'
            ? 'Whole work item'
            : `${(candidate.step as { name: string }).name}${endpoint.scope === 'descendant-step' ? ' across all descendants' : ' step'}`;
        return [
          {
            key: encodeDependencyEndpoint(endpoint),
            endpoint,
            label,
            description: option.label,
            step: option.selection.candidate.step ?? null,
          },
        ];
      })
    : [];
  return (
    <>
      {editingSource && search.state === 'loading' && (
        <p role="status">Loading predecessor scopes…</p>
      )}
      {editingSource &&
        ['failure', 'refused', 'stale', 'cancelled', 'empty'].includes(search.state) && (
          <p role="alert">
            Predecessor scopes unavailable.{' '}
            <button type="button" onClick={search.retry}>
              Retry scopes
            </button>
          </p>
        )}
      {search.more !== null && (
        <button type="button" onClick={search.more}>
          More scopes
        </button>
      )}
      <CapturedDependencyForm
        {...props}
        editPredecessor={
          !editingSource
            ? () => {
                setEditingSource(true);
              }
            : undefined
        }
        predecessor={
          editingSource
            ? {
                heading: 'Predecessor scope',
                // Proof: preferring the first choice enabled Save while the captured step was unavailable in all six mounted scope cases (2026-10-23).
                preferredKey: JSON.stringify([
                  captured.endpoint.projectId,
                  captured.endpoint.workItemId,
                  captured.endpoint.scope,
                  captured.endpoint.scope === 'whole' ? null : captured.endpoint.stepId,
                ]),
                choices,
                unavailable: 'Choose predecessor scope; current scope is unavailable or ambiguous.',
              }
            : undefined
        }
      />
    </>
  );
}
