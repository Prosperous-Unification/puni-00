import { Button, SELECT_CLASS } from '@ui/saas-01';
import { useId } from 'react';

import { unreachable } from '@/lib/http';
import type { ProjectSummaryView } from '@/lib/wbs-api';

/** Destination metadata is a read outcome, never a mutation permission. */
/** Inactive means the session explicitly reported organizations off; it is not a successful empty read. */
export type ProjectChoices =
  | { readonly kind: 'inactive' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly projects: readonly ProjectSummaryView[] }
  | { readonly kind: 'refused' | 'failed'; readonly message: string };

/** Explicit destination shared by new-package and archival-import gestures. */
export function ProjectPicker({
  choices,
  selectedId,
  onChoose,
  onRefresh,
}: {
  choices: ProjectChoices;
  selectedId: string | null;
  onChoose: (projectId: string | null) => void;
  onRefresh: () => void;
}): React.JSX.Element {
  const identity = useId();
  switch (choices.kind) {
    case 'inactive':
      return (
        <p role="status" className="text-muted-foreground text-xs">
          Project actions are unavailable in this mode.
        </p>
      );
    case 'loading':
      return (
        <p role="status" className="text-muted-foreground text-xs">
          Loading projects…
        </p>
      );
    case 'refused':
    case 'failed':
      return (
        <div className="flex min-w-0 flex-col items-start gap-2 text-xs">
          <p role="alert">{choices.message}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
            Retry projects
          </Button>
        </div>
      );
    case 'ready':
      return (
        <div className="flex w-full min-w-0 flex-col items-start gap-2">
          {choices.projects.length === 0 ? (
            <p role="status" className="text-muted-foreground text-xs">
              No projects are available to you. A project is required to create or import a work
              package.
            </p>
          ) : (
            <label
              htmlFor={identity}
              className="flex w-full min-w-0 flex-col items-start gap-1 text-xs"
            >
              Destination project
              <select
                id={identity}
                value={selectedId ?? ''}
                className={`${SELECT_CLASS} w-full min-w-0`}
                onChange={(event) => {
                  onChoose(event.currentTarget.value === '' ? null : event.currentTarget.value);
                }}
              >
                <option value="">Choose a project</option>
                {choices.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={onRefresh}>
            Refresh projects
          </Button>
        </div>
      );
    default:
      return unreachable(choices);
  }
}
