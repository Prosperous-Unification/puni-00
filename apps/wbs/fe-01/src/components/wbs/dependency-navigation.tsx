import { useEffect, useRef } from 'react';

import type { TypedDependencyView } from '@/lib/wbs-api';

import { endpointText } from './typed-dependency-editor';

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
 * Captured relationships stay inspectable without loaded endpoint choices.
 * Focus enters Back; Escape/ArrowLeft call the owner's picker-focus restoration.
 */
export function CapturedDependencyDetails({
  dependency,
  onClose,
}: {
  dependency: TypedDependencyView;
  onClose: () => void;
}) {
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
      <button ref={backButton} type="button" onClick={onClose}>
        Back to dependency picker
      </button>
    </div>
  );
}
