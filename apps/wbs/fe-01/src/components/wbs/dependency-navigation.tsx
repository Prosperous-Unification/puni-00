import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { TypedDependencyType, TypedDependencyView } from '@/lib/wbs-api';

import type { CommitOutcome } from './live-editing';
import { didLand } from './live-editing';
import { endpointText, relationshipName } from './typed-dependency-editor';

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
 * Captured relationships keep their observed endpoints fixed; an owner may change only FS/SS/FF.
 * Without a writer they remain inspectable without endpoint lookup.
 * Focus enters Back; Escape/ArrowLeft call the owner's picker-focus restoration.
 */
export function CapturedDependencyDetails({
  dependency,
  onClose,
  onSave,
}: {
  dependency: TypedDependencyView;
  onClose: () => void;
  onSave?: (type: TypedDependencyType) => Promise<CommitOutcome>;
}) {
  const [type, setType] = useState(() => readRelationship(dependency.type));
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
      <p>Relationship: {dependency.type}. Changing captured remote scopes is unavailable here.</p>
      {onSave !== undefined && (
        <>
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
            // Proof: forcing enabled failed both mounted pending captured edit cases at the duplicate-Save assertion (2026-10-23).
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onSave(type).then((outcome) => {
                // Proof: removing this fence let a pending completion close the reopened desktop/phone editor (2026-10-23).
                if (retired.current) return;
                setBusy(false);
                if (didLand(outcome)) onClose();
                else setMessage('Dependency refused. Review the relationship and try again.');
              });
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
