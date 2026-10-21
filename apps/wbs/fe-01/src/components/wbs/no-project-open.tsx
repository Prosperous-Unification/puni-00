import { Button, buttonVariants, MENU_ITEM } from '@ui/saas-01';
import { useId } from 'react';

import { cn } from '@/lib/utils';
import type { ProjectListEntry } from '@/lib/wbs-api';

import { projectCardMeta } from './project-picker';
import type { PlanImportControl } from './use-plan-import';

/** How many of the account's projects the empty home offers by name. */
const RECENT_SHOWN = 5;

export interface NoProjectOpenProps {
  /** This account's projects in be-01's own order: opened by recency, then never-opened. */
  projects: readonly ProjectListEntry[];
  onOpen: (projectId: string) => void;
  onCreate: () => void;
  planImport: PlanImportControl;
  /** This account's "today", for the last-opened words. */
  now: Date;
}

/**
 * What the plan page shows while no project is open: the way to one.
 *
 * It was a blank page under the header (UI review F-019), and with two or more
 * projects and none remembered by this browser — a fresh browser, a cleared
 * one, another account's last project — every load landed there (F-027),
 * because choosing among several is the reader's and nothing is guessed.
 * Nothing is guessed here either: the projects are offered by name, in the
 * order be-01 keeps for this account (most recently opened first), which is
 * the account's own memory of where it was and survives any browser. Opening
 * one remembers it in this browser too, so the next load goes straight there.
 *
 * Create and Import are the other two ways a reader can have a project, so
 * they are here, by the same names as the header's control and the Export /
 * Import menu's.
 */
export function NoProjectOpen({
  projects,
  onOpen,
  onCreate,
  planImport,
  now,
}: NoProjectOpenProps): React.JSX.Element {
  const headingId = useId();
  const recent = projects.slice(0, RECENT_SHOWN);
  return (
    <section
      aria-labelledby={headingId}
      data-no-project-open
      className="bg-card text-card-foreground mx-auto mt-10 w-full max-w-md rounded-lg border p-6 shadow-sm"
    >
      <h2 id={headingId} className="text-base font-semibold">
        No project open
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {recent.length === 0
          ? 'Start a new project, or import a plan exported as JSON.'
          : 'Open one of your projects, start a new one, or import a plan exported as JSON.'}
      </p>
      {recent.length > 0 && (
        <ul aria-label="Your projects" className="m-0 mt-4 flex list-none flex-col p-0">
          {recent.map((project) => (
            <li key={project.id}>
              <Button
                variant="ghost"
                type="button"
                className={cn(
                  MENU_ITEM,
                  'h-auto min-h-9 justify-between gap-3 py-1.5 max-md:min-h-11',
                )}
                onClick={() => {
                  onOpen(project.id);
                }}
              >
                <span className="truncate">{project.name}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {projectCardMeta(project, now).lastOpened}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" className="max-md:h-11" onClick={onCreate}>
          Create new project
        </Button>
        <label
          aria-disabled={planImport.busy}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'cursor-pointer max-md:h-11',
          )}
        >
          Import JSON
          <input
            type="file"
            accept="application/json"
            aria-label="Import JSON"
            className="sr-only"
            disabled={planImport.busy}
            onChange={planImport.chooseFile}
          />
        </label>
      </div>
    </section>
  );
}
