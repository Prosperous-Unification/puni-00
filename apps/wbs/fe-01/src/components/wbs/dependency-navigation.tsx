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

/** A captured remote relationship remains inspectable even when endpoint choices have not been loaded. */
export function CapturedDependencyDetails({
  dependency,
  onClose,
}: {
  dependency: TypedDependencyView;
  onClose: () => void;
}) {
  return (
    <div role="dialog" aria-label="Captured dependency">
      <DependencyNavigation dependency={dependency} />
      <p>Relationship: {dependency.type}. Changing captured remote scopes is unavailable here.</p>
      <button type="button" onClick={onClose}>
        Back to dependency picker
      </button>
    </div>
  );
}
